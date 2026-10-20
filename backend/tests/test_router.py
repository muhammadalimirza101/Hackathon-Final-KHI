import json

from app import config
from app.router import AgentCache, Router


def make_router():
    agents = json.loads(config.REGISTRY_FILE.read_text(encoding="utf-8"))
    return Router(AgentCache(agents))


def test_legal_falls_back_to_compliance_when_legal_in_maintenance():
    ranked, excluded = make_router().rank("legal_review")
    assert ranked[0]["agent"] == "ComplianceChecker"
    assert excluded == [{"agent": "LegalReview", "reason": "maintenance", "match": 1.0}]


def test_primary_wins_when_healthy():
    ranked, _ = make_router().rank("hr_policy")
    assert ranked[0]["agent"] == "HRAssist"
    assert "LegalReview" not in [r["agent"] for r in ranked]


def test_offline_toggle_reroutes():
    r = make_router()
    r.cache.set_status("SalesInsight", "offline")
    ranked, excluded = r.rank("sales_report")
    assert ranked[0]["agent"] == "ReportWriter"
    assert excluded[0]["agent"] == "SalesInsight"


def test_degraded_primary_still_ranked_first_but_lower_health():
    ranked, _ = make_router().rank("finance_analysis")
    assert ranked[0]["agent"] == "FinanceBot"
    assert ranked[0]["breakdown"]["health"] == 0.5


def test_unknown_intent_has_no_candidates():
    ranked, excluded = make_router().rank("unsupported")
    assert ranked == [] and excluded == []
