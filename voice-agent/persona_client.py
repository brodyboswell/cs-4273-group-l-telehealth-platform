"""
persona_client.py

Fetches the active persona from the Next.js server's GET /api/persona
instead of duplicating the (large, frequently-edited) system prompt here.
Plain stdlib HTTP, no extra dependency — mirrors lib/chat/llm.ts's own
"plain fetch, no extra SDK" approach on the TypeScript side.
"""
from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass


class PersonaFetchError(Exception):
    pass


@dataclass
class Persona:
    id: str
    name: str
    opening_line: str
    system_prompt: str


def fetch_persona(base_url: str | None = None, timeout: float = 10.0) -> Persona:
    base = (base_url or os.environ.get("NEXTJS_BASE_URL") or "http://localhost:3000").rstrip(
        "/"
    )
    url = f"{base}/api/persona"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf8"))
    except Exception as err:  # noqa: BLE001 - surfaced as a clear startup error
        raise PersonaFetchError(
            f"Could not fetch persona from {url}. Is the Next.js app running "
            f"(npm run dev) and reachable from this process? ({err})"
        ) from err

    try:
        return Persona(
            id=data["id"],
            name=data["name"],
            opening_line=data["openingLine"],
            system_prompt=data["systemPrompt"],
        )
    except KeyError as err:
        raise PersonaFetchError(f"Unexpected response shape from {url}: {data!r}") from err
