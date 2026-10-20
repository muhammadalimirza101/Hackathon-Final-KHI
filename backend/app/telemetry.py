"""Telemetry: Firestore writes happen in a background thread (never in the user's path) and all
dashboard metrics are kept in memory so /api/metrics does no Firestore reads."""
import asyncio
import logging
import statistics
from collections import Counter, defaultdict, deque
from typing import Optional

from . import config, db

log = logging.getLogger(__name__)

_recent: deque = deque(maxlen=500)          # request summaries, newest last
_agent_stats: dict = defaultdict(lambda: {"calls": 0, "failures": 0, "total_latency_ms": 0})
_latest_eval: dict[str, dict] = {}           # dataset -> latest eval result


def _background(fn, *args):
    """Run a blocking DB write off the event loop; log and swallow errors."""
    async def _go():
        try:
            await asyncio.to_thread(fn, *args)
        except Exception:  # noqa: BLE001
            log.exception("telemetry write failed")
    try:
        asyncio.get_running_loop().create_task(_go())
    except RuntimeError:  # no loop (e.g. CLI): write inline
        try:
            fn(*args)
        except Exception:  # noqa: BLE001
            log.exception("telemetry write failed")


def record_agent_call(agent: str, ok: bool, latency_ms: int):
    s = _agent_stats[agent]
    s["calls"] += 1
    s["failures"] += 0 if ok else 1
    s["total_latency_ms"] += latency_ms
    _background(db.increment_agent_live, _agent_id(agent), ok, latency_ms)


_name_to_id: dict[str, str] = {}


def set_agent_ids(agents: list[dict]):
    _name_to_id.update({a["name"]: a["agent_id"] for a in agents})


def _agent_id(name: str) -> str:
    return _name_to_id.get(name, name)


def record_request(record: dict, persist: bool = True):
    _recent.append(_summary(record))
    if persist:
        _background(db.write_request, record["request_id"], record)


def _summary(r: dict) -> dict:
    steps = r.get("steps", [])
    return {
        "request_id": r.get("request_id"), "query": r.get("query"), "created_at": r.get("created_at"),
        "success": bool(r.get("success")), "unsupported": bool(r.get("unsupported")),
        "total_latency_ms": r.get("total_latency_ms") or 0, "router_overhead_ms": r.get("router_overhead_ms") or 0,
        "fallback_count": r.get("fallback_count") or 0, "replan_count": r.get("replan_count") or 0,
        "intents": [p["intent"] for p in r.get("plan", [])],
        "agents": [s.get("final_agent") for s in steps],
        "replanned_steps": sum(1 for s in steps if s.get("replanned")),
        "replan_recovered": sum(1 for s in steps if s.get("replanned") and s.get("final_agent")),
        "steps": [{"step_id": s.get("step_id"), "intent": s.get("intent"), "final_agent": s.get("final_agent"),
                   "chosen": (s.get("ranked") or [{}])[0].get("agent"),
                   "score": (s.get("ranked") or [{}])[0].get("score"),
                   "attempts": len(s.get("attempts", [])), "replanned": s.get("replanned")} for s in steps],
        "error": r.get("error"),
    }


def load_history():
    """On startup, rebuild in-memory metrics from recent Firestore records so a cold start doesn't show zeros."""
    try:
        for r in reversed(db.get_recent_requests(300)):
            _recent.append(_summary(r))
            for s in r.get("steps", []):
                for a in s.get("attempts", []):
                    st = _agent_stats[a["agent"]]
                    st["calls"] += 1
                    st["failures"] += 0 if a.get("ok") else 1
                    st["total_latency_ms"] += a.get("latency_ms") or 0
        for run in reversed(db.get_eval_runs(30)):
            _latest_eval[run["dataset"]] = run
    except Exception:  # noqa: BLE001
        log.exception("could not load history")


def agent_live(name: str) -> dict:
    s = _agent_stats.get(name, {"calls": 0, "failures": 0, "total_latency_ms": 0})
    return {"calls": s["calls"], "failures": s["failures"],
            "avg_latency_ms": int(s["total_latency_ms"] / s["calls"]) if s["calls"] else None,
            "success_rate": round(1 - s["failures"] / s["calls"], 3) if s["calls"] else None}


def set_latest_eval(dataset: str, result: dict):
    _latest_eval[dataset] = result


def latest_evals() -> dict[str, dict]:
    return dict(_latest_eval)


def recent(limit: int = 50) -> list[dict]:
    return list(reversed(_recent))[:limit]


def _pct(values: list[int], p: float) -> Optional[int]:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return int(statistics.quantiles(values, n=100, method="inclusive")[int(p) - 1])


def metrics(agents: list[dict]) -> dict:
    reqs = [r for r in _recent if not r["unsupported"]]
    n = len(reqs)
    lat = [r["total_latency_ms"] for r in reqs]
    replanned = sum(r["replanned_steps"] for r in reqs)
    recovered = sum(r["replan_recovered"] for r in reqs)
    compound = [r for r in reqs if len(r["intents"]) > 1]
    intents = Counter(i for r in _recent for i in r["intents"])

    per_agent = []
    for a in agents:
        s = _agent_stats.get(a["name"], {"calls": 0, "failures": 0, "total_latency_ms": 0})
        per_agent.append({
            "agent": a["name"], "status": a["status"], "calls": s["calls"], "failures": s["failures"],
            "success_rate": round(1 - s["failures"] / s["calls"], 3) if s["calls"] else None,
            "avg_latency_ms": int(s["total_latency_ms"] / s["calls"]) if s["calls"] else None,
            "registry_success_rate": a["success_rate"], "registry_avg_response_time_ms": a["avg_response_time_ms"],
        })

    ev = _latest_eval
    realistic, original, comp = ev.get("realistic"), ev.get("original"), ev.get("compound")
    return {
        "total_requests": n,
        "success_rate": round(sum(r["success"] for r in reqs) / n, 3) if n else None,
        "p50_latency_ms": _pct(lat, 50),
        "p95_latency_ms": _pct(lat, 95),
        "avg_router_overhead_ms": int(statistics.mean(r["router_overhead_ms"] for r in reqs)) if n else None,
        "fallback_rate": round(sum(1 for r in reqs if r["fallback_count"]) / n, 3) if n else None,
        "replan_count": replanned,
        "replan_recovery_rate": round(recovered / replanned, 3) if replanned else None,
        "live_compound_completion": round(sum(r["success"] for r in compound) / len(compound), 3) if compound else None,
        "routing_accuracy": realistic.get("routing_accuracy") if realistic else (original.get("routing_accuracy") if original else None),
        "routing_accuracy_original": original.get("routing_accuracy") if original else None,
        "compound_completion": comp.get("compound_completion") if comp else None,
        "eval_overhead_ms": realistic.get("avg_overhead_ms") if realistic else None,
        "baseline_routing_accuracy": config.BASELINE_ROUTING_ACCURACY,
        "agents_healthy": sum(1 for a in agents if a["status"] == "active"),
        "agents_total": len(agents),
        "per_agent": per_agent,
        "intent_distribution": dict(intents.most_common()),
        "storage": db.backend_name(),
    }
