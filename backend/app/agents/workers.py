"""Builds one ADK LlmAgent per registry entry. Instructions come from the (enriched) description and capabilities."""
from google.adk.agents import LlmAgent
from google.genai import types

from ..llm import model
from .tools import TOOLS_BY_AGENT

OUT_OF_SCOPE = "OUT_OF_SCOPE"

# Short tool-usage hints so each agent actually uses its real tool.
TOOL_HINTS = {
    "DataCleaner": "When the user attached a CSV, ALWAYS call clean_csv first, then report exactly what changed (duplicates removed, values filled, dates normalized) using the tool result.",
    "SalesInsight": "When sales data is attached, ALWAYS call analyze_sales and base every number on its result. Never invent figures.",
    "ReportWriter": "Write the report in Markdown (headings, bullet points, under 300 words), then ALWAYS call save_report(title, markdown) with the full report. After saving, reply with ONE line only: 'Saved report: <title>'. Do not repeat the report.",
    "SecurityScanner": "When code is attached or included, ALWAYS call scan_code and explain each finding and how to fix it.",
    "ComplianceChecker": "When the task involves personal data or an attached file, call detect_pii and use its counts. Mention CNIC numbers explicitly if found.",
}


def build_instruction(agent: dict) -> str:
    caps = ", ".join(agent["capabilities"])
    parts = [
        f"You are {agent['name']}, a specialist agent in an organization. {agent['description']}",
        f"Your capabilities: {caps}.",
        "You receive one task from an orchestrator. The input may include outputs of earlier steps and the user's attachment; use them.",
        "Answer directly and concisely: under 180 words, bullet points preferred, no preamble. Do not ask follow-up questions; make reasonable assumptions and state them.",
    ]
    if hint := TOOL_HINTS.get(agent["name"]):
        parts.append(hint)
    parts.append(f"If the task is outside your capabilities, reply only with: {OUT_OF_SCOPE}: <reason>")
    return "\n".join(parts)


def build_workers(registry: list[dict]) -> dict[str, LlmAgent]:
    workers = {}
    for a in registry:
        workers[a["name"]] = LlmAgent(
            name=a["name"],
            model=model,
            description=a["description"],
            instruction=build_instruction(a),
            tools=TOOLS_BY_AGENT.get(a["name"], []),
            generate_content_config=types.GenerateContentConfig(
                temperature=0.2, max_output_tokens=1800 if a["name"] == "ReportWriter" else 900),
        )
    return workers
