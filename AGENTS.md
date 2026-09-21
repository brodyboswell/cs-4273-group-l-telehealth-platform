# AGENTS.md
> Last updated: 2026-09-21 | Session: 1

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
npm run build
```

The repository also contains the original cross-stack unit-test exercises under `unit-tests/`.

---

## Architecture

**High-level design:**
The current app is a Next.js 15 App Router prototype using React 19 and Tailwind CSS. The practice room is composed from shared session chrome and activity-specific components. The whiteboard is currently a visual placeholder and is being replaced with a client-only Excalidraw editor. Future collaboration and audit persistence should remain separate from the canvas renderer so whiteboard actions can be associated with a telehealth session log.

```
[Practice room] -> [Activity route] -> [Whiteboard client editor]
                                      -> [Future session operation log]
                                      -> [Future collaboration service]
```

**Directory structure:**
```text
app/                         # Next.js routes and layouts
app/practice/whiteboard/     # Whiteboard activity route
components/activities/       # Activity-specific UI
components/session/          # Shared session shell, header, cameras, toolbar
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

- [x] Install `@excalidraw/excalidraw`.
- [x] Add a client-only Excalidraw wrapper compatible with Next.js SSR.
- [x] Replace the static whiteboard placeholder while preserving the session layout.
- [ ] Add the first whiteboard interaction/audit adapter after the editor renders.
