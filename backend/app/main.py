"""FastAPI app: API routes under /api (section 11 of PROJECT_PLAN.md) and the React build at /."""
import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config, db, telemetry
from .orchestrator import Orchestrator
from .router import AgentCache, Router
from .schemas import AgentStatusUpdate, ChatRequest, EvalRequest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("meta_router")

cache = AgentCache()
state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()  # Firestore client is created once here, not per request
    agents = db.get_agents()
    if not agents:
        n = db.seed_agents()
        log.info("seeded %d agents into %s", n, db.backend_name())
        agents = db.get_agents()
    cache.load(agents)
    telemetry.set_agent_ids(agents)
    telemetry.load_history()
    router = Router(cache)
    state["router"] = router
    state["orchestrator"] = Orchestrator(sorted(agents, key=lambda a: a["agent_id"]), cache, router)
    log.info("ready: %d agents, storage=%s, model=%s", len(agents), db.backend_name(), config.MODEL_NAME)
    # The first LLM call after a cold start is slow (lazy imports, connection setup); pay it before a user does.
    warm = asyncio.create_task(_warm_up(state["orchestrator"]))
    yield
    warm.cancel()


async def _warm_up(orch: Orchestrator):
    from .agents.planner import make_plan
    try:
        await make_plan(orch.planner, "What is the leave policy?", False)
        log.info("warm-up call done")
    except Exception as e:  # noqa: BLE001
        log.warning("warm-up failed: %s", e)


app = FastAPI(title="Meta-Router", lifespan=lifespan)


def _agent_view(a: dict) -> dict:
    return {**{k: v for k, v in a.items() if k != "live"}, "live": telemetry.agent_live(a["name"])}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.query.strip():
        raise HTTPException(400, "query is empty")

    async def stream():
        async for ev in state["orchestrator"].run(req.query, req.attachment_text, req.attachment_name):
            yield json.dumps(ev, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/api/agents")
async def list_agents():
    return [_agent_view(a) for a in sorted(cache.by_name.values(), key=lambda a: a["agent_id"])]


@app.patch("/api/agents/{agent_id}/status")
async def set_status(agent_id: str, body: AgentStatusUpdate):
    a = cache.by_id(agent_id) or cache.by_name.get(agent_id)
    if not a:
        raise HTTPException(404, "agent not found")
    cache.set_status(a["name"], body.status)
    db.update_agent(a["agent_id"], {"status": body.status})
    return _agent_view(cache.by_name[a["name"]])


@app.post("/api/agents/reset")
async def reset_agents():
    for a in cache.by_name.values():
        orig = a.get("original_status", a["status"])
        cache.set_status(a["name"], orig)
        db.update_agent(a["agent_id"], {"status": orig})
    return await list_agents()


@app.get("/api/metrics")
async def get_metrics():
    return telemetry.metrics(list(cache.by_name.values()))


@app.get("/api/logs")
async def get_logs(limit: int = 50):
    return telemetry.recent(min(limit, 200))


@app.post("/api/eval/run")
async def eval_run(req: EvalRequest):
    from eval.run_eval import run_eval
    return await run_eval(req.dataset, state["orchestrator"], state["router"], limit=req.limit)


@app.get("/api/eval/latest")
async def eval_latest():
    return telemetry.latest_evals()


@app.get("/api/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, download: bool = False):
    art = db.get_artifact(artifact_id)
    if not art:
        raise HTTPException(404, "artifact not found")
    if download:
        fname = "".join(c if c.isalnum() else "_" for c in art["title"])[:60] or "report"
        return PlainTextResponse(art["content"], media_type="text/markdown",
                                 headers={"Content-Disposition": f'attachment; filename="{fname}.md"'})
    return art


# Sample attachments for the playbooks (read-only whitelist of files in data/).
SAMPLES = {
    "demo_sales.csv": "demo_sales.csv",
    "vendor_contract.txt": "samples/vendor_contract.txt",
    "meeting_notes.txt": "samples/meeting_notes.txt",
    "app_code.py": "samples/app_code.py",
    "customer_list.csv": "samples/customer_list.csv",
    "customer_reviews.txt": "samples/customer_reviews.txt",
}


@app.get("/api/samples/{name}")
async def get_sample(name: str):
    if name not in SAMPLES:
        raise HTTPException(404, "unknown sample")
    return PlainTextResponse((config.DATA_DIR / SAMPLES[name]).read_text(encoding="utf-8"))


@app.api_route("/api/health", methods=["GET", "HEAD"])  # uptime monitors (UptimeRobot) send HEAD
async def health():
    """Uptime probe (pinged every 5 min). Must stay instant and free: no OpenAI or Firestore calls."""
    return {"ok": True}


@app.get("/api/info")
async def info():
    """Static deployment info for the UI header (no external calls)."""
    return {"ok": True, "storage": db.backend_name(), "model": config.MODEL_NAME, "llm_key_set": bool(config.OPENAI_API_KEY)}


# ---- frontend (built React app) ----
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
