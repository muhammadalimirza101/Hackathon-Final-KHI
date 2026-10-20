from app import config
from app.agents import tools


class Ctx:
    """Stand-in for ADK ToolContext: tools only use .state."""
    def __init__(self, attachment: str):
        self.state = {tools.ATTACHMENT_KEY: attachment}


def _read(name: str) -> str:
    return (config.DATA_DIR / name).read_text(encoding="utf-8")


def test_clean_then_analyze_sales_chains_through_state():
    ctx = Ctx(_read("demo_sales.csv"))
    cleaned = tools.clean_csv(ctx)["changes"]
    assert cleaned["duplicates_removed"] == 4
    assert cleaned["rows_after"] == 36
    assert "cleaned_csv" in ctx.state

    sales = tools.analyze_sales(ctx)  # reads the cleaned CSV written to state
    assert sales["rows_with_missing_revenue"] == 0
    assert sales["total_revenue"] > 0
    assert set(sales["revenue_by_region"]) == {"Karachi", "Lahore", "Islamabad", "Peshawar"}
    assert set(sales["monthly_revenue"]) <= {"2026-07", "2026-08", "2026-09", "2026-10"}
    assert "HD Webcam" in [p["product"] for p in sales["top_products"]] or len(sales["top_products"]) == 5


def test_scan_code_finds_secrets_and_unsafe_patterns():
    r = tools.scan_code(Ctx(_read("samples/app_code.py")))
    types = {f["type"] for f in r["findings"]}
    assert "AWS access key" in types
    assert "Use of eval()" in types
    assert any("SQL" in t for t in types)
    assert all("IOSFODNN7" not in f["snippet"] for f in r["findings"])  # secrets are masked


def test_detect_pii_finds_cnic_email_phone():
    r = tools.detect_pii(Ctx(_read("samples/customer_list.csv")))
    assert r["cnic"]["count"] == 3
    assert r["email"]["count"] == 3
    assert r["phone"]["count"] == 3
