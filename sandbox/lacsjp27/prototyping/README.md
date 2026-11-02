# AI Whiteboard Drawing Prototype

An isolated Excalidraw sandbox that mirrors the main project's whiteboard controls and tests model-generated SVG doodles.

## Run

From this directory:

```bash
npm run dev
```

Then open <http://localhost:3100>. The launcher reads provider configuration from the repository root `.env.local` without copying keys into this sandbox.

Set `LLM_PROVIDER` to `anthropic` or `openai` and configure the matching API key in the repository root `.env.local` to generate with an LLM. With `LLM_PROVIDER=mock` (or with no key configured), the prototype inserts a local sample SVG so the canvas can still be explored.

The SVG is validated on the server, inserted as an image element, and can be selected, moved, deleted, or undone in Excalidraw. Prompts and drawings are kept in browser memory only.
