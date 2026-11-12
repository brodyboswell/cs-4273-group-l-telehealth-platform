# Realtime Voice Agent

The Chat panel now has a **Voice** tab next to **Text**. In Voice mode the learner talks into
their microphone, the virtual client (**Jacob**) answers out loud, and both sides are written
into the *same* per-session transcript the Text tab uses — so switching tabs mid-session never
loses the conversation. Voice is powered by [LiveKit Agents](https://github.com/livekit/agents),
an open-source realtime-voice framework, running as a second local process alongside the Next.js
app.

## How it fits together

```
Browser (VoicePanel)  --WebRTC via LiveKit Cloud-->  voice-agent/agent.py (Python, separate process)
      |                                                        |
      | POST /api/livekit-token {sessionId}                    | GET /api/persona
      v                                                        v
app/api/livekit-token/route.ts  (mints a short-lived join token)   app/api/persona/route.ts
                                                                     |
                                                                     v
                                                  voice-agent/transcript_store.py
                                                  reads/writes the SAME
                                                  data/transcripts/<sessionId>.json
                                                  files as lib/chat/transcriptStore.ts
```

The session ID (from the browser's `sessionStorage`, same one the Text tab uses) doubles as the
LiveKit room name, which is what ties the voice call to the right transcript file.

LiveKit Cloud is only the realtime relay (audio in/out) plus **LiveKit Inference**, a bundled
speech-to-text/text-to-speech API — it does not see your Anthropic key or run the LLM. The LLM
is still your existing Claude account, called from `voice-agent/agent.py` the same way
`lib/chat/llm.ts` calls it for the Text tab.

## 1. Create a LiveKit Cloud project (one-time, ~5 minutes)

1. Go to **https://cloud.livekit.io** and sign up (GitHub or Google sign-in works) — the free tier
   covers a classroom demo easily.
2. After signing in you land in a new project automatically. If not, click **Create project** and
   name it anything (e.g. `telehealth-practice-room`).
3. Open the project, then **Settings → API keys** in the left sidebar.
4. Click **Create key**. It shows you three values you need — copy all three somewhere safe:
   - **API Key** (starts with `API...`)
   - **API Secret** (only shown once — if you lose it, delete the key and make a new one)
   - **WebSocket URL** (starts with `wss://...`, shown at the top of the API keys page)
5. On the same **Settings** page, confirm **LiveKit Inference** is enabled for the project (it's
   on by default for new projects) — that's what provides speech-to-text/text-to-speech without
   you needing a separate Deepgram/Cartesia account.

That's the whole hosting setup — no servers to deploy. The two processes below (Next.js app, and
the Python voice agent) connect *out* to LiveKit Cloud; nothing needs to be publicly reachable.

## 2. Configure both processes with the same three values

**Main app** — add to `.env.local` (same file as `ANTHROPIC_API_KEY`):

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
```

**Voice agent** — copy `voice-agent/.env.example` to `voice-agent/.env` and fill in the *same*
three values, plus your existing `ANTHROPIC_API_KEY`:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5
NEXTJS_BASE_URL=http://localhost:3000
```

Both `.env.local` and `voice-agent/.env` are git-ignored — never commit real keys/secrets.

## 3. Install and run

Two terminals, both left running while you test voice:

```bash
# Terminal 1 — the Next.js app (same as always)
npm install
npm run dev
```

```bash
# Terminal 2 — the voice agent (separate Python environment)
cd voice-agent
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python agent.py dev
```

`agent.py dev` connects to your LiveKit Cloud project and waits for a room to join — you'll see
log lines confirming the connection. Leave it running.

With both running: open `http://localhost:3000/practice`, click the **Voice** tab in the chat
panel, click **Start voice session**, and allow microphone access when the browser asks. Jacob
should speak his opening line, and both sides of the conversation appear as captions in the
panel and get written to the transcript, identically to a Text-mode conversation.

## What's new in the repo

| File | Purpose |
|---|---|
| `app/api/livekit-token/route.ts` | Mints a short-lived LiveKit join token for a session ID (server-only; the browser never sees `LIVEKIT_API_SECRET`) |
| `app/api/persona/route.ts` | Exposes the active persona (`lib/chat/persona.ts`) as JSON, so the Python agent doesn't duplicate the system prompt |
| `components/chat/VoicePanel.tsx` | Browser UI: connects to the LiveKit room, renders captions from the transcription data channel, mic start/mute/stop |
| `lib/chat/clientSession.ts` | The session-ID helpers (`loadSessionId`/`newSessionId`/`saveSessionId`), pulled out of `ChatPanel` so `VoicePanel` can share the exact same session ID |
| `voice-agent/agent.py` | The LiveKit Agents entrypoint: STT → Claude → TTS, writing every finalized turn to the transcript |
| `voice-agent/transcript_store.py` | Python mirror of `lib/chat/transcriptStore.ts` — same JSON file format, same `data/transcripts/` folder |
| `voice-agent/persona_client.py` | Fetches the persona from `/api/persona` instead of hardcoding it a second time |
| `app/api/voice/activity/route.ts` | Validates and describes an activity snapshot with the shared activity registry for the voice agent; with `record: true` it also logs the learner's update to the transcript |
| `voice-agent/activity_client.py` | Calls `/api/voice/activity` from the agent |

## How continuity between Text and Voice works

Starting Voice mode on a session that has no transcript yet creates one and has Jacob speak his
scripted opening line out loud (`get_or_create_transcript`, matching the Text tab's behavior for
a new session). Starting Voice mode on a session that already has messages — because the learner
typed first, or had an earlier voice call — loads the existing transcript, primes the LLM's chat
history from it, and stays silent (no repeated greeting); the learner can just start talking.
Every finalized turn, from either side, is appended live, so switching back to Text immediately
shows what was said by voice.

## Voice and the on-screen activities

The voice agent uses the same activity interface as the text chat: each activity registers
its state with `useActivityTools(activityId, state, onAction)` (`components/session/ActivityBridge.tsx`)
and describes itself in its definition under `lib/activities/`. Nothing activity-specific lives
in the voice code, so an activity connected to the bridge is visible to Jacob in voice mode too.

```
Activity component --useActivityTools--> ActivityBridge
VoicePanel --capture() every 500 ms, send on change--> LiveKit room, topic "telehealth.activity"
voice-agent/agent.py --POST /api/voice/activity--> activity registry (validate + describe)
                     <-- prompt context ---------
                     -> Jacob's instructions are updated; on a feelings-chart change he reacts out loud
```

- Opening an activity only updates Jacob's context. Changing the state of an activity in
  `REACTIVE_ACTIVITIES` (currently just `feelings`) also records an `activity` entry in the transcript
  and has Jacob respond in character.
- Chess and the whiteboard update Jacob's context but do not trigger a spoken reaction; chess turns still
  run through the text chat's turn flow (shown in the Text tab).
- Jacob has no activity tools in voice mode yet, so he can talk about the activity but not select a
  feeling or draw. That is the next step (send validated tool actions back to the browser and dispatch
  them through the ActivityBridge).
- The browser snapshot is untrusted: `/api/voice/activity` validates it exactly like `/api/chat` does.

## Checking speech recognition errors

The learner's lines in the transcript (`data/transcripts/<sessionId>.json`, or **Options → download**
in the Text tab) are exactly what the speech-to-text model heard. Compare them with what was said:
if those lines are wrong, the error is in recognition; if they are right but Jacob's reply is off, it
is in the LLM/persona step. Recognition is set to English only (`language="en"`), which was more
accurate than the multilingual mode.

## Known limits (prototype)

- Same file-based, process-local transcript storage as the Text tab (see `docs/chat-api.md`) —
  not safe for multiple server instances, and won't persist on a serverless host. The agent re-reads
  the file before each append so it doesn't overwrite entries the Next.js server adds during a call,
  but the two processes still don't share a lock.
- No authentication on the LiveKit token route — anyone who can reach the server can start a
  voice session for any session ID. Add login before real use, same as the rest of the app.
- Do not send real client or patient data through this voice pipeline — same guidance as the
  Text tab, now also covering a third-party speech-to-text/text-to-speech vendor via LiveKit
  Inference, in addition to the LLM provider.

## Changing the voice or STT/TTS models

`voice-agent/agent.py` hardcodes sensible defaults:

```python
stt=inference.STT("deepgram/nova-3", language="en"),
tts=inference.TTS("cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
```

Browse available models/voices at https://docs.livekit.io/agents/models/stt/ and
https://docs.livekit.io/agents/models/tts/ and swap the strings — no other code changes needed.
