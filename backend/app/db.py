"""Firestore access. Falls back to an in-memory store when GOOGLE_CLOUD_PROJECT is not set (local dev without GCP)."""
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from . import config

log = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _MemoryStore:
    def __init__(self):
        self.cols: dict[str, dict[str, dict]] = {}

    def set(self, col: str, doc_id: str, data: dict, merge: bool = False):
        c = self.cols.setdefault(col, {})
        if merge and doc_id in c:
            c[doc_id].update(data)
        else:
            c[doc_id] = dict(data)

    def get(self, col: str, doc_id: str) -> Optional[dict]:
        return self.cols.get(col, {}).get(doc_id)

    def all(self, col: str) -> list[dict]:
        return list(self.cols.get(col, {}).values())


_client = None
_mem = _MemoryStore()


def init():
    """Create the Firestore client once (called at startup).

    Credentials, in order:
    1. FIREBASE_CREDENTIALS_JSON env var holding the full service-account JSON (Hugging Face Spaces plan B).
    2. Application Default Credentials: GOOGLE_APPLICATION_CREDENTIALS (Render secret file) or
       `gcloud auth application-default login` on a laptop.
    The project always comes from GOOGLE_CLOUD_PROJECT. Credential contents are never logged.
    """
    global _client
    if not config.USE_FIRESTORE or _client is not None:
        return
    from google.cloud import firestore
    creds = None
    raw = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if raw:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_info(json.loads(raw))
        log.info("Firestore: using service account from FIREBASE_CREDENTIALS_JSON")
    else:
        log.info("Firestore: using Application Default Credentials")
    _client = firestore.Client(project=config.GOOGLE_CLOUD_PROJECT, credentials=creds)


def _fs():
    if not config.USE_FIRESTORE:
        return None
    if _client is None:
        init()
    return _client


def backend_name() -> str:
    return "firestore" if config.USE_FIRESTORE else "memory"


# ---- agents ----

def load_registry_file() -> list[dict]:
    return json.loads(config.REGISTRY_FILE.read_text(encoding="utf-8"))


def seed_agents(force: bool = False) -> int:
    """Load the enriched registry into the agents collection. Keeps original_status for the reset button."""
    existing = {a["agent_id"] for a in get_agents()}
    n = 0
    for a in load_registry_file():
        if a["agent_id"] in existing and not force:
            continue
        doc = {**a, "original_status": a["status"], "live": {"calls": 0, "failures": 0, "total_latency_ms": 0}}
        _set("agents", a["agent_id"], doc)
        n += 1
    return n


def get_agents() -> list[dict]:
    fs = _fs()
    if fs is None:
        return _mem.all("agents")
    return [d.to_dict() for d in fs.collection("agents").stream()]


def update_agent(agent_id: str, fields: dict):
    _set("agents", agent_id, fields, merge=True)


def increment_agent_live(agent_id: str, ok: bool, latency_ms: int):
    fs = _fs()
    if fs is None:
        a = _mem.get("agents", agent_id)
        if a:
            live = a.setdefault("live", {"calls": 0, "failures": 0, "total_latency_ms": 0})
            live["calls"] += 1
            live["failures"] += 0 if ok else 1
            live["total_latency_ms"] += latency_ms
        return
    from google.cloud import firestore
    fs.collection("agents").document(agent_id).set({"live": {
        "calls": firestore.Increment(1),
        "failures": firestore.Increment(0 if ok else 1),
        "total_latency_ms": firestore.Increment(latency_ms),
    }}, merge=True)


# ---- requests / eval / artifacts ----

def write_request(request_id: str, record: dict):
    _set("requests", request_id, record)


def get_recent_requests(limit: int = 50) -> list[dict]:
    fs = _fs()
    if fs is None:
        return sorted(_mem.all("requests"), key=lambda r: r.get("created_at", ""), reverse=True)[:limit]
    from google.cloud import firestore
    q = fs.collection("requests").order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit)
    return [d.to_dict() for d in q.stream()]


def write_eval_run(record: dict) -> str:
    run_id = uuid.uuid4().hex[:12]
    _set("eval_runs", run_id, {**record, "run_id": run_id})
    return run_id


def get_eval_runs(limit: int = 30) -> list[dict]:
    fs = _fs()
    if fs is None:
        return sorted(_mem.all("eval_runs"), key=lambda r: r.get("created_at", ""), reverse=True)[:limit]
    from google.cloud import firestore
    q = fs.collection("eval_runs").order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit)
    return [d.to_dict() for d in q.stream()]


def save_artifact(title: str, content: str) -> str:
    artifact_id = uuid.uuid4().hex[:12]
    _set("artifacts", artifact_id, {"artifact_id": artifact_id, "title": title, "content": content, "created_at": now_iso()})
    return artifact_id


def get_artifact(artifact_id: str) -> Optional[dict]:
    fs = _fs()
    if fs is None:
        return _mem.get("artifacts", artifact_id)
    snap = fs.collection("artifacts").document(artifact_id).get()
    return snap.to_dict() if snap.exists else None


def _set(col: str, doc_id: str, data: dict[str, Any], merge: bool = False):
    fs = _fs()
    if fs is None:
        _mem.set(col, doc_id, data, merge=merge)
    else:
        fs.collection(col).document(doc_id).set(data, merge=merge)
