"""Seed the Firestore `agents` collection from data/ps05_agent_registry_enriched.json.

Usage (from backend/):  python -m scripts.seed_firestore [--force]
"""
import sys

from app import config, db

if __name__ == "__main__":
    if not config.USE_FIRESTORE:
        sys.exit("GOOGLE_CLOUD_PROJECT is not set; nothing to seed (local runs use the in-memory store).")
    n = db.seed_agents(force="--force" in sys.argv)
    print(f"Seeded {n} agents into Firestore project {config.GOOGLE_CLOUD_PROJECT}")
