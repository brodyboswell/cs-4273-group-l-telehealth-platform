# AGENTS.md
> Last updated: 2026-10-26

## Project Overview

**What this is:**
An interactive mock-telehealth training platform for social work students and early-career therapists. Learners practice clinical interviewing with a deterministic virtual client, structured activities, and auditable session feedback.

**Status:** Prototype

**How to run locally:**
```bash
npm install
npm run dev
```

Open `http://localhost:3000`; the app redirects to `/practice`.

**Tests and checks:**
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The repository also contains the original cross-stack unit-test exercises under `unit-tests/`.

---

## Architecture

**High-level design:**
The current app is a Next.js 15 App Router prototype using React 19 and Tailwind CSS. The shared practice shell owns one persistent chat panel and an activity bridge. The active activity registers a validated state snapshot and provider-neutral tool definitions; the server registry adds activity context to the LLM request, validates returned actions, and stores them in the transcript. The welcome room and activity routes render beside chat on larger screens; chat expands from a right-edge tab on narrow screens. The whiteboard uses a client-only Excalidraw editor. Future collaboration and audit persistence should remain separate from the canvas renderer so whiteboard actions can be associated with a telehealth session log.

```
[Practice room shell] -> [Activity route] -> [Whiteboard client editor]
                      -> [Activity bridge] -> [Server activity registry]
                      -> [Persistent chat] -> [Transcript API + LLM tools]
                      -> [Future session operation log]
                      -> [Future collaboration service]
```

**Directory structure:**
```text
app/                         # Next.js routes and layouts
app/practice/whiteboard/     # Whiteboard activity route
components/activities/       # Activity-specific UI
components/chat/             # Persistent conversation panel
components/session/          # Shared session shell, header, cameras, toolbar
lib/activities/              # Activity definitions, validation, tools, and registry
docs/                        # Architecture and UI prototype references
unit-tests/                  # Cross-stack unit-test exercises
public/                      # Static images and avatars
```

**Key dependencies:**
| Library | Version | Why it's here |
|---|---|---|
| Next.js | 15.x | App Router and application shell |
| React | 19.x | UI components |
| Tailwind CSS | 3.x | Existing visual system |
| Excalidraw | 0.18.1 | Drop-in client-side whiteboard editor |

---

## Coding Conventions

**Language(s):** TypeScript, React, Next.js App Router

**Naming:**
- Files and directories use the existing PascalCase component convention and lowercase route convention.
- Components use PascalCase.
- Variables and functions use descriptive camelCase names.
- Constants use descriptive `UPPER_SNAKE_CASE` names where appropriate.

**Comments:**
- Explain why a non-obvious integration or security decision exists.
- Keep comments short and avoid narrating obvious JSX.

**Error handling:**
- Surface connection and loading failures to the user with human-readable states.
- Do not silently discard whiteboard synchronization failures once collaboration is added.

**Testing:**
- Run a production build after UI/library integration changes.
- Add unit tests for whiteboard state/operation handling before adding persistence.
- Add browser-level tests for drawing, text, erasing, and route loading when test infrastructure is established.

---

## Domain Expert Context

**Active persona:** Senior full-stack product engineer for privacy-sensitive clinical education software.

**Domain vocabulary:**
- **Practice session:** A simulated clinical interview between the learner and the virtual client.
- **Activity tool:** An interactive exercise such as chat, feelings check-in, whiteboard, or chess.
- **Session log:** Ordered record of learner inputs, client outputs, state transitions, and tool actions used for rubric evaluation.
- **Simulator:** The deterministic virtual-client system; it should not generate unconstrained clinical dialogue or unlogged tool actions.

**Key domain constraints:**
- Preserve the existing visual session shell and activity navigation.
- Treat whiteboard actions as session data that will eventually need ordering, attribution, replay, and rubric evaluation.
- Keep activity-specific state parsers, context descriptions, tool schemas, and action parsers in activity definitions; do not add activity-specific branches to provider adapters.
- Validate activity snapshots and tool inputs on the server. Record tool actions and rejected calls in the session transcript before applying accepted actions in the browser.
- Do not claim HIPAA compliance from the UI implementation alone; avoid sending sensitive data to unreviewed third-party services.
- Keep the renderer replaceable by separating canvas state from future collaboration/audit operations.

**Preferred libraries/tools and why:**
- Excalidraw — provides drawing, text, erasing, selection, undo, and export without requiring a custom canvas editor for the prototype.
- Zod — planned for validating whiteboard operations at the application boundary.
- A self-hosted WebSocket room service — planned for authenticated session collaboration and ordered operation delivery.

---

## Decisions & Gotchas Log

*Append-only. Add new entries at the top.*

---

**2026-10-26 — Route invited client doodles through the whiteboard activity tool**
Context: Learners may invite the virtual client to draw a simple situation on the Excalidraw whiteboard, and the action needs to remain reviewable in the session transcript.
Decision: Add `replace_whiteboard_with_doodle` with bounded normalized freehand strokes and an optional short caption. Validate the payload in the server activity registry, record accepted and rejected calls through the existing transcript flow, and apply accepted doodles to Excalidraw as one undoable scene replacement. The activity context instructs the client to draw only after a direct learner invitation; the offline mock does not produce doodles.
Rationale: Keeps provider adapters activity-neutral, avoids passing raw Excalidraw data or images through the model, and lets the learner undo the replacement.
Gotcha: The transcript stores the validated client doodle action, while learner-created board content and the complete canvas scene are not persisted or synchronized between participants.

---

**2026-10-22 — Pass active activity context and actions through shared chat**
Context: The virtual client needs to understand the activity beside chat and interact with it while keeping every action auditable.
Decision: Each activity registers its stable ID, serializable state, and action handler through `ActivityBridge`. A server-side activity registry validates the snapshot, generates activity context, and provides only that activity's tools to the provider. Provider tool calls are parsed into a shared format, validated by the activity definition, recorded in the transcript, and dispatched only to the activity instance that was active when the learner sent the message. A logged client-facing notice explains when tools become available.
Rationale: Adding an activity requires an activity definition and handler, without adding provider-specific activity logic to chat.
Gotcha: The feelings chart is the first registered activity. Chess and whiteboard tools still need definitions and their own interaction tests; file-based transcripts and unauthenticated endpoints retain their existing prototype limits.

---

**2026-10-21 — Show persistent chat in the welcome room**
Context: The shared chat remained mounted but was hidden on `/practice`, leaving the main room without the conversation.
Decision: Use the same side chat layout for `/practice` as for activity routes, while keeping the welcome room's warm camera rail. The narrow-screen Chat tab applies there too.
Rationale: The therapist can begin and continue a conversation in the main room, then open an activity without losing the draft or chat state.

---

**2026-10-21 — Keep chat beside practice activities**
Context: Chat and the feelings, chess, and whiteboard activities were separate routes; navigating to an activity removed the conversation from view and remounted chat when returning.
Decision: Mount one `ChatPanel` in `SessionShell`. Show it full width on `/practice/chat` and in a right column on activity routes. At widths up to 700px, keep a right-edge Chat tab that expands the panel over the activity. Adapt the feelings grid to the activity pane width, and keep transcript downloads and New session in a compact Options menu.
Rationale: The learner can continue the same conversation while using an activity, and draft text and in-flight chat state survive route changes without duplicating the panel.
Gotcha: This is a layout and navigation change. Activity requests and structured client tool actions still need the session-operation adapter before they can be replayed or graded.

---

**2026-10-15 — Login UI placeholder (issue #24)**
Context: The app needs a login screen that a real auth backend can be connected to later.
Decision: Add `/login` (now the root redirect target) with a `LoginForm` that calls `signIn` in `lib/auth/mockAuth.ts` through typed `LoginCredentials`/`LoginResult`. The mock accepts any input and redirects to `/practice`. Inputs are uncontrolled, read only on submit, never logged or persisted, and the form is reset before navigating. The toolbar's End session button calls the mock `signOut` and replaces the route with `/login`.
Rationale: Swapping the mock for a real `signIn` implementation requires no UI changes; failure results and thrown errors already render human-readable messages.
Gotcha: `/practice` routes are not protected — there is no session or token yet. Add route protection (e.g. middleware) when the backend lands.

---

**2026-10-06 — Randomize mock chess moves**
Context: The initial move mock always selected the first legal option, so games repeated the same simplistic move pattern.
Decision: Select uniformly at random from the current legal move list; continue validating the choice against chess.js before applying it.
Rationale: Gives prototype games more variation while preserving legal-move enforcement.
Gotcha: Random selection is intentionally not strategic; use an LLM or chess engine for meaningful play.

---

**2026-10-06 — Mock virtual-client chess moves**
Context: ChessBoard supported local human moves through chess.js but had no client move request/response boundary.
Decision: Add typed chess move requests and validated `play_chess_move` actions behind a deterministic local mock. Let the learner choose a color, automatically request a client move on its turn, display a short inline client line, and undo a completed human/client turn as a pair.
Rationale: Exercises the same request/parse/apply boundary as FeelingsCheck while keeping legal move enforcement in chess.js and avoiding premature provider or browser-control integration.
Gotcha: Chess state and client utterances remain local to the activity and are not yet written to the session transcript. The mock picks the first legal move; replace its strategy when LLM-backed play is added.

---

**2026-10-01 — Repository cleanup and regression checks**
Context: Repository review found unused prototype code, per-pointer chess history recomputation, drawing redraw overhead, stale chat request races, and inconsistent transcript error handling.
Decision: Remove the unused annotation rail, old raster avatars, unused feeling prompts/persona registry, and unused toolbar spacing token. Cache chess derivations per position and use chess.js move/undo history directly. Batch feelings drawing updates by animation frame. Share chat validation, abort stale transcript loads, reconcile uncertain sends with the server log, validate stored/provider data, return consistent uncached JSON errors, and bound transcript archive reads. Add ESLint, typecheck, and isolated Node/tsx regression tests; explicitly scope Next.js file tracing to the repository.
Rationale: Reduces unnecessary work while preserving the session UI and activity behavior; regression checks cover ordered logs, corrupt files, storage failures, and provider parsing. Original exercises and design/artwork provenance remain in the repository. Patch updates and dependency overrides address pinned transitive advisories without replacing the framework or editor.
Gotcha: Transcript locks are process-local. Authentication and shared durable storage still require separate implementation before using multiple server instances.

---

**2026-10-01 — Child-friendly whiteboard controls and simpler avatars**
Context: The default editor's unlabeled tools, shortcut numbers, and canvas instructions were confusing; participant artwork needed a cleaner style.
Decision: Replace Excalidraw's advanced tool chrome with six labeled tools, ink swatches, and a line-size picker through its public imperative API. Start with drawing active and keep native undo/redo with visible labels. Scope editor CSS to the whiteboard; simplify the two existing avatar SVGs using consistent flat shapes and facial features.
Rationale: Keeps the editor's drawing, text, selection, erasing, and history behavior while making everyday controls easier to identify. No generated raster images or external avatar service is required.
Gotcha: The scoped chrome and history-label CSS depends on Excalidraw 0.18.1 class names; check desktop and mobile controls after upgrades.

---

**2026-10-01 — Restore the warm room and simplify activity chrome**
Context: Client feedback preferred the original comforting room illustration and a quieter interface, with a larger chessboard and obvious click affordances.
Decision: Use an edited original room background and transparent activity artwork instead of the flat SVG room. Keep object drag behavior, use pointer cursors on hover and grabbing only during a drag, and show activity labels on hover/focus. Remove static rapport/time and redundant activity text. Share consistent line icons and render chess pieces as SVG; size the board against its available container with responsive controls.
Rationale: Retains the original visual character and existing interactions while reducing clutter and making better use of screen space.

---

**2026-10-01 — Direct activity interaction and pointer dragging**
Context: The baked-in welcome-room image produced a browser drag ghost and only its labels were clickable.
Decision: Render the room and its three activity objects with code-native SVG. The objects open their routes on click and move within room bounds on pointer drag or arrow keys. Feelings supports an SVG drawing overlay, and chess pointer drops use the existing chess.js legal moves and promotion flow.
Rationale: Separate objects can move without leaving duplicate objects in a background image; pointer capture supports mouse, pen, and touch without native image dragging.
Gotcha: Room positions and feelings drawings are local component state, reset on route changes, and are not yet connected to the session audit log. The room illustration is recreated rather than the original flattened artwork.

---

**2026-09-28 — LLM-backed chat with a server-side transcript**
Context: The Chat activity was a placeholder; the virtual client needs to reply to the learner and every exchange must be logged.
Decision: `POST /api/chat` calls Anthropic or OpenAI with plain `fetch` (no SDK), keys only in `.env.local`, with a mock provider when no key is set. Each session is a JSON transcript in `data/transcripts/` (git-ignored), written through `lib/chat/transcriptStore.ts`. See `docs/chat-api.md`.
Rationale: The key never reaches the browser; LLM history is rebuilt from the stored transcript, so the log is authoritative; a per-session lock keeps `seq` strictly ordered.
Gotcha: This is unconstrained LLM dialogue, unlike the planned deterministic dialogue tree. Persona text in `lib/chat/persona.ts` is a placeholder pending research-team scenarios. File storage won't persist on serverless hosts, and the transcript endpoints have no auth yet.

---

**2026-09-21 — Use Excalidraw for the initial whiteboard**
Context: The repository had a visual-only whiteboard placeholder with a custom toolbar, while the feature requires drawing, typing, color selection, and erasing.
Decision: Embed `@excalidraw/excalidraw` in the existing `/practice/whiteboard` route using a client-only component.
Rationale: It provides a working whiteboard editor quickly and is compatible with the existing React/Next.js stack. The application will still need its own session-operation adapter for auditability and future real-time authorization.
Alternatives considered: React-Konva or Fabric.js would provide more renderer-level control but require implementing more editor behavior; tldraw has stronger built-in sync but requires a production license.

---

**2026-09-21 — Load Excalidraw client-side only**
Context: Next.js prerenders routes by default, while Excalidraw depends on browser canvas and DOM APIs.
Decision: Load the Excalidraw component with `next/dynamic` and `ssr: false`, and import its stylesheet from the client component.
Rationale: This keeps the existing App Router route buildable while retaining a lightweight loading state.
Gotcha: Production builds may also need network access for the existing Google Fonts setup; a sandboxed build can fail before reaching application code if `next/font` cannot download Inter.

---

**2026-09-21 — Preserve the custom session shell**
Context: The UI foundation defines a consistent header, camera rail, bottom toolbar, and activity layout.
Decision: Replace only the placeholder canvas area and toolbar behavior; keep the surrounding session chrome intact.
Rationale: The whiteboard should feel like an activity inside the telehealth practice room rather than a separate standalone application.

---

## Next Up

- [ ] Replace the deterministic chess move mock with an LLM-backed strategy.
- [ ] Add ordered chess move and client-line entries to the session log.
- [ ] Register chess and whiteboard interactions through the activity tool bridge.
- [x] Install `@excalidraw/excalidraw`.
- [x] Add a client-only Excalidraw wrapper compatible with Next.js SSR.
- [x] Replace the static whiteboard placeholder while preserving the session layout.
- [x] Add the first whiteboard interaction/audit adapter after the editor renders.
