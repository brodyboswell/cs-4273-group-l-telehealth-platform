"""
transcript_store.py

Python mirror of lib/chat/transcriptStore.ts, so the voice agent writes
turns into the exact same transcript files the Next.js text chat
(app/api/chat) and ChatPanel read and write. Keep this in sync with that
file if the Transcript/TranscriptEntry shape changes there.

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


@dataclass
class Transcript:
    session_id: str
    persona_id: str
    persona_name: str
    created_at: str
    updated_at: str
    entries: list[dict[str, Any]] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return {
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


def get_or_create_transcript(
    session_id: str, persona_id: str, persona_name: str, opening_line: str
) -> Transcript:
    """Loads the session's transcript, creating it (with the client's scripted
    opening line) if this is a brand new session — matching getOrCreateTranscript
    in the TS transcript store, so a session can start in voice mode too."""
    existing = read_transcript(session_id)
    if existing is not None:
        return existing
    now = _iso_now()
    t = Transcript(
        session_id=session_id,
        persona_id=persona_id,
        persona_name=persona_name,
        created_at=now,
        updated_at=now,
        entries=[],
    )
    _push_entry(
        t,
        "system",
        f"Session started with virtual client {persona_name} ({persona_id}).",
    )
    _push_entry(t, "virtual_client", opening_line, model="scripted:opening-line")
    _write_transcript(t)
    return t


def append_entry(
    t: Transcript,
    speaker: Speaker,
    text: str,
    *,
    model: str | None = None,
    latency_ms: float | None = None,
) -> dict[str, Any]:
    # The Next.js server also appends to this file during a voice call (for
    # example the learner's activity updates via /api/voice/activity), so
    # reload the latest entries first instead of overwriting them with this
    # process's older in-memory copy. Still not a cross-process lock — see the
    # transcript-storage limits in docs/chat-api.md.
    latest = read_transcript(t.session_id)
    if latest is not None:
        t.entries = latest.entries
        t.updated_at = latest.updated_at
    entry = _push_entry(t, speaker, text, model=model, latency_ms=latency_ms)
    _write_transcript(t)
    return entry
