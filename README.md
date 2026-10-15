# Virtual Client Telehealth Simulation Platform

**CS 4273 Capstone Design Project, Fall 2026 · Group L**

A prototype for social work students and early-career therapists to practice interviewing a virtual client and use interactive activities inside a simulated telehealth room.

## Run locally

Use Node.js 20 or newer and npm:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app redirects to `/practice`.

## Current features

- **Room:** Click the illustrated whiteboard, feelings chart, or chessboard to open an activity. Drag the objects to rearrange them; arrow keys move a focused object.
- **Whiteboard:** Draw, erase, move objects, write text, and create shapes with labeled tools, ink colors, line sizes, undo, and redo. Excalidraw loads only in the browser.
- **Feelings:** Select one of twelve feelings or draw over the board. Drawings have ink colors, undo, and clear controls.
- **Chess:** Two players on the same device can click or drag pieces to legal destinations. Includes promotion, game-over detection, move history, undo, and reset.
- **Chat:** Talk to Alex using an offline mock or a configured Anthropic/OpenAI provider. The server stores an ordered transcript of learner messages, client replies, and errors; transcripts can be downloaded as JSON or text.

Room positions, feelings drawings, whiteboard scenes, and chess games are local activity state and reset when leaving their routes. They are not yet synchronized or added to the session log. Settings, snapshot, remote client control, and ending a session are prototype UI placeholders.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Application regression tests use Node's test runner with `tsx`. They create isolated temporary transcripts and mock provider requests, so they never call paid providers or modify saved practice sessions. The first production build needs network access for the existing Google Fonts setup.

The original Python, JavaScript, and TypeScript exercises remain under `unit-tests/`. With Python 3 installed, run:

```bash
npm ci --prefix unit-tests/typescript
npm run test:exercises
```

## Stack and layout

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Excalidraw, and chess.js.

| Directory | Purpose |
|---|---|
| `app/` | Pages, layouts, and chat/transcript API routes |
| `components/activities/` | Room, feelings, whiteboard, and chess UI |
| `components/session/` | Shared header, participants, and toolbar |
| `components/chat/` | Chat interface |
| `lib/chat/` | Persona, provider requests, validation, and file-backed transcripts |
| `tests/` | Application regression tests |
| `unit-tests/` | Original cross-stack exercises |
| `public/` | Participant avatars and room artwork |
| `docs/` | API details, architecture, artwork provenance, and original UI references |

## Chat setup and limits

Copy `.env.example` to `.env.local` and configure a provider key if needed. With no key, chat uses deterministic canned replies. See [the chat API documentation](docs/chat-api.md) for configuration, endpoints, and transcript details.

The current chat uses a placeholder persona and unconstrained LLM replies, not the planned deterministic dialogue tree. Transcript endpoints have no authentication, and file storage is intended for a local prototype; it does not persist on serverless hosts. Locks serialize requests only within one server process.

## Planned work

- Research-approved scenarios and a deterministic dialogue tree.
- Authenticated sessions and persistent transcript storage.
- Ordered activity logs and replay, separate from the canvas renderer.
- Remote collaboration and rubric-based feedback.
