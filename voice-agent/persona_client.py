"""
persona_client.py

Fetches the persona for one practice session from the Next.js server's
GET /api/voice/persona instead of duplicating the (large, frequently-edited)
system prompt here. The server builds it from the session's transcript, so a
learner-created client is the same character in Text and Voice mode.
Plain stdlib HTTP, no extra dependency.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from next_api import agent_headers, base_url


class PersonaFetchError(Exception):
    pass


@dataclass
class Persona:
    id: str
    name: str
    opening_line: str
    system_prompt: str
    ended: bool


def fetch_persona(
    session_id: str, base_url_override: str | None = None, timeout: float = 10.0
) -> Persona:
    query = urllib.parse.urlencode({"sessionId": session_id})
    url = f"{base_url(base_url_override)}/api/voice/persona?{query}"
    try:
        request = urllib.request.Request(url, headers=agent_headers())
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf8", errors="replace")
        raise PersonaFetchError(f"{url} returned {err.code}: {detail}") from err
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
            ended=bool(data.get("ended", False)),
        )
    except KeyError as err:
        raise PersonaFetchError(f"Unexpected response shape from {url}: {data!r}") from err
