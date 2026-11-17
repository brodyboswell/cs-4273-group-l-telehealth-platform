"""
next_api.py

Shared settings for the agent's calls to the Next.js server. The routes it
calls (/api/voice/persona, /api/voice/activity, /api/voice/action) are not
behind the learner's Supabase login; they require the shared VOICE_AGENT_SECRET
instead (see lib/voice/agentAuth.ts). Set the same value in this folder's .env
and in the main app's .env.local.
"""
from __future__ import annotations

import os

SECRET_HEADER = "x-voice-agent-secret"


def base_url(override: str | None = None) -> str:
    return (override or os.environ.get("NEXTJS_BASE_URL") or "http://localhost:3000").rstrip("/")


def agent_headers(*, json_body: bool = False) -> dict[str, str]:
    secret = os.environ.get("VOICE_AGENT_SECRET", "")
    if len(secret) < 16:
        raise RuntimeError(
            "VOICE_AGENT_SECRET is missing or shorter than 16 characters in voice-agent/.env "
            "(it must match the value in the main app's .env.local)."
        )
    headers = {SECRET_HEADER: secret}
    if json_body:
        headers["content-type"] = "application/json"
    return headers
