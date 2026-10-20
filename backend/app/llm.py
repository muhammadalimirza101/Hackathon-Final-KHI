"""Shared OpenAI model (via ADK LiteLlm) and run_agent(), the one helper everything uses to run an ADK agent."""
import os
import uuid
from typing import Any, Optional

# Use LiteLLM's bundled model cost map instead of fetching it from GitHub on first call (slow / can time out).
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

import litellm  # noqa: E402
from google.adk.agents import BaseAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from . import config

# gpt-5 family models reject non-default temperature etc.; drop unsupported params instead of erroring.
litellm.drop_params = True

APP_NAME = "meta_router"
USER_ID = "user"

model = LiteLlm(model=f"openai/{config.MODEL_NAME}", reasoning_effort=config.REASONING_EFFORT)

_sessions = InMemorySessionService()
_runners: dict[str, Runner] = {}


def _runner(agent: BaseAgent) -> Runner:
    r = _runners.get(agent.name)
    if r is None or r.agent is not agent:
        r = Runner(agent=agent, app_name=APP_NAME, session_service=_sessions)
        _runners[agent.name] = r
    return r


async def run_agent(agent: BaseAgent, text: str, state: Optional[dict[str, Any]] = None) -> tuple[str, dict[str, Any]]:
    """Run an ADK agent on `text` in a fresh in-memory session.

    `state` seeds session state (e.g. the user's attachment for tools).
    Returns (final response text, final session state).
    """
    session_id = uuid.uuid4().hex
    await _sessions.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=session_id, state=dict(state or {}))
    msg = types.Content(role="user", parts=[types.Part(text=text)])
    final = ""
    try:
        async for event in _runner(agent).run_async(user_id=USER_ID, session_id=session_id, new_message=msg):
            if event.is_final_response() and event.content and event.content.parts:
                final = "".join(p.text or "" for p in event.content.parts).strip()
        session = await _sessions.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=session_id)
        return final, dict(session.state) if session else {}
    finally:
        await _sessions.delete_session(app_name=APP_NAME, user_id=USER_ID, session_id=session_id)
