"""Central configuration. Values come from environment variables (.env locally, Secret Manager / env vars on Cloud Run)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

# Local dev: backend/.env or repo-root .env. On Cloud Run these files don't exist and real env vars are used.
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-5-mini")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")

STEP_TIMEOUT_S = float(os.getenv("STEP_TIMEOUT_S", "12"))
PLANNER_TIMEOUT_S = float(os.getenv("PLANNER_TIMEOUT_S", "20"))
MAX_ATTEMPTS_PER_STEP = int(os.getenv("MAX_ATTEMPTS_PER_STEP", "3"))
MAX_REPLANS_PER_QUERY = int(os.getenv("MAX_REPLANS_PER_QUERY", "2"))
# "minimal" keeps gpt-5 family models fast; dropped for models that don't support it.
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "minimal")

DATA_DIR = Path(os.getenv("DATA_DIR", ROOT_DIR / "data"))
REGISTRY_FILE = DATA_DIR / "ps05_agent_registry_enriched.json"
INTENT_MAP_FILE = DATA_DIR / "intent_map.json"
ORIGINAL_QUERIES_FILE = DATA_DIR / "original" / "ps05_user_queries.csv"
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", ROOT_DIR / "frontend" / "dist"))

# From the dataset: only 18/200 historical queries were routed to the right agent.
BASELINE_ROUTING_ACCURACY = 0.09

USE_FIRESTORE = bool(GOOGLE_CLOUD_PROJECT) and os.getenv("USE_FIRESTORE", "1") == "1"
