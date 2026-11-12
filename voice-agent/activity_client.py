"""
activity_client.py

Sends the browser's activity snapshot (forwarded over the LiveKit room) to the
Next.js server's POST /api/voice/activity, which validates it with the same
activity registry the text chat uses and returns the prompt context for it.
Keeping validation and descriptions in TypeScript means each activity owner
only maintains their activity definition once (lib/activities/), and the voice
agent picks up new activities without Python changes.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class ActivityContextError(Exception):
    pass


@dataclass
class ActivityContext:
    activity_id: str
    label: str
    context: str


def describe_activity(
    session_id: str,
    snapshot: dict[str, Any],
    *,
    record: bool,
    base_url: str | None = None,
    timeout: float = 10.0,
) -> ActivityContext:
    """Blocking call; run it with asyncio.to_thread from the agent."""
    base = (base_url or os.environ.get("NEXTJS_BASE_URL") or "http://localhost:3000").rstrip(
        "/"
    )
    url = f"{base}/api/voice/activity"
    payload = json.dumps({"sessionId": session_id, "activity": snapshot, "record": record})
    request = urllib.request.Request(
        url,
        data=payload.encode("utf8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf8", errors="replace")
        raise ActivityContextError(f"{url} rejected the activity ({err.code}): {detail}") from err
    except Exception as err:  # noqa: BLE001 - surfaced in the agent log
        raise ActivityContextError(f"Could not reach {url}: {err}") from err

    try:
        return ActivityContext(
            activity_id=data["activityId"],
            label=data["label"],
            context=data["context"],
        )
    except KeyError as err:
        raise ActivityContextError(f"Unexpected response shape from {url}: {data!r}") from err
