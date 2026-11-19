"""
transcript_store.py

Python mirror of lib/chat/transcriptStore.ts, so the voice agent writes
turns into the exact same transcript files the Next.js text chat
(app/api/chat) and ChatPanel read and write. Keep this in sync with that
file if the Transcript/TranscriptEntry shape changes there.

The Next.js server creates each transcript when the learner starts a practice
session (/api/sessions), with fields this module does not use (ownerId, name,
client, endedAt, ...). Those are kept exactly as they are on every write:
dropping ownerId would lock the learner out of their own session. The agent
never creates a transcript, and stops writing once the session has ended.

Files live in TRANSCRIPT_DIR (same default as the TS side: ./data/transcripts
resolved from the repo root, i.e. the parent of this voice-agent/ folder),
one JSON file per session, named "<sessionId>.json".
"""
from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

Speaker = Literal["learner", "virtual_client", "system", "activity"]

SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def is_valid_session_id(value: str) -> bool:
    return bool(SESSION_ID_PATTERN.match(value))


def _iso_now() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y-%m-%dT%H:%M:%S')}.{now.microsecond // 1000:03d}Z"


def transcript_dir() -> Path:
    configured = os.environ.get("TRANSCRIPT_DIR")
    if configured:
        return Path(configured).resolve()
    # voice-agent/ sits at the repo root, same level as the Next.js app's
    # own "data" folder, so this lines up with its default with no config.
    return (Path(__file__).resolve().parent.parent / "data" / "transcripts").resolve()


def _file_for(session_id: str) -> Path:
    if not is_valid_session_id(session_id):
        raise ValueError(f"Invalid session id: {session_id!r}")
    return transcript_dir() / f"{session_id}.json"


_KNOWN_FIELDS = {"sessionId", "personaId", "personaName", "createdAt", "updatedAt", "entries"}


@dataclass
class Transcript:
    session_id: str
    persona_id: str
    persona_name: str
    created_at: str
    updated_at: str
    entries: list[dict[str, Any]] = field(default_factory=list)
    # Every other top-level field (ownerId, name, client, endedAt, ...),
    # written back unchanged.
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def ended(self) -> bool:
        return bool(self.extra.get("endedAt"))

    def to_json(self) -> dict[str, Any]:
        return {
            **self.extra,
            "sessionId": self.session_id,
            "personaId": self.persona_id,
            "personaName": self.persona_name,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "entries": self.entries,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Transcript":
        return cls(
            session_id=data["sessionId"],
            persona_id=data["personaId"],
            persona_name=data["personaName"],
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
            entries=list(data.get("entries", [])),
            extra={k: v for k, v in data.items() if k not in _KNOWN_FIELDS},
        )


def read_transcript(session_id: str) -> Transcript | None:
    file = _file_for(session_id)
    try:
        data = json.loads(file.read_text(encoding="utf8"))
    except FileNotFoundError:
        return None
    if data.get("sessionId") != session_id:
        raise ValueError("Invalid transcript data")
    return Transcript.from_json(data)


def _write_transcript(t: Transcript) -> None:
    file = _file_for(t.session_id)
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_suffix(f".{uuid.uuid4()}.tmp")
    try:
        # Exclusive create + atomic rename, mirroring the TS side's
        # write-then-rename so a crash mid-write never corrupts the file.
        with open(tmp, "x", encoding="utf8") as handle:
            json.dump(t.to_json(), handle, indent=2)
        os.replace(tmp, file)
    finally:
        tmp.unlink(missing_ok=True)


def _push_entry(
    t: Transcript,
    speaker: Speaker,
    text: str,
    *,
    model: str | None = None,
    latency_ms: float | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "seq": len(t.entries) + 1,
        "speaker": speaker,
        "text": text,
        "timestamp": _iso_now(),
    }
    if model is not None:
        entry["model"] = model
    if latency_ms is not None:
        entry["latencyMs"] = latency_ms
    t.entries.append(entry)
    t.updated_at = entry["timestamp"]
    return entry


def append_entry(
    t: Transcript,
    speaker: Speaker,
    text: str,
    *,
    model: str | None = None,
    latency_ms: float | None = None,
) -> dict[str, Any] | None:
    # The Next.js server also appends to this file during a voice call (for
    # example the learner's activity updates via /api/voice/activity), so
    # reload the latest entries first instead of overwriting them with this
    # process's older in-memory copy. Still not a cross-process lock — see the
    # transcript-storage limits in docs/chat-api.md.
    latest = read_transcript(t.session_id)
    if latest is not None:
        t.entries = latest.entries
        t.updated_at = latest.updated_at
        t.extra = latest.extra
    if t.ended:
        # The learner ended the session from the app; record nothing more.
        return None
    entry = _push_entry(t, speaker, text, model=model, latency_ms=latency_ms)
    _write_transcript(t)
    return entry
