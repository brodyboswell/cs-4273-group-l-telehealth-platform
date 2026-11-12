"""
agent.py

The realtime voice AI agent for the telehealth practice room. This is a
separate Python process (run with `python agent.py dev`) that joins the same
LiveKit room the browser's VoicePanel connects to, listens to the learner's
microphone, and speaks back as the virtual client persona ("Jacob") — while
writing every finalized turn, from both sides, into the exact same transcript
JSON file the Next.js text chat (app/api/chat, lib/chat/transcriptStore.ts)
reads and writes. That shared file is what lets a learner switch between the
Text and Voice tabs mid-session without losing the conversation.

It also listens for the on-screen activity the browser shares over the room
(topic "telehealth.activity", sent by VoicePanel from the ActivityBridge), so
Jacob knows what the learner is looking at and reacts out loud when the
learner makes a selection on the feelings chart.

Run alongside the Next.js app (two processes, one terminal each):
    Terminal 1:  npm run dev
    Terminal 2:  cd voice-agent && python agent.py dev

See docs/voice-agent.md for full setup, including creating a LiveKit Cloud
project and filling in voice-agent/.env (copy of .env.example).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ConversationItemAddedEvent,
    JobContext,
    cli,
    inference,
    llm,
)
from livekit.plugins import anthropic

from activity_client import ActivityContextError, describe_activity
from persona_client import Persona, PersonaFetchError, fetch_persona
from transcript_store import Transcript, append_entry, get_or_create_transcript, read_transcript

logger = logging.getLogger("telehealth-voice-agent")

# Loads voice-agent/.env (ANTHROPIC_API_KEY, LIVEKIT_*, etc.) from this file's
# own folder, so it works no matter which folder the terminal is in.
load_dotenv(Path(__file__).resolve().parent / ".env")

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

# Must match ACTIVITY_TOPIC in components/chat/VoicePanel.tsx.
ACTIVITY_TOPIC = "telehealth.activity"

# Activities where a learner change should make Jacob respond out loud right
# away. Other activities (chess, whiteboard) still update his context
# silently; chess turns keep going through the text chat's turn flow.
REACTIVE_ACTIVITIES = {"feelings"}

# The activity descriptions are shared with the text chat, where Jacob can use
# activity tools. The voice agent has no activity tools yet, so keep him from
# promising actions (picking a feeling, drawing) that won't happen on screen.
VOICE_ACTIVITY_LIMITS = (
    "This is a voice call: you can see and talk about the activity, but you cannot "
    "select, move or draw anything on it yourself right now. Do not say that you "
    "are doing so."
)

server = AgentServer()


def _build_chat_ctx(transcript: Transcript) -> llm.ChatContext:
    """Primes the LLM's chat history from an existing transcript, so a learner
    who already chatted in Text mode (or in an earlier voice call) is
    continued, not restarted. Mirrors toChatHistory() in transcriptStore.ts:
    system entries are dropped, learner and activity entries become user
    turns, virtual_client entries become assistant turns, consecutive turns
    from the same side are merged, and a leading assistant turn gets a neutral
    user turn in front of it.
    """
    turns: list[dict[str, str]] = []
    for entry in transcript.entries:
        speaker = entry.get("speaker")
        text = entry.get("text", "")
        if speaker == "system" or not text:
            continue
        role = "user" if speaker in ("learner", "activity") else "assistant"
        if turns and turns[-1]["role"] == role:
            turns[-1]["content"] += f"\n\n{text}"
        else:
            turns.append({"role": role, "content": text})
    if turns and turns[0]["role"] == "assistant":
        turns.insert(
            0, {"role": "user", "content": "(The telehealth video session has just connected.)"}
        )

    chat_ctx = llm.ChatContext.empty()
    for turn in turns:
        chat_ctx.add_message(role=turn["role"], content=turn["content"])  # type: ignore[arg-type]
    return chat_ctx


class VirtualClientAgent(Agent):
    """Carries the persona's instructions and primed history; activity context
    is added on top of the persona prompt by the entrypoint as it changes."""

    def __init__(self, *, instructions: str, chat_ctx: llm.ChatContext) -> None:
        super().__init__(instructions=instructions, chat_ctx=chat_ctx)


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    # Each log line gets these fields, so terminal output is easy to match up
    # to a specific learner session while debugging.
    ctx.log_context_fields = {"room": ctx.room.name}

    # The LiveKit room name doubles as the session id shared with the
    # Next.js text chat and transcript store (see lib/chat/clientSession.ts
    # and app/api/livekit-token/route.ts, which both key off this id).
    session_id = ctx.room.name

    try:
        persona: Persona = fetch_persona()
    except PersonaFetchError as err:
        # Fails loudly and early rather than falling back to a hardcoded
        # persona, so a misconfigured NEXTJS_BASE_URL is obvious in the logs
        # instead of silently serving the wrong character.
        logger.error("Could not load persona, aborting job: %s", err)
        raise

    is_new_session = read_transcript(session_id) is None
    transcript = get_or_create_transcript(
        session_id, persona.id, persona.name, persona.opening_line
    )
    chat_ctx = _build_chat_ctx(transcript)

    session: AgentSession = AgentSession(
        # LiveKit Inference bundles STT/TTS through the LiveKit Cloud
        # account, so no separate Deepgram/Cartesia keys are needed — see
        # docs/voice-agent.md. English-only recognition: the multilingual
        # mode ("multi") misheard more English words in testing.
        stt=inference.STT("deepgram/nova-3", language="en"),
        tts=inference.TTS("cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
        # Reuses the same ANTHROPIC_API_KEY / ANTHROPIC_MODEL already used by
        # the text chat's lib/chat/llm.ts, read from the environment only.
        llm=anthropic.LLM(model=ANTHROPIC_MODEL),
    )

    agent = VirtualClientAgent(instructions=persona.system_prompt, chat_ctx=chat_ctx)

    # --- On-screen activity -------------------------------------------------
    # The browser sends {"activity": ActivitySnapshot | null} whenever the
    # visible activity or its state changes. Updates are applied one at a time
    # so a fast series of clicks can't apply out of order.
    activity_lock = asyncio.Lock()
    last_snapshot: dict[str, Any] | None = None
    background_tasks: set[asyncio.Task[None]] = set()

    async def apply_activity(raw: str) -> None:
        nonlocal last_snapshot
        try:
            message = json.loads(raw)
            snapshot = message.get("activity") if isinstance(message, dict) else None
        except json.JSONDecodeError:
            logger.warning("Ignoring malformed activity message")
            return

        async with activity_lock:
            if snapshot == last_snapshot:
                return
            if not isinstance(snapshot, dict):
                # The learner left the activity (back to the room / chat page).
                last_snapshot = None
                await agent.update_instructions(persona.system_prompt)
                return

            # Same activity, different state = the learner changed something.
            # A newly opened activity only updates context.
            learner_changed = (
                last_snapshot is not None
                and last_snapshot.get("activityId") == snapshot.get("activityId")
            )
            reactive = learner_changed and snapshot.get("activityId") in REACTIVE_ACTIVITIES
            try:
                described = await asyncio.to_thread(
                    describe_activity, session_id, snapshot, record=reactive
                )
            except ActivityContextError as err:
                logger.warning("Activity update rejected: %s", err)
                return

            last_snapshot = snapshot
            await agent.update_instructions(
                f"{persona.system_prompt}\n\n{described.context}\n"
                f"{VOICE_ACTIVITY_LIMITS}"
            )
            logger.info("Activity context updated: %s", described.activity_id)

            if reactive:
                try:
                    session.generate_reply(
                        instructions=(
                            f"The learner just updated the {described.label} on screen. "
                            "React out loud in character, briefly and naturally (one or two "
                            "short sentences), based only on the current activity state and "
                            "the conversation so far. Stay consistent with your case."
                        )
                    )
                except RuntimeError as err:
                    # The session is still starting or already closing; the
                    # context update above still applies to his next reply.
                    logger.info("Skipped activity reaction: %s", err)

    async def read_activity_stream(reader: rtc.TextStreamReader) -> None:
        await apply_activity(await reader.read_all())

    def on_activity_stream(reader: rtc.TextStreamReader, participant_identity: str) -> None:
        task = asyncio.create_task(read_activity_stream(reader))
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)

    ctx.room.register_text_stream_handler(ACTIVITY_TOPIC, on_activity_stream)

    # --- Transcript logging ---------------------------------------------------
    # Tracks when the learner's turn finished, purely to log how long Jacob
    # took to reply — mirrors the latencyMs field app/api/chat/route.ts
    # already records for text turns.
    last_user_turn_at: float | None = None

    @session.on("conversation_item_added")
    def _on_conversation_item_added(ev: ConversationItemAddedEvent) -> None:
        nonlocal last_user_turn_at
        item = ev.item
        # Only ChatMessage items (role + text) are relevant here; tool calls
        # and agent handoffs aren't part of this persona's simple back-and-forth.
        role = getattr(item, "role", None)
        text = getattr(item, "text_content", None)
        if not text or not text.strip():
            return

        if role == "user":
            last_user_turn_at = time.monotonic()
            append_entry(transcript, "learner", text)
        elif role == "assistant":
            latency_ms = None
            if last_user_turn_at is not None:
                latency_ms = (time.monotonic() - last_user_turn_at) * 1000.0
                last_user_turn_at = None
            append_entry(
                transcript,
                "virtual_client",
                text,
                model=f"anthropic:{ANTHROPIC_MODEL}",
                latency_ms=latency_ms,
            )

    await session.start(agent=agent, room=ctx.room)

    # Only a brand-new session hears the scripted opening line out loud;
    # resuming an existing one (learner switched from Text to Voice mid-chat)
    # stays silent so Jacob doesn't repeat himself. add_to_chat_ctx=False
    # because the line is already seeded into chat_ctx above via the
    # transcript's "scripted:opening-line" entry.
    if is_new_session:
        session.say(persona.opening_line, add_to_chat_ctx=False)


if __name__ == "__main__":
    cli.run_app(server)
