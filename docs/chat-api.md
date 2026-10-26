# Chat API & Session Transcripts

The Chat activity (`/practice/chat`) lets the learner talk to the virtual client **Alex**.
Replies come from an LLM (Claude or OpenAI) guided by the persona in `lib/chat/persona.ts`.
Every learner message and every client reply is written to a per-session transcript.

## Setup

1. Copy `.env.example` to `.env.local` (git-ignored, **never commit keys**).
2. Put in **one** key:
   - `ANTHROPIC_API_KEY=...` (default model `claude-haiku-4-5`), or
   - `OPENAI_API_KEY=...` (default model `gpt-4o-mini`)
3. `npm run dev`, open http://localhost:3000/practice/chat

With no key, the chat runs in **mock mode**: canned replies, no cost, useful for UI work.
Force a provider with `LLM_PROVIDER=anthropic|openai|mock`.

The key is only read inside the API route on the server. The browser never sees it.

## How it fits together

```
ChatPanel (browser)  --POST /api/chat {sessionId, message, activity?}-->  app/api/chat/route.ts
                                                                  1. append learner entry to transcript
                                                                  2. resolve and describe registered activity (if present)
                                                                  3. build history from the transcript
                                                                  4. lib/chat/llm.ts -> Anthropic / OpenAI / mock
                                                                  5. validate and append the reply and activity actions
                     <-- {reply, learnerEntry, transcript} ------
```

The conversation history always comes from the **server-side transcript**, not the browser.
That makes the transcript the single source of truth for grading and research.

## Activity context and tools

When an activity is open, its component registers its stable activity ID, current serializable state, and action handler through `useActivityTools` in `components/session/ActivityBridge.tsx`. `SessionShell` provides the bridge to both the activity and the persistent `ChatPanel`. A learner chat send includes the current `{ activityId, state }` snapshot alongside the unchanged message. Chess can also request a client turn through that same bridge after a learner move; this request has no fabricated chat message.

Example request while the feelings chart is open:

```json
{
  "sessionId": "demo-session-1",
  "message": "I don't know how to describe it.",
  "activity": {
    "activityId": "feelings",
    "state": { "selectedMoodId": null }
  }
}
```

The browser snapshot is untrusted. `lib/activities/catalog.ts` contains the allowed activity definitions; `lib/activities/registry.ts` rejects unknown IDs and validates the state before using the activity's server-authored description and tool schemas. Only the active activity's tools are sent to the provider. Anthropic and OpenAI requests are mapped from the shared schema in `lib/chat/llm.ts`; the mock provider uses an optional deterministic `mockInput`.

Chess state contains a game ID, turn epoch, FEN, learner color, and the ordered moves from the standard starting position. The server replays that history with `chess.js`, verifies the resulting FEN, and derives legal moves itself. On the client turn, `play_chess_move` receives a state-specific list of exact move IDs (including distinct promotion choices); the server rejects any move outside that list. The offline mock chooses the first currently legal option. After validating the selected move, the server derives the client-facing move description from the resulting chess move (including captures, castling, promotion, check, and checkmate); freeform model prose cannot override that line.

The board-triggered turn uses this request form after a learner move. `event` is validated against the reconstructed board; an opening event is used when the learner chose Black.

```json
{
  "sessionId": "demo-session-1",
  "activityTurn": {
    "activity": {
      "activityId": "chess",
      "state": {
        "gameId": "chess-game-123",
        "turnEpoch": 1,
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "moveHistory": [{ "from": "e2", "to": "e4" }],
        "learnerColor": "w"
      }
    },
    "requestId": "chess-game-123-1",
    "event": {
      "type": "learner_move",
      "input": { "move": { "from": "e2", "to": "e4" } }
    }
  }
}
```

The server validates each provider call with that activity tool's `parseInput` before returning it. Accepted actions are recorded on the virtual-client transcript entry, next to the reply. Rejected calls create a system audit entry and are never dispatched. `ChatPanel` dispatches accepted actions only to the same mounted activity instance captured for the request; the chess board also rechecks the action against its current FEN and turn epoch before applying it. Turn request IDs make successful board-triggered requests idempotent.

When an activity with tools becomes active, the server adds a short virtual-client message such as “I can interact with the feelings chart while we talk.” The notice is transcript-backed and records the activity and announced tool names. It is sent once for a stable activity/tool set, then repeated only when the learner returns to that activity or the available tool set changes.

### Adding an activity

1. Add a definition under `lib/activities/` with an ID, short label, state parser, state description, provider-neutral tool schemas, and an input parser for each action. Definitions can derive tool availability from validated state and validate a board-triggered turn event.
2. Add the definition to `lib/activities/catalog.ts`. The server registry will then accept its ID and offer its tools only while that activity is active.
3. In the activity component, call `useActivityTools(activityId, serializableState, onAction)`. Keep the state limited to the information the client needs to see and act on; apply only the action names and inputs that component understands.
4. Add registry and chat API coverage for valid and invalid state/actions. Provider-specific chat code should not need activity-specific branches.

The feelings chart provides `select_mood`, validates the selected mood against `MOOD_OPTIONS`, and updates the selected card through the bridge. Chess provides `play_chess_move`, derives legal options from replayed state, and requests automatic client turns through the same bridge and chat service.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/chat` | Learner chat body `{ "sessionId": "...", "message": "...", "activity?": { ... } }` → reply and transcript; or board-turn body `{ "sessionId": "...", "activityTurn": { "activity": { ... }, "requestId": "...", "event": { ... } } }` → activity event, required client tool action, and transcript |
| GET | `/api/transcripts/:sessionId` | Transcript as JSON (creates the session and its opening line if it's new) |
| GET | `/api/transcripts/:sessionId?format=txt` | Readable text transcript; add `&download=1` to download |
| GET | `/api/transcripts` | List of all recorded sessions (newest first) |

Errors return `{ "error": "..." }` with status 400 (bad input), 413 (message > 2000 chars),
500 (missing key / storage), 502 (provider error, e.g. bad key or quota), 504 (timeout).

Example:

```bash
curl -X POST localhost:3000/api/chat -H "content-type: application/json" \
  -d '{"sessionId":"demo-session-1","message":"Hi Alex, how are you doing today?"}'
curl "localhost:3000/api/transcripts/demo-session-1?format=txt"
```

## Transcript format

Saved as `data/transcripts/<sessionId>.json` (change the folder with `TRANSCRIPT_DIR`):

```json
{
  "sessionId": "38b207a2-...",
  "personaId": "alex-rapport-v1",
  "personaName": "Alex",
  "createdAt": "2026-09-28T17:18:25.506Z",
  "updatedAt": "2026-09-28T17:18:25.684Z",
  "entries": [
    { "seq": 1, "speaker": "system", "text": "Session started with virtual client Alex (alex-rapport-v1).", "timestamp": "..." },
    { "seq": 2, "speaker": "virtual_client", "text": "Hey. Um… my advisor said I should do this.", "timestamp": "...", "model": "scripted:opening-line" },
    { "seq": 3, "speaker": "virtual_client", "text": "I can interact with the feelings chart while we talk.", "timestamp": "...", "activityNotice": { "activityId": "feelings", "toolNames": ["select_mood"] } },
    { "seq": 4, "speaker": "learner", "text": "Hi Alex, thanks for coming in today.", "timestamp": "...", "activity": { "activityId": "feelings", "state": { "selectedMoodId": null } } },
    { "seq": 5, "speaker": "virtual_client", "text": "I think I'm worried.", "timestamp": "...", "model": "anthropic:claude-haiku-4-5", "latencyMs": 812, "actions": [{ "activityId": "feelings", "tool": "select_mood", "input": { "type": "select_mood", "moodId": "worried", "rationale": "Something has been on my mind." } }] },
    { "seq": 6, "speaker": "activity", "text": "The learner played e2e4. It is your turn to move.", "timestamp": "...", "activity": { "activityId": "chess", "state": { "gameId": "chess-game-123", "turnEpoch": 1, "fen": "...", "moveHistory": [{ "from": "e2", "to": "e4" }], "learnerColor": "w" } }, "activityEvent": { "activityId": "chess", "requestId": "chess-game-123-1", "actor": "learner", "type": "move", "text": "The learner played e2e4. It is your turn to move.", "input": { "move": { "from": "e2", "to": "e4" } } } },
    { "seq": 7, "speaker": "virtual_client", "text": "I move my pawn from e7 to e5.", "timestamp": "...", "activityTurnId": "chess-game-123-1", "actions": [{ "activityId": "chess", "tool": "play_chess_move", "input": { "type": "play_chess_move", "move": { "from": "e7", "to": "e5" }, "spokenText": "I move my pawn from e7 to e5.", "gameId": "chess-game-123", "turnEpoch": 1, "fen": "..." } }] }
  ]
}
```

- `speaker`: `learner` (spoken student message), `activity` (nonverbal activity event), `virtual_client` (Alex or a platform-generated client-facing notice), `system` (session start, failed replies, rejected tool calls).
- `activity` stores the validated activity snapshot; `activityEvent` records a structured nonverbal event separately from speech; `actions` stores validated tool calls; `activityNotice` records which tools a visible client notice announced; `activityTurnId` is the idempotency key for a chess turn response.
- `seq` is strictly increasing; messages in the same session are processed one at a time within one server process. Locks do not coordinate separate workers or server instances.
- If the AI fails, the learner's message or activity event is still kept and a `system` entry records the failure.

The session ID is kept in the browser tab's `sessionStorage`, so moving between the
Whiteboard, Chess and Chat keeps the same session. **New session** starts a fresh one.

## Changing the virtual client

Edit `lib/chat/persona.ts` (`systemPrompt`, `openingLine`). The current Alex scenario is a
placeholder until the research team provides approved scenarios.

## Known limits (prototype)

- **No authentication**: anyone who can reach the server can read transcripts. Add login before real use.
- **File storage** doesn't persist on serverless hosts (e.g. Vercel). Replace `lib/chat/transcriptStore.ts`
  with a database, keeping the same functions.
- Replies are generated by an LLM, not the planned deterministic dialogue tree.
  Do not send real client or patient data to a third-party AI provider.

## Validation and storage errors

Input rules are shared between browser and server in `lib/chat/validation.ts`. Stored transcripts are checked for session identity and contiguous entry sequences before use; corrupt files are left intact and surfaced as errors. All transcript and chat responses use `Cache-Control: no-store`, including errors. Writes use unique temporary files and atomic rename, with temporary-file cleanup. Transcript listing reads files in bounded batches.

The chat UI cancels stale transcript loads when switching sessions. If a chat response is lost, it reloads the authoritative transcript before reporting the uncertain send, rather than assuming the learner message was never recorded.
