"""Orchestrator: plan -> route -> run steps (parallel when independent) -> chain outputs -> fallback -> replan.

`Orchestrator.run()` is an async generator of trace events (see section 11 of PROJECT_PLAN.md).
Plain async Python class (plan "Plan B") that calls the ADK planner and workers through run_agent().
"""
import asyncio
import time
import uuid
from typing import Any, AsyncIterator, Optional

from . import config, db, telemetry
from .agents.planner import build_planner, build_replanner, make_plan, make_replan
from .agents.tools import ARTIFACT_KEY, ATTACHMENT_KEY
from .agents.workers import OUT_OF_SCOPE, build_workers
from .llm import run_agent
from .router import AgentCache, Router
from .schemas import PlanStep

# Agents whose tools read the attachment themselves: they only need a preview in the prompt.
TOOL_READERS = {"DataCleaner", "SalesInsight", "SecurityScanner", "ComplianceChecker"}
# Agents that produce long outputs get a longer timeout than the default step timeout.
SLOW_AGENTS = {"ReportWriter": 2.5, "DataCleaner": 1.5, "SalesInsight": 1.5, "SecurityScanner": 1.5, "ComplianceChecker": 1.5}
MAX_UPSTREAM_CHARS = 4000
MAX_ATTACHMENT_CHARS = 12000
UNSUPPORTED_REPLY = ("Sorry, that request is outside what our specialist agents handle "
                     "(HR, legal, compliance, finance, sales, data cleaning, reports, meetings, translation, code, security, customer feedback).")


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


class StepState:
    def __init__(self, step: PlanStep):
        self.step = step
        self.ok = False
        self.output = ""
        self.agent: Optional[str] = None
        self.state: dict[str, Any] = {}
        self.record: dict[str, Any] = {"step_id": step.id, "intent": step.intent, "task": step.task,
                                       "ranked": [], "excluded": [], "attempts": [], "final_agent": None,
                                       "replanned": False, "replan_reason": None, "output_preview": ""}


class Orchestrator:
    def __init__(self, registry: list[dict], cache: AgentCache, router: Router):
        self.cache = cache
        self.router = router
        self.workers = build_workers(registry)
        self.planner = build_planner(router.intent_map)
        self.replanner = build_replanner(router.intent_map)

    async def run(self, query: str, attachment: Optional[str] = None, attachment_name: Optional[str] = None) -> AsyncIterator[dict]:
        queue: asyncio.Queue = asyncio.Queue()
        task = asyncio.create_task(self._execute(query, attachment, attachment_name, queue.put_nowait))
        try:
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                yield ev
        finally:
            if not task.done():
                task.cancel()

    # ------------------------------------------------------------------ main flow
    async def _execute(self, query: str, attachment: Optional[str], attachment_name: Optional[str], emit):
        request_id = uuid.uuid4().hex[:12]
        t_start = time.perf_counter()
        ctx = {"overhead_ms": 0, "fallbacks": 0, "replans": 0}
        record: dict[str, Any] = {"request_id": request_id, "query": query, "created_at": db.now_iso(),
                                  "attachment_name": attachment_name, "plan": [], "steps": []}
        try:
            t = time.perf_counter()
            plan = await asyncio.wait_for(make_plan(self.planner, query, bool(attachment)), config.PLANNER_TIMEOUT_S)
            ctx["planner_ms"] = _ms(t)
            ctx["overhead_ms"] += ctx["planner_ms"]
            steps = plan.steps
            record["plan"] = [s.model_dump() for s in steps]
            emit({"type": "plan", "request_id": request_id, "steps": record["plan"], "planner_ms": ctx["planner_ms"]})

            if all(s.intent == "unsupported" for s in steps):
                return self._finish(emit, record, ctx, t_start, success=True, final_output=UNSUPPORTED_REPLY, states=[], unsupported=True)

            states = {s.id: StepState(s) for s in steps}
            done: set[str] = set()
            while len(done) < len(states):
                ready = [st for sid, st in states.items() if sid not in done and all(d in done for d in st.step.depends_on)]
                if not ready:  # cyclic deps from a bad plan: run the rest in order
                    ready = [st for sid, st in states.items() if sid not in done][:1]
                await asyncio.gather(*(self._run_step(st, states, query, attachment, emit, ctx) for st in ready))
                done.update(st.step.id for st in ready)

            ordered = [states[s.id] for s in steps]
            success = all(st.ok for st in ordered)
            sinks = [st for st in ordered if not any(st.step.id in o.step.depends_on for o in ordered)]
            final = "\n\n".join(st.output for st in sinks if st.ok and st.output)
            failed = [st for st in ordered if not st.ok]
            if failed:
                notes = "\n".join(f"- Step {st.step.id} ({st.step.intent}) could not be completed: {st.record.get('failure_reason') or 'all agents failed'}" for st in failed)
                done_steps = [st for st in ordered if st.ok]
                if not final and done_steps:  # every final step failed: show the last thing that worked
                    final = done_steps[-1].output
                final = (final + "\n\n" if final else "") + "**Partial result.**\n" + notes
            self._finish(emit, record, ctx, t_start, success=success, final_output=final, states=ordered)
        except Exception as e:  # noqa: BLE001  never crash the stream
            emit({"type": "error", "message": f"{type(e).__name__}: {e}"})
            record.update({"success": False, "error": str(e), "total_latency_ms": _ms(t_start),
                           "router_overhead_ms": ctx["overhead_ms"], "fallback_count": ctx["fallbacks"], "replan_count": ctx["replans"]})
            telemetry.record_request(record)
        finally:
            emit(None)

    def _finish(self, emit, record, ctx, t_start, success, final_output, states, unsupported=False):
        total = _ms(t_start)
        artifact_id = next((st.state.get(ARTIFACT_KEY) for st in reversed(states) if st.state.get(ARTIFACT_KEY)), None)
        record.update({"success": success, "unsupported": unsupported, "total_latency_ms": total,
                       "router_overhead_ms": ctx["overhead_ms"], "planner_ms": ctx.get("planner_ms"),
                       "fallback_count": ctx["fallbacks"], "replan_count": ctx["replans"],
                       "steps": [st.record for st in states], "final_output_preview": final_output[:500],
                       "artifact_id": artifact_id})
        emit({"type": "done", "request_id": record["request_id"], "success": success, "total_latency_ms": total,
              "router_overhead_ms": ctx["overhead_ms"], "fallback_count": ctx["fallbacks"], "replan_count": ctx["replans"],
              "final_output": final_output, "artifact_id": artifact_id})
        telemetry.record_request(record)

    # ------------------------------------------------------------------ one step
    async def _run_step(self, st: StepState, states: dict[str, StepState], query: str, attachment: Optional[str], emit, ctx):
        step = st.step
        deps = [states[d] for d in step.depends_on if d in states]
        if step.intent == "unsupported":
            st.record["failure_reason"] = "request part is outside supported intents"
            emit({"type": "step_result", "step_id": step.id, "agent": None, "ok": False, "latency_ms": 0,
                  "output": UNSUPPORTED_REPLY, "artifact_id": None})
            return
        if failed_deps := [d.step.id for d in deps if not d.ok]:
            st.record["failure_reason"] = f"depends on failed step(s) {', '.join(failed_deps)}"
            emit({"type": "step_result", "step_id": step.id, "agent": None, "ok": False, "latency_ms": 0,
                  "output": st.record["failure_reason"], "artifact_id": None})
            return

        # Chained data: a cleaned CSV from an upstream step replaces the raw attachment.
        step_attachment = next((d.state.get("cleaned_csv") for d in reversed(deps) if d.state.get("cleaned_csv")), None) or attachment
        upstream = [(d.step.id, d.agent, d.output) for d in deps]

        ok = await self._try_agents(st, step, upstream, step_attachment, emit, ctx)
        if not ok and ctx["replans"] < config.MAX_REPLANS_PER_QUERY:
            ok = await self._replan(st, query, states, upstream, step_attachment, emit, ctx)

        st.record["output_preview"] = st.output[:500]
        if not ok and not st.record.get("failure_reason"):
            st.record["failure_reason"] = "every capable agent failed or is unavailable"
        emit({"type": "step_result", "step_id": step.id, "agent": st.agent, "ok": ok,
              "latency_ms": sum(a["latency_ms"] for a in st.record["attempts"]),
              "output": st.output if ok else st.record["failure_reason"], "artifact_id": st.state.get(ARTIFACT_KEY)})

    async def _try_agents(self, st: StepState, step: PlanStep, upstream, attachment, emit, ctx, emit_step_id: Optional[str] = None) -> bool:
        sid = emit_step_id or step.id
        t = time.perf_counter()
        ranked, excluded = self.router.rank(step.intent)
        ctx["overhead_ms"] += _ms(t)
        st.record["ranked"] += ranked
        st.record["excluded"] += excluded
        emit({"type": "routing", "step_id": sid, "intent": step.intent, "chosen": ranked[0]["agent"] if ranked else None,
              "ranked": ranked, "excluded": excluded})

        # Better-matching agents skipped because of their status count as (zero-cost) fallbacks.
        if ranked:
            for ex in excluded:
                if ex["match"] > ranked[0]["breakdown"]["match"]:
                    ctx["fallbacks"] += 1
                    emit({"type": "fallback", "step_id": sid, "from": ex["agent"], "to": ranked[0]["agent"], "reason": ex["reason"]})

        candidates = ranked[: config.MAX_ATTEMPTS_PER_STEP]
        for i, cand in enumerate(candidates):
            name = cand["agent"]
            emit({"type": "attempt", "step_id": sid, "agent": name, "attempt": i + 1})
            ok, output, state, err, latency = await self._call_worker(name, step, upstream, attachment)
            st.record["attempts"].append({"agent": name, "ok": ok, "latency_ms": latency, "error": err})
            telemetry.record_agent_call(name, ok, latency)
            if ok:
                st.ok, st.output, st.agent, st.state = True, output, name, state
                st.record["final_agent"] = name
                return True
            nxt = candidates[i + 1]["agent"] if i + 1 < len(candidates) else None
            ctx["fallbacks"] += 1
            emit({"type": "fallback", "step_id": sid, "from": name, "to": nxt, "reason": err})
        if not ranked:
            st.record["failure_reason"] = f"no available agent for intent '{step.intent}'" + (
                f" ({', '.join(e['agent'] + ': ' + e['reason'] for e in excluded)})" if excluded else "")
        return False

    async def _call_worker(self, name: str, step: PlanStep, upstream, attachment: Optional[str]):
        agent = self.workers[name]
        prompt = self._build_input(name, step, upstream, attachment)
        timeout = config.STEP_TIMEOUT_S * SLOW_AGENTS.get(name, 1.0)
        t = time.perf_counter()
        try:
            output, state = await asyncio.wait_for(run_agent(agent, prompt, {ATTACHMENT_KEY: attachment or ""}), timeout)
        except asyncio.TimeoutError:
            return False, "", {}, f"timeout after {timeout:.0f}s", _ms(t)
        except Exception as e:  # noqa: BLE001
            return False, "", {}, f"{type(e).__name__}: {str(e)[:200]}", _ms(t)
        latency = _ms(t)
        if not output:
            return False, "", {}, "empty output", latency
        if output.lstrip().upper().startswith(OUT_OF_SCOPE):
            return False, "", {}, output.strip()[:200], latency
        if state.get(ARTIFACT_KEY):  # ReportWriter saved a report: show the saved version
            art = db.get_artifact(state[ARTIFACT_KEY])
            if art and len(art["content"]) > len(output):
                output = art["content"]
        return True, output, state, None, latency

    @staticmethod
    def _build_input(name: str, step: PlanStep, upstream, attachment: Optional[str]) -> str:
        parts = [f"TASK: {step.task}"]
        for sid, agent, out in upstream:
            parts.append(f"\n--- Output of earlier step {sid} ({agent}) ---\n{out[:MAX_UPSTREAM_CHARS]}")
        if attachment:
            if name in TOOL_READERS:
                parts.append(f"\n--- User attachment ({len(attachment)} chars, available to your tool; preview) ---\n{attachment[:1200]}")
            else:
                parts.append(f"\n--- User attachment ---\n{attachment[:MAX_ATTACHMENT_CHARS]}")
        return "\n".join(parts)

    # ------------------------------------------------------------------ replanning
    async def _replan(self, st: StepState, query: str, states: dict[str, StepState], upstream, attachment, emit, ctx) -> bool:
        step = st.step
        ctx["replans"] += 1
        st.record["replanned"] = True
        reason = st.record.get("failure_reason") or "all agents for this step failed"
        st.record["replan_reason"] = reason
        context = {
            "original_query": query,
            "failed_step": step.model_dump(),
            "failures": [{"agent": a["agent"], "error": a["error"]} for a in st.record["attempts"]] +
                        [{"agent": e["agent"], "error": e["reason"]} for e in st.record["excluded"]],
            "available_agents": {n: self.cache.by_name[n]["description"] for n in self.cache.available()},
            "completed_steps": {sid: s.output[:1500] for sid, s in states.items() if s.ok},
        }
        t = time.perf_counter()
        try:
            new_plan = await asyncio.wait_for(make_replan(self.replanner, context), config.PLANNER_TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            ctx["overhead_ms"] += _ms(t)
            st.record["failure_reason"] = f"{reason}; replanning failed ({type(e).__name__})"
            emit({"type": "replan", "step_id": step.id, "reason": reason, "new_steps": [], "error": str(e)[:200]})
            return False
        ctx["overhead_ms"] += _ms(t)
        new_steps = [s for s in new_plan.steps if s.intent != "unsupported"][:2]
        emit({"type": "replan", "step_id": step.id, "reason": reason, "new_steps": [s.model_dump() for s in new_plan.steps]})
        if not new_steps:
            st.record["failure_reason"] = f"{reason}; no alternative plan possible"
            return False

        # Run replacement steps in order, chaining their outputs. No further replans for this step.
        chain = list(upstream)
        for ns in new_steps:
            sub = StepState(ns)
            ok = await self._try_agents(sub, ns, chain, attachment, emit, ctx, emit_step_id=f"{step.id}.{ns.id}")
            st.record["attempts"] += sub.record["attempts"]
            if not ok:
                st.record["failure_reason"] = f"{reason}; replacement step {ns.id} ({ns.intent}) also failed"
                return False
            chain.append((f"{step.id}.{ns.id}", sub.agent, sub.output))
            st.output, st.agent, st.state = sub.output, sub.agent, sub.state
        st.ok = True
        st.record["final_agent"] = st.agent
        return True
