"""Orchestrator control flow with a scripted fake LLM (no API calls): chaining, fallback, replan, partial results."""
import asyncio
import json

import pytest

from app import config, orchestrator as orch_mod
from app.agents import planner as planner_mod
from app.router import AgentCache, Router


def _plan(*steps):
    return json.dumps({"steps": [{"id": i, "intent": it, "task": f"do {it}", "depends_on": d} for i, it, d in steps]})


def make(script_plan, worker_reply, replan=None):
    """script_plan: planner JSON. worker_reply(agent_name, prompt) -> text. replan: replanner JSON."""
    agents = json.loads(config.REGISTRY_FILE.read_text(encoding="utf-8"))
    cache = AgentCache(agents)
    o = orch_mod.Orchestrator(agents, cache, Router(cache))
    prompts = {}

    async def fake_run_agent(agent, text, state=None):
        if agent.name == "Planner":
            return script_plan, {}
        if agent.name == "Replanner":
            return replan or '{"steps": []}', {}
        prompts.setdefault(agent.name, []).append(text)
        return worker_reply(agent.name, text), dict(state or {})

    orch_mod.run_agent = fake_run_agent
    planner_mod.run_agent = fake_run_agent
    return o, prompts


def collect(o, query="q"):
    async def go():
        return [ev async for ev in o.run(query)]
    return asyncio.run(go())


@pytest.fixture(autouse=True)
def no_telemetry(monkeypatch):
    monkeypatch.setattr(orch_mod.telemetry, "record_request", lambda r: None)
    monkeypatch.setattr(orch_mod.telemetry, "record_agent_call", lambda *a: None)


def test_compound_chain_passes_outputs_downstream():
    o, prompts = make(_plan(("s1", "data_cleaning", []), ("s2", "sales_report", ["s1"]), ("s3", "report_generation", ["s2"])),
                      lambda a, p: f"{a} RESULT")
    evs = collect(o)
    done = evs[-1]
    assert done["type"] == "done" and done["success"]
    assert "DataCleaner RESULT" in prompts["SalesInsight"][0]
    assert "SalesInsight RESULT" in prompts["ReportWriter"][0]
    assert done["final_output"] == "ReportWriter RESULT"


def test_maintenance_agent_skipped_with_fallback_event():
    o, prompts = make(_plan(("s1", "legal_review", [])), lambda a, p: "ok")
    evs = collect(o)
    fb = [e for e in evs if e["type"] == "fallback"]
    assert fb[0]["from"] == "LegalReview" and fb[0]["to"] == "ComplianceChecker" and fb[0]["reason"] == "maintenance"
    assert "LegalReview" not in prompts
    assert evs[-1]["success"]


def test_out_of_scope_moves_to_next_agent():
    o, _ = make(_plan(("s1", "hr_policy", [])),
                lambda a, p: "OUT_OF_SCOPE: not mine" if a == "HRAssist" else f"{a} answered")
    evs = collect(o)
    result = next(e for e in evs if e["type"] == "step_result")
    assert result["ok"] and result["agent"] == "ComplianceChecker"  # LegalReview is in maintenance


def test_replan_when_all_agents_unavailable():
    o, _ = make(_plan(("s1", "translation", [])), lambda a, p: f"{a} best effort",
                replan=_plan(("r1", "report_generation", [])))
    # TranslationAgent is in maintenance and ReportWriter offline, so the step's agents are all unavailable.
    # The replacement report_generation step then goes to MeetingSummarizer.
    o.cache.set_status("ReportWriter", "offline")
    evs = collect(o)
    assert any(e["type"] == "replan" for e in evs)
    result = next(e for e in evs if e["type"] == "step_result")
    assert result["ok"] and result["agent"] == "MeetingSummarizer"
    assert evs[-1]["replan_count"] == 1


def test_partial_result_when_replan_fails():
    o, _ = make(_plan(("s1", "hr_policy", []), ("s2", "translation", ["s1"])), lambda a, p: f"{a} done")
    o.cache.set_status("ReportWriter", "offline")
    evs = collect(o)
    done = evs[-1]
    assert done["type"] == "done" and not done["success"]
    assert "HRAssist done" in done["final_output"] and "Partial result" in done["final_output"]


def test_unsupported_is_politely_declined():
    o, prompts = make(_plan(("s1", "unsupported", [])), lambda a, p: "x")
    evs = collect(o)
    assert evs[-1]["success"] and "outside" in evs[-1]["final_output"]
    assert prompts == {}
