"""Code-based router: ranks agents for an intent using capability match, success rate, health and speed.

score = 0.5*match + 0.2*success_rate + 0.15*health + 0.15*speed
Agents in maintenance/offline are excluded. Statuses are read from an in-memory cache (no DB call per query).
"""
import json
from typing import Iterable, Optional

from . import config

WEIGHTS = {"match": 0.5, "success": 0.2, "health": 0.15, "speed": 0.15}
HEALTH = {"active": 1.0, "degraded": 0.5}
UNAVAILABLE = {"maintenance", "offline"}


class AgentCache:
    """Agent records keyed by name. Updated whenever the status endpoint changes an agent."""

    def __init__(self, agents: Iterable[dict] = ()):
        self.by_name: dict[str, dict] = {}
        self.load(agents)

    def load(self, agents: Iterable[dict]):
        self.by_name = {a["name"]: dict(a) for a in agents}

    def by_id(self, agent_id: str) -> Optional[dict]:
        return next((a for a in self.by_name.values() if a["agent_id"] == agent_id), None)

    def set_status(self, name: str, status: str):
        self.by_name[name]["status"] = status

    def available(self) -> list[str]:
        return [n for n, a in self.by_name.items() if a["status"] not in UNAVAILABLE]

    def healthy_count(self) -> int:
        return sum(1 for a in self.by_name.values() if a["status"] == "active")


def load_intent_map() -> dict:
    return json.loads(config.INTENT_MAP_FILE.read_text(encoding="utf-8"))


class Router:
    def __init__(self, cache: AgentCache, intent_map: Optional[dict] = None):
        self.cache = cache
        self.intent_map = intent_map if intent_map is not None else load_intent_map()

    def candidates(self, intent: str) -> dict[str, float]:
        return self.intent_map.get(intent, {}).get("agents", {})

    def rank(self, intent: str) -> tuple[list[dict], list[dict]]:
        """Returns (ranked available agents with score breakdown, excluded agents with reason)."""
        agents = self.cache.by_name
        slowest = max((a["avg_response_time_ms"] for a in agents.values()), default=1) or 1
        ranked, excluded = [], []
        for name, match in self.candidates(intent).items():
            a = agents.get(name)
            if a is None:
                continue
            if a["status"] in UNAVAILABLE:
                excluded.append({"agent": name, "reason": a["status"], "match": match})
                continue
            bd = {
                "match": round(match, 3),
                "success": round(a["success_rate"], 3),
                "health": HEALTH.get(a["status"], 0.0),
                "speed": round(1 - a["avg_response_time_ms"] / slowest, 3),
            }
            score = sum(WEIGHTS[k] * v for k, v in bd.items())
            ranked.append({"agent": name, "score": round(score, 3), "breakdown": bd})
        ranked.sort(key=lambda r: r["score"], reverse=True)
        return ranked, excluded

    def primary(self, intent: str) -> Optional[str]:
        c = self.candidates(intent)
        return max(c, key=c.get) if c else None
