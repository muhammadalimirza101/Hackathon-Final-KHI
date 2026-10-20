"""Real tools used by worker agents.

The user's attachment lives in ADK session state under "attachment" so the LLM never copies large files
into tool arguments. Tools that transform data (clean_csv) write the result back to state so the
orchestrator can chain it into the next step.
"""
import io
import re
from typing import Optional

import pandas as pd
from google.adk.tools import ToolContext

from .. import db

ATTACHMENT_KEY = "attachment"
ARTIFACT_KEY = "artifact_id"


def _attachment(tool_context: ToolContext) -> str:
    return tool_context.state.get(ATTACHMENT_KEY) or ""


def _read_csv(text: str) -> pd.DataFrame:
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=True, skipinitialspace=False)


def _find_col(df: pd.DataFrame, *keys: str, numeric: bool = False) -> Optional[str]:
    """First column whose name contains one of `keys` (checked in key order). numeric=True requires mostly numbers."""
    for k in keys:
        for c in df.columns:
            if k in c.lower() and "person" not in c.lower() and not c.startswith("_"):
                if numeric and pd.to_numeric(df[c], errors="coerce").notna().mean() < 0.5:
                    continue
                return c
    return None


_ISO = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}")


def _parse_dates(s: pd.Series) -> pd.Series:
    """ISO dates (2026-07-03) are year-month-day; everything else (03/07/2026, Jul 03 2026) is parsed day-first."""
    s = s.astype("string").str.strip()
    iso = s.str.match(_ISO).fillna(False).astype(bool)
    out = pd.to_datetime(s.where(~iso), format="mixed", dayfirst=True, errors="coerce")
    out[iso] = pd.to_datetime(s[iso].str[:10], format="%Y-%m-%d", errors="coerce")
    return out


def clean_csv(tool_context: ToolContext) -> dict:
    """Clean the CSV attached by the user: trim whitespace, normalize text case, remove duplicate rows,
    normalize dates to YYYY-MM-DD and fill missing values. Takes no arguments; reads the attachment itself.

    Returns:
        dict with a summary of every change and a preview of the cleaned rows.
    """
    text = _attachment(tool_context)
    if not text.strip():
        return {"error": "No CSV attachment was provided."}
    df = _read_csv(text)
    changes: dict = {"rows_before": len(df)}

    # 1. trim whitespace everywhere
    trimmed = 0
    for c in df.columns:
        s = df[c]
        stripped = s.str.strip()
        trimmed += int(((s != stripped) & s.notna()).sum())
        df[c] = stripped.replace("", pd.NA)
    changes["cells_trimmed"] = trimmed

    # 2. consistent casing for categorical text: "lahore" / "LAHORE" -> the most common spelling ("Lahore")
    recased = 0
    for c in df.columns:
        s = df[c].dropna()
        if s.empty or pd.to_numeric(s, errors="coerce").notna().mean() > 0.8 or s.str.len().mean() > 40:
            continue
        if "date" in c.lower() or "id" in c.lower() or "email" in c.lower():
            continue
        canonical = s.groupby(s.str.lower()).agg(lambda v: v.value_counts().index[0])
        fixed = df[c].map(lambda v: canonical.get(v.lower(), v) if isinstance(v, str) else v)
        recased += int(((df[c] != fixed) & df[c].notna()).sum())
        df[c] = fixed
    changes["cells_recased"] = recased

    # 3. normalize dates
    date_cols = [c for c in df.columns if "date" in c.lower() or c.lower() in ("day", "month", "time", "timestamp")]
    for c in date_cols:
        parsed = _parse_dates(df[c])
        df[c] = parsed.dt.strftime("%Y-%m-%d").where(parsed.notna(), df[c])
    changes["date_columns_normalized"] = date_cols

    # 4. drop exact duplicates (after normalization so " Lahore" and "Lahore" match)
    before = len(df)
    df = df.drop_duplicates()
    changes["duplicates_removed"] = before - len(df)

    # 5. fill missing: numeric -> median, text -> "Unknown"
    filled = {}
    for c in df.columns:
        n_missing = int(df[c].isna().sum())
        if not n_missing:
            continue
        nums = pd.to_numeric(df[c], errors="coerce")
        if nums.notna().sum() >= max(1, int(0.8 * df[c].notna().sum())):
            # If a product/item column exists, use that product's median (e.g. its unit price)
            key = _find_col(df, "product", "item", "sku")
            if key and key != c:
                group_median = nums.groupby(df[key]).transform("median")
                nums = nums.fillna(group_median)
            nums = nums.fillna(nums.median())
            df[c] = nums.map(lambda v: f"{v:g}")
            filled[c] = f"{n_missing} filled with median"
        else:
            df[c] = df[c].fillna("Unknown")
            filled[c] = f"{n_missing} filled with 'Unknown'"
    changes["missing_values_filled"] = filled
    changes["rows_after"] = len(df)

    cleaned = df.to_csv(index=False)
    tool_context.state[ATTACHMENT_KEY] = cleaned
    tool_context.state["cleaned_csv"] = cleaned
    return {"changes": changes, "columns": list(df.columns), "preview_first_10_rows": df.head(10).to_csv(index=False)}


def analyze_sales(tool_context: ToolContext) -> dict:
    """Analyze the sales CSV attached by the user (or the cleaned version from a previous step): total revenue,
    units, top products, revenue by region and monthly trend. Takes no arguments.

    Returns:
        dict with computed sales metrics.
    """
    text = _attachment(tool_context)
    if not text.strip():
        return {"error": "No sales CSV attachment was provided."}
    df = _read_csv(text)
    for c in df.columns:
        df[c] = df[c].str.strip()

    qty_c = _find_col(df, "qty", "quantity", "units", numeric=True)
    price_c = _find_col(df, "price", numeric=True)
    rev_c = _find_col(df, "revenue", "amount", "total", "sales", numeric=True)
    prod_c = _find_col(df, "product", "item", "sku")
    reg_c = _find_col(df, "region", "city", "branch", "store")
    date_c = _find_col(df, "date")

    if rev_c:
        df["_rev"] = pd.to_numeric(df[rev_c], errors="coerce")
    elif qty_c and price_c:
        df["_rev"] = pd.to_numeric(df[qty_c], errors="coerce") * pd.to_numeric(df[price_c], errors="coerce")
    else:
        return {"error": "Could not find revenue, or quantity and price columns.", "columns": list(df.columns)}
    df["_qty"] = pd.to_numeric(df[qty_c], errors="coerce") if qty_c else 1

    out: dict = {
        "rows_analyzed": len(df),
        "rows_with_missing_revenue": int(df["_rev"].isna().sum()),
        "total_revenue": round(float(df["_rev"].sum()), 2),
        "total_units": int(pd.Series(df["_qty"]).sum()) if qty_c else None,
        "avg_order_value": round(float(df["_rev"].mean()), 2),
    }
    if prod_c:
        g = df.groupby(df[prod_c].str.lower())[["_rev", "_qty"]].sum().sort_values("_rev", ascending=False)
        names = df.groupby(df[prod_c].str.lower())[prod_c].agg(lambda v: v.value_counts().index[0])
        out["top_products"] = [{"product": names[k], "revenue": round(float(r._rev), 2), "units": int(r._qty)} for k, r in g.head(5).iterrows()]
    if reg_c:
        g = df.groupby(df[reg_c].str.title())["_rev"].sum().sort_values(ascending=False)
        out["revenue_by_region"] = {k: round(float(v), 2) for k, v in g.items()}
    if date_c:
        d = _parse_dates(df[date_c])
        g = df.groupby(d.dt.to_period("M"))["_rev"].sum()
        out["monthly_revenue"] = {str(k): round(float(v), 2) for k, v in g.items()}
        if len(g) >= 2:
            first, last = float(g.iloc[0]), float(g.iloc[-1])
            out["trend"] = "up" if last > first else "down" if last < first else "flat"
            out["change_first_to_last_month_pct"] = round((last - first) / first * 100, 1) if first else None
    if rows_missing := out["rows_with_missing_revenue"]:
        out["note"] = f"{rows_missing} rows had missing quantity/price and were excluded. Cleaning the data first improves accuracy."
    return out


def save_report(title: str, markdown: str, tool_context: ToolContext) -> dict:
    """Save a finished report so the user can download it.

    Args:
        title: Short report title.
        markdown: The full report in Markdown.

    Returns:
        dict with the artifact_id and download URL.
    """
    artifact_id = db.save_artifact(title, markdown)
    tool_context.state[ARTIFACT_KEY] = artifact_id
    return {"artifact_id": artifact_id, "download_url": f"/api/artifacts/{artifact_id}"}


_SECRET_PATTERNS = [
    ("OpenAI-style API key", r"sk-[A-Za-z0-9_\-]{16,}"),
    ("AWS access key", r"AKIA[0-9A-Z]{16}"),
    ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
    ("GitHub token", r"gh[pousr]_[A-Za-z0-9]{36,}"),
    ("Private key block", r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----"),
    ("Hardcoded password/secret", r"(?i)(password|passwd|pwd|secret|api_key|token)\s*[:=]\s*['\"][^'\"]{4,}['\"]"),
]
_UNSAFE_PATTERNS = [
    ("Use of eval()", r"\beval\s*\("),
    ("Use of exec()", r"\bexec\s*\("),
    ("SQL built by string concatenation (SQL injection risk)", r"(?i)(select|insert|update|delete)\b[^\n]*['\"]\s*\+"),
    ("SQL built with f-string / format (SQL injection risk)", r"(?i)f['\"][^'\"]*\b(select|insert|update|delete)\b[^'\"]*\{"),
    ("TLS verification disabled", r"verify\s*=\s*False"),
    ("Shell command with shell=True", r"shell\s*=\s*True"),
    ("Unsafe pickle load", r"pickle\.loads?\("),
]


def scan_code(tool_context: ToolContext, code: str = "") -> dict:
    """Scan source code for exposed secrets and unsafe patterns. Uses the attached file if `code` is empty.

    Args:
        code: Optional code to scan. Leave empty to scan the user's attachment.

    Returns:
        dict with a list of findings (line number, type, severity, snippet).
    """
    text = code or _attachment(tool_context)
    if not text.strip():
        return {"error": "No code was provided."}
    findings = []
    for i, line in enumerate(text.splitlines(), 1):
        for name, pat in _SECRET_PATTERNS:
            if re.search(pat, line):
                findings.append({"line": i, "type": name, "severity": "high", "snippet": _mask(line.strip())})
        for name, pat in _UNSAFE_PATTERNS:
            if re.search(pat, line):
                findings.append({"line": i, "type": name, "severity": "medium", "snippet": line.strip()[:160]})
    return {"lines_scanned": len(text.splitlines()), "finding_count": len(findings), "findings": findings}


def _mask(s: str) -> str:
    return re.sub(r"(['\"])([^'\"]{4})[^'\"]*([^'\"]{2})(['\"])", r"\1\2****\3\4", s)[:160]


_PII_PATTERNS = {
    "cnic": r"\b\d{5}-\d{7}-\d\b",
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone": r"(?:\+92[\s-]?|0)3\d{2}[\s-]?\d{7}\b",
}


def detect_pii(tool_context: ToolContext, text: str = "") -> dict:
    """Detect personal data (PII): emails, Pakistani phone numbers and CNIC numbers. Uses the attachment if `text` is empty.

    Args:
        text: Optional text to scan. Leave empty to scan the user's attachment.

    Returns:
        dict with counts per PII type and masked examples.
    """
    body = text or _attachment(tool_context)
    if not body.strip():
        return {"error": "No text was provided."}
    result = {}
    for kind, pat in _PII_PATTERNS.items():
        hits = re.findall(pat, body)
        result[kind] = {"count": len(hits), "examples_masked": [h[:3] + "***" + h[-2:] for h in hits[:3]]}
    result["total_pii_items"] = sum(v["count"] for v in result.values())
    return result


# Which agent gets which tools. Agents not listed are pure LLM agents.
TOOLS_BY_AGENT = {
    "DataCleaner": [clean_csv],
    "SalesInsight": [analyze_sales],
    "ReportWriter": [save_report],
    "SecurityScanner": [scan_code],
    "ComplianceChecker": [detect_pii],
}
