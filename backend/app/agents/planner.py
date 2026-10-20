"""Planner: turns a user query into a list of steps (intent classification + task decomposition).

A second instruction mode replans a single failed step (see section 10 of PROJECT_PLAN.md).
"""
import json
import re

from google.adk.agents import LlmAgent
from google.genai import types

from ..llm import model, run_agent
from ..schemas import Plan


def _intent_lines(intent_map: dict) -> str:
    return "\n".join(f"- {k}: {v['description']}" for k, v in intent_map.items())


PLAN_INSTRUCTION = """You are the Planner of an agent orchestrator. Split the user's request into the minimum number of steps.
Each step has exactly one intent from this list:
{intents}
- unsupported: anything not covered above (chit-chat, general knowledge, weather, etc.)

Rules:
- Most requests are ONE step. Only split when the user clearly asks for several different things.
- "task" is a short, self-contained instruction for the specialist agent (include relevant details from the request).
- depends_on lists ids of earlier steps whose output the step needs (e.g. a report about analysis results).
- Ids are s1, s2, s3 ... in execution order.
- Return ONLY JSON: {{"steps": [{{"id": "s1", "intent": "...", "task": "...", "depends_on": []}}]}}

Examples:
"What is the leave policy for Hajj?" -> {{"steps":[{{"id":"s1","intent":"hr_policy","task":"Explain the leave policy for employees going for Hajj","depends_on":[]}}]}}
"Is this code leaking any API keys?" -> {{"steps":[{{"id":"s1","intent":"security_scan","task":"Scan the attached code for exposed API keys and secrets","depends_on":[]}}]}}
"Clean this sales data, find the top products and write a report" -> {{"steps":[{{"id":"s1","intent":"data_cleaning","task":"Clean the attached sales CSV","depends_on":[]}},{{"id":"s2","intent":"sales_report","task":"Find the top products and sales trends in the cleaned data","depends_on":["s1"]}},{{"id":"s3","intent":"report_generation","task":"Write a sales report from the analysis","depends_on":["s2"]}}]}}
"""

REPLAN_INSTRUCTION = """You are the Planner of an agent orchestrator. One step of a plan failed because every agent that could handle it failed or is unavailable.
Propose replacement steps for THAT STEP ONLY, using intents whose agents are currently available. Valid intents:
{intents}
- unsupported: if there is no reasonable way to do it with the available agents.

Rules:
- Prefer 1 replacement step; at most 2. Use ids r1, r2. depends_on may only reference r-ids.
- Choose a different intent than the failed one when the failed intent has no working agents (e.g. use report_generation to rewrite text if translation agents are down, and say in the task that a best-effort answer is acceptable).
- Return ONLY JSON: {{"steps": [{{"id": "r1", "intent": "...", "task": "...", "depends_on": []}}]}}
"""


def build_planner(intent_map: dict) -> LlmAgent:
    return LlmAgent(
        name="Planner",
        model=model,
        instruction=PLAN_INSTRUCTION.format(intents=_intent_lines(intent_map)),
        generate_content_config=types.GenerateContentConfig(temperature=0, max_output_tokens=2000),
    )


def build_replanner(intent_map: dict) -> LlmAgent:
    return LlmAgent(
        name="Replanner",
        model=model,
        instruction=REPLAN_INSTRUCTION.format(intents=_intent_lines(intent_map)),
        generate_content_config=types.GenerateContentConfig(temperature=0, max_output_tokens=2000),
    )


def parse_plan(text: str) -> Plan:
    """Validates the planner's JSON (tolerates code fences / surrounding text). Raises on invalid plans."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"Planner returned no JSON: {text[:200]!r}")
    plan = Plan.model_validate(json.loads(m.group(0)))
    if not plan.steps:
        raise ValueError("Planner returned an empty plan")
    ids = {s.id for s in plan.steps}
    for s in plan.steps:
        s.depends_on = [d for d in s.depends_on if d in ids and d != s.id]
    return plan


async def make_plan(planner: LlmAgent, query: str, has_attachment: bool) -> Plan:
    text = query if not has_attachment else f"{query}\n\n(The user attached a file.)"
    last_err = None
    for _ in range(2):  # retry once on invalid output
        out, _ = await run_agent(planner, text)
        try:
            return parse_plan(out)
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f"Planner failed: {last_err}")


async def make_replan(replanner: LlmAgent, context: dict) -> Plan:
    out, _ = await run_agent(replanner, json.dumps(context, ensure_ascii=False, indent=1))
    return parse_plan(out)
