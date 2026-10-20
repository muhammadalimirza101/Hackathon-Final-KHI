"""Evaluation for the three PS-05 criteria.

- original / realistic: routing accuracy (Planner intent vs. label) and agent accuracy (chosen agent = best available
  agent for the true intent). The realistic run also measures latency overhead (direct worker call vs. full orchestrator).
- compound: full pipeline on multi-step queries; success = every step succeeded and the intent sequence matches.

CLI (from backend/):  python -m eval.run_eval realistic [--limit N]
"""
import asyncio
import csv
import statistics
import sys
import time
from collections import defaultdict
from typing import Optional

from app import config, db, telemetry
from app.agents.planner import make_plan
from app.schemas import PlanStep

CONCURRENCY = 5
OVERHEAD_SAMPLES = 10


def _rows(path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _load(dataset: str) -> list[dict]:
    if dataset == "original":
        return [{"query": r["raw_query"], "intent": r["detected_intent"]} for r in _rows(config.ORIGINAL_QUERIES_FILE)]
    if dataset == "realistic":
        return _rows(config.DATA_DIR / "test_single.csv")
    return _rows(config.DATA_DIR / "test_compound.csv")


async def _gather_limited(coros, limit: int):
    sem = asyncio.Semaphore(limit)

    async def one(c):
        async with sem:
            return await c
    return await asyncio.gather(*(one(c) for c in coros))


async def _routing_eval(rows: list[dict], orch, router) -> dict:
    async def classify(row):
        try:
            plan = await make_plan(orch.planner, row["query"], False)
            pred = plan.steps[0].intent
        except Exception as e:  # noqa: BLE001
            pred = f"error:{type(e).__name__}"
        expected_agent = (router.rank(row["intent"])[0] or [{}])[0].get("agent")
        ranked = router.rank(pred)[0] if not pred.startswith("error") else []
        chosen = ranked[0]["agent"] if ranked else None
        return {"query": row["query"], "intent": row["intent"], "predicted": pred,
                "correct": pred == row["intent"], "chosen_agent": chosen, "expected_agent": expected_agent,
                "agent_correct": chosen is not None and chosen == expected_agent}

    results = await _gather_limited([classify(r) for r in rows], CONCURRENCY)
    per = defaultdict(lambda: [0, 0])
    for r in results:
        per[r["intent"]][0] += r["correct"]
        per[r["intent"]][1] += 1
    n = len(results)
    return {
        "routing_accuracy": round(sum(r["correct"] for r in results) / n, 3) if n else None,
        "agent_accuracy": round(sum(r["agent_correct"] for r in results) / n, 3) if n else None,
        "per_intent": {k: {"correct": c, "total": t, "accuracy": round(c / t, 3)} for k, (c, t) in sorted(per.items())},
        "mistakes": [r for r in results if not r["correct"]][:30],
    }


async def _overhead_eval(rows: list[dict], orch, router) -> dict:
    """Direct call to the best available worker for the true intent vs. the full orchestrator."""
    samples = []
    for row in rows[:OVERHEAD_SAMPLES]:
        ranked, _ = router.rank(row["intent"])
        if not ranked:
            continue
        step = PlanStep(id="s1", intent=row["intent"], task=row["query"])
        t = time.perf_counter()
        ok, *_ = await orch._call_worker(ranked[0]["agent"], step, [], None)
        direct = int((time.perf_counter() - t) * 1000)
        t = time.perf_counter()
        done = None
        async for ev in orch.run(row["query"]):
            if ev["type"] == "done":
                done = ev
        full = int((time.perf_counter() - t) * 1000)
        if ok and done:
            samples.append({"query": row["query"], "direct_ms": direct, "orchestrated_ms": full, "overhead_ms": full - direct,
                            "router_overhead_ms": done["router_overhead_ms"]})
    return {
        "avg_overhead_ms": int(statistics.mean(s["overhead_ms"] for s in samples)) if samples else None,
        "avg_router_overhead_ms": int(statistics.mean(s["router_overhead_ms"] for s in samples)) if samples else None,
        "avg_direct_ms": int(statistics.mean(s["direct_ms"] for s in samples)) if samples else None,
        "avg_orchestrated_ms": int(statistics.mean(s["orchestrated_ms"] for s in samples)) if samples else None,
        "overhead_samples": samples,
    }


async def _compound_eval(rows: list[dict], orch) -> dict:
    async def run_one(row):
        att = None
        if row.get("attachment"):
            att = (config.DATA_DIR / row["attachment"]).read_text(encoding="utf-8")
        expected = row["expected_intents"].split(">")
        plan, done, step_ok = None, None, {}
        t = time.perf_counter()
        async for ev in orch.run(row["query"], att, row.get("attachment") or None):
            if ev["type"] == "plan":
                plan = [s["intent"] for s in ev["steps"]]
            elif ev["type"] == "step_result":
                step_ok[ev["step_id"]] = ev["ok"]
            elif ev["type"] == "done":
                done = ev
        latency = int((time.perf_counter() - t) * 1000)
        seq_ok = plan == expected
        all_ok = bool(done and done["success"])
        return {"query": row["query"], "expected": expected, "planned": plan, "sequence_match": seq_ok,
                "all_steps_ok": all_ok, "success": seq_ok and all_ok, "latency_ms": latency,
                "fallbacks": done["fallback_count"] if done else None, "replans": done["replan_count"] if done else None}

    results = await _gather_limited([run_one(r) for r in rows], 2)
    n = len(results)
    return {
        "compound_completion": round(sum(r["success"] for r in results) / n, 3) if n else None,
        "steps_completed_rate": round(sum(r["all_steps_ok"] for r in results) / n, 3) if n else None,
        "sequence_match_rate": round(sum(r["sequence_match"] for r in results) / n, 3) if n else None,
        "avg_latency_ms": int(statistics.mean(r["latency_ms"] for r in results)) if n else None,
        "results": results,
    }


async def run_eval(dataset: str, orch, router, limit: Optional[int] = None) -> dict:
    rows = _load(dataset)
    if limit:
        rows = rows[:limit]
    t = time.perf_counter()
    result = {"dataset": dataset, "created_at": db.now_iso(), "n": len(rows), "model": config.MODEL_NAME}
    if dataset == "compound":
        result.update(await _compound_eval(rows, orch))
    else:
        result.update(await _routing_eval(rows, orch, router))
        if dataset == "realistic":
            result.update(await _overhead_eval(rows, orch, router))
    result["duration_s"] = round(time.perf_counter() - t, 1)
    result["baseline_routing_accuracy"] = config.BASELINE_ROUTING_ACCURACY
    result["run_id"] = await asyncio.to_thread(db.write_eval_run, result)
    telemetry.set_latest_eval(dataset, result)
    return result


if __name__ == "__main__":
    import json

    from app.orchestrator import Orchestrator
    from app.router import AgentCache, Router

    ds = sys.argv[1] if len(sys.argv) > 1 else "realistic"
    lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    agents = db.get_agents() or db.load_registry_file()
    cache = AgentCache(agents)
    rt = Router(cache)
    out = asyncio.run(run_eval(ds, Orchestrator(agents, cache, rt), rt, limit=lim))
    print(json.dumps({k: v for k, v in out.items() if k not in ("mistakes", "results", "overhead_samples")}, indent=2))
