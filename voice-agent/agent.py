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
learner makes a selection on the feelings chart. Jacob can act on the feelings
chart and the whiteboard by voice: the tools come from the shared activity
registry (POST /api/voice/activity), a tool call is validated and recorded by
POST /api/voice/action, and the validated action is sent back to the browser on
topic "telehealth.action", where VoicePanel applies it to the activity.

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
from livekit.agents.voice import room_io
from livekit.plugins import anthropic

from activity_client import (
    ActivityActionError,
    ActivityContextError,
    describe_activity,
    submit_action,
)
from persona_client import Persona, PersonaFetchError, fetch_persona
from transcript_store import Transcript, append_entry, read_transcript

logger = logging.getLogger("telehealth-voice-agent")

# Loads voice-agent/.env (ANTHROPIC_API_KEY, LIVEKIT_*, etc.) from this file's
# own folder, so it works no matter which folder the terminal is in.
load_dotenv(Path(__file__).resolve().parent / ".env")

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

# Must match ACTIVITY_TOPIC in components/chat/VoicePanel.tsx.
ACTIVITY_TOPIC = "telehealth.activity"

# Must match ACTION_TOPIC in components/chat/VoicePanel.tsx.
ACTION_TOPIC = "telehealth.action"

# Activities where a learner change should make Jacob respond out loud right
# away. Other activities (chess, whiteboard) still update his context
# silently.
REACTIVE_ACTIVITIES = {"feelings"}

# Activities whose registry tools Jacob may call during a voice call. Chess is
# left out on purpose: its moves are still made by the text chat's turn flow
# (the hidden ChatPanel requests a turn after each learner move), so a second
# voice tool would make him move twice. The voice agent reads that move out
# loud instead (see announce_chess_move).
VOICE_TOOL_ACTIVITIES = {"feelings", "whiteboard"}

# What the browser applies for each tool, so the agent can tell the learner's
# own clicks from the change Jacob's action causes. Maps a tool name to the
# activity state it should produce.
EXPECTED_STATE_AFTER_TOOL = {
    "select_mood": lambda tool_input: {"selectedMoodId": tool_input.get("moodId")},
}
ACTION_ECHO_SECONDS = 20.0

VOICE_ACTIVITY_LIMITS: dict[str, str] = {
    "feelings": (
        "This is a voice call. You can only change the feelings chart by calling the "
        "select_mood tool, and only when the learner asks you to show how you feel or "
        "clearly agrees. Never say you picked a feeling unless the tool succeeded. "
        "After it succeeds, say one short sentence about why, in character."
    ),
    "whiteboard": (
        "This is a voice call. You can only draw by calling the "
        "replace_whiteboard_with_svg tool, and only after the learner directly asks "
        "or clearly agrees. Say one short sentence about what you will draw before "
        "you call it, and never claim to have drawn something unless the tool "
        "succeeded. Drawing replaces the whole board."
    ),
    "chess": (
        "This is a voice call. You cannot move pieces yourself: after the learner "
        "moves, your reply move appears on the board automatically and is read out "
        "to the learner. Do not announce or promise a move before it appears."
    ),
}
DEFAULT_VOICE_ACTIVITY_LIMIT = (
    "This is a voice call: you can see and talk about the activity, but you cannot "
    "select, move or draw anything on it yourself. Do not say that you are doing so."
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

    # The LiveKit room name is the practice session id from the URL
    # (/practice/<sessionId>); app/api/livekit-token/route.ts only issues a
    # token for that room to the learner who owns the session.
    session_id = ctx.room.name

    try:
        # The persona is built from this session's transcript on the server,
        # so a learner-created client is the same character as in Text mode.
        persona: Persona = await asyncio.to_thread(fetch_persona, session_id)
    except PersonaFetchError as err:
        # Fails loudly and early rather than falling back to a hardcoded
        # persona, so a misconfigured NEXTJS_BASE_URL or VOICE_AGENT_SECRET is
        # obvious in the logs instead of silently serving the wrong character.
        logger.error("Could not load persona, aborting job: %s", err)
        raise

    # The server creates the transcript when the learner starts the session;
    # the agent only ever appends to it.
    transcript = read_transcript(session_id)
    if transcript is None or persona.ended or transcript.ended:
        logger.error("Session %s is missing or has ended; not joining", session_id)
        return
    # Say the opening line out loud only if the learner hasn't spoken yet in
    # Text or Voice mode, so the client doesn't repeat it mid-conversation.
    is_new_session = not any(
        entry.get("speaker") == "learner" for entry in transcript.entries
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

    # The change Jacob's own tool call is about to cause on screen. The
    # snapshot that reports it must not be treated as a learner change (no
    # transcript "activity" entry, no spoken reaction to himself).
    pending_self_change: dict[str, Any] | None = None

    # Chess replies already read out loud, and the transcript length when the
    # call started (older lines belong to earlier Text or Voice sessions).
    spoken_chess_seqs: set[int] = set()
    baseline_seq = len(transcript.entries)

    def is_echo_of_own_action(snapshot: dict[str, Any]) -> bool:
        nonlocal pending_self_change
        pending, pending_self_change = pending_self_change, None
        if pending is None or time.monotonic() > pending["until"]:
            return False
        if pending["activityId"] != snapshot.get("activityId"):
            return False
        state = snapshot.get("state")
        return isinstance(state, dict) and all(
            state.get(key) == value for key, value in pending["state"].items()
        )

    def build_voice_tools(specs: list[dict[str, Any]]) -> list[llm.Tool]:
        """Turns the registry's tool definitions into LiveKit raw-schema tools.
        Each call is validated and recorded by /api/voice/action, then forwarded
        to the browser, which applies it through the ActivityBridge."""
        tools: list[llm.Tool] = []
        for spec in specs:
            name = spec["name"]

            async def handler(
                raw_arguments: dict[str, Any],
                _name: str = name,
            ) -> str:
                nonlocal pending_self_change
                snapshot = last_snapshot
                if snapshot is None:
                    raise llm.ToolError("There is nothing on screen to act on right now.")
                try:
                    result = await asyncio.to_thread(
                        submit_action, session_id, snapshot, _name, raw_arguments
                    )
                except ActivityActionError as err:
                    logger.warning("Activity tool %s rejected: %s", _name, err)
                    raise llm.ToolError(f"The action was not applied: {err}") from err

                action = result["action"]
                expected = EXPECTED_STATE_AFTER_TOOL.get(_name)
                if expected is not None:
                    pending_self_change = {
                        "activityId": action["activityId"],
                        "state": expected(action["input"]),
                        "until": time.monotonic() + ACTION_ECHO_SECONDS,
                    }
                await ctx.room.local_participant.send_text(
                    json.dumps({"action": action}), topic=ACTION_TOPIC
                )
                logger.info("Activity action sent: %s.%s", action["activityId"], _name)
                return f"Done: the {result.get('label', 'activity')} was updated on screen."

            tools.append(
                llm.function_tool(
                    handler,
                    raw_schema={
                        "name": name,
                        "description": spec["description"],
                        "parameters": spec["inputSchema"],
                    },
                )
            )
        return tools

    def chess_progress(snapshot: dict[str, Any] | None) -> tuple[str, int, str] | None:
        """(gameId, number of moves, learnerColor) from a chess snapshot."""
        if not snapshot or snapshot.get("activityId") != "chess":
            return None
        state = snapshot.get("state")
        if not isinstance(state, dict):
            return None
        history = state.get("moveHistory")
        game_id = state.get("gameId")
        learner = state.get("learnerColor")
        if not isinstance(history, list) or not isinstance(game_id, str) or learner not in ("w", "b"):
            return None
        return game_id, len(history), learner

    def jacob_just_moved(previous: dict[str, Any] | None, snapshot: dict[str, Any]) -> bool:
        current = chess_progress(snapshot)
        if current is None:
            return False
        game_id, count, learner = current
        before = chess_progress(previous)
        before_count = before[1] if before and before[0] == game_id else 0
        if count != before_count + 1:
            return False
        mover = "w" if count % 2 == 1 else "b"
        return mover != learner

    async def announce_chess_move(game_id: str) -> None:
        """Reads Jacob's chess reply out loud. The move itself was already chosen
        and stored by the text chat's activity-turn flow (/api/chat); this only
        speaks the line that went with it, so the move is never made twice."""
        for _ in range(8):
            latest = await asyncio.to_thread(read_transcript, session_id)
            entry = next(
                (
                    e
                    for e in reversed(latest.entries if latest else [])
                    if e.get("speaker") == "virtual_client"
                    and e.get("actions")
                    and str(e.get("activityTurnId", "")).startswith(game_id)
                    and e.get("seq", 0) > baseline_seq
                ),
                None,
            )
            if entry is not None:
                if entry["seq"] in spoken_chess_seqs or not entry.get("text", "").strip():
                    return
                spoken_chess_seqs.add(entry["seq"])
                text = entry["text"].strip()
                try:
                    session.say(text, add_to_chat_ctx=False)
                except RuntimeError as err:
                    logger.info("Skipped chess narration: %s", err)
                    return
                # Keep what he said in his own history, without logging it
                # twice (it is already in the transcript).
                history = agent.chat_ctx.copy()
                history.add_message(role="assistant", content=text)
                await agent.update_chat_ctx(history)
                return
            await asyncio.sleep(0.5)
        logger.info("No chess reply found in the transcript to read out loud")

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
                await agent.update_tools([])
                await agent.update_instructions(persona.system_prompt)
                return

            # Same activity, different state = something changed. A newly
            # opened activity only updates context, and so does the change
            # Jacob's own tool call caused.
            previous = last_snapshot
            same_activity = (
                previous is not None
                and previous.get("activityId") == snapshot.get("activityId")
            )
            own_change = same_activity and is_echo_of_own_action(snapshot)
            learner_changed = same_activity and not own_change
            reactive = learner_changed and snapshot.get("activityId") in REACTIVE_ACTIVITIES
            try:
                described = await asyncio.to_thread(
                    describe_activity, session_id, snapshot, record=reactive
                )
            except ActivityContextError as err:
                logger.warning("Activity update rejected: %s", err)
                return

            last_snapshot = snapshot
            limits = VOICE_ACTIVITY_LIMITS.get(
                described.activity_id, DEFAULT_VOICE_ACTIVITY_LIMIT
            )
            voice_tools = (
                build_voice_tools(described.tools)
                if described.activity_id in VOICE_TOOL_ACTIVITIES
                else []
            )
            await agent.update_tools(voice_tools)
            await agent.update_instructions(
                f"{persona.system_prompt}\n\n{described.context}\n{limits}"
            )
            logger.info(
                "Activity context updated: %s (tools: %s)",
                described.activity_id,
                [t.info.name for t in voice_tools] or "none",  # type: ignore[attr-defined]
            )

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

            if described.activity_id == "chess" and jacob_just_moved(previous, snapshot):
                game_id = chess_progress(snapshot)[0]  # type: ignore[index]
                task = asyncio.create_task(announce_chess_move(game_id))
                background_tasks.add(task)
                task.add_done_callback(background_tasks.discard)

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

    await session.start(
        agent=agent,
        room=ctx.room,
        # When the learner presses "End voice session", the session closes;
        # also delete the room, otherwise this agent stays in it and a call
        # started again soon after rejoins a room with no one listening. The
        # next call then creates a fresh room and gets a fresh agent.
        room_options=room_io.RoomOptions(delete_room_on_close=True),
    )

    # Only a session where the learner hasn't spoken yet hears the scripted
    # opening line out loud; resuming one (learner switched from Text to Voice
    # mid-chat) stays silent so the client doesn't repeat themself. add_to_chat_ctx=False
    # because the line is already seeded into chat_ctx above via the
    # transcript's "scripted:opening-line" entry.
    if is_new_session:
        session.say(persona.opening_line, add_to_chat_ctx=False)


if __name__ == "__main__":
    cli.run_app(server)
