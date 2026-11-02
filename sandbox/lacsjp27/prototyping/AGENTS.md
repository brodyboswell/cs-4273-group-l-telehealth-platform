# AGENTS.md
> Last updated: 2026-10-28

## Project Overview

**What this is:** A local prototype for exploring ways an AI client could add drawings to the telehealth practice whiteboard. The first experiment asks a configured LLM for a simple SVG, sanitizes it, and inserts it as an image element in Excalidraw.

**Status:** Prototype

**How to run locally:**

```bash
npm run dev
```

Open `http://localhost:3100`. The dev launcher loads provider settings from the repository root `.env.local`; API keys stay on the server.

## Architecture

**High-level design:** The browser renders an Excalidraw canvas and the project-matching labeled toolbar. A prompt panel sends a drawing request to `app/api/generate-svg/route.ts`. The server calls the configured Anthropic or OpenAI provider, restricts the response to basic SVG shapes, and returns it to the browser. The client adds the sanitized SVG to Excalidraw as an undoable image element. With `LLM_PROVIDER=mock`, the route returns a local sample SVG for UI work.

```text
Prompt panel -> /api/generate-svg -> LLM provider
                                   -> SVG sanitizer -> Excalidraw image
```

**Directory structure:**

```text
app/                 # Next.js page, styles, and SVG generation API
components/           # Excalidraw canvas, controls, and prompt panel
lib/svg/              # SVG extraction and allowlist sanitizer
scripts/              # Local launcher that loads repository provider env
```

**Key dependencies:**
- Next.js 15 / React 19 — isolated local prototype UI and API route.
- `@excalidraw/excalidraw` 0.18.1 — same canvas/editor as the main project.

## Coding Conventions

- TypeScript and React; components use PascalCase and utility functions use camelCase.
- Keep the prototype self-contained under this directory; do not change the main app for experiments.
- Keep API keys server-side. Validate prompts and generated SVG before rendering.
- Do not persist prompts or generated drawings; use only non-sensitive example prompts.

## Domain Expert Context

**Active persona:** Full-stack product engineer prototyping AI-assisted interaction for clinical education.

**Key constraints:** Keep the whiteboard familiar to the existing practice room. Treat model output as untrusted. The SVG experiment should not execute scripts, load external resources, or become a hidden channel for clinical data.

**Preferred tools:** Excalidraw for parity with the existing activity; a small SVG allowlist for a reversible experiment that can later be compared with the validated-stroke proposal.

## Decisions & Gotchas Log

*Append-only. Add new entries at the top.*

---

**2026-10-28 — Start with sanitized SVG image insertion**
Context: The design note compares browser control, validated strokes, and model-generated SVG.
Decision: Start with model-generated SVG, allow only basic geometric shapes and safe drawing attributes, and insert the result as an Excalidraw image so native selection and undo remain available.
Rationale: This isolates the image-generation approach while keeping it easy to compare against later prototypes.
Gotcha: Some generated SVG constructs will be rejected by the allowlist; keep the prompt constrained to simple shapes.

## Next Up

- [ ] Compare SVG quality across a few non-sensitive drawing prompts.
- [ ] Prototype the validated-stroke proposal beside this SVG approach.
