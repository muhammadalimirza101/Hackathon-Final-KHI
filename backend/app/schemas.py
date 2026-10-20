"""Pydantic models shared by the planner, orchestrator and API."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

INTENTS = [
    "hr_policy", "legal_review", "compliance_check", "finance_analysis", "sales_report",
    "data_cleaning", "report_generation", "meeting_notes", "translation", "code_help",
    "security_scan", "customer_feedback",
]

Intent = Literal[
    "hr_policy", "legal_review", "compliance_check", "finance_analysis", "sales_report",
    "data_cleaning", "report_generation", "meeting_notes", "translation", "code_help",
    "security_scan", "customer_feedback", "unsupported",
]


class PlanStep(BaseModel):
    id: str = Field(description="Step id like s1, s2")
    intent: Intent
    task: str = Field(description="Self-contained instruction for the specialist agent")
    depends_on: list[str] = Field(default_factory=list, description="Ids of steps whose output this step needs")


class Plan(BaseModel):
    steps: list[PlanStep]


class ChatRequest(BaseModel):
    query: str
    attachment_text: Optional[str] = None
    attachment_name: Optional[str] = None


class AgentStatusUpdate(BaseModel):
    status: Literal["active", "degraded", "maintenance", "offline"]


class EvalRequest(BaseModel):
    dataset: Literal["original", "realistic", "compound"]
    limit: Optional[int] = None


class TraceEvent(BaseModel):
    """Loose envelope for stream events; see section 11 of PROJECT_PLAN.md for each type's fields."""
    type: Literal["plan", "routing", "attempt", "fallback", "replan", "step_result", "done", "error"]
    data: dict[str, Any] = Field(default_factory=dict)
