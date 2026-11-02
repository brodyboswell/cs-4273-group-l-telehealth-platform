"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, type FormEvent } from "react";
import type {
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  FileId,
} from "@excalidraw/excalidraw/types";
import { createDrawAnimation } from "@/lib/svg/createDrawAnimation";
import "@excalidraw/excalidraw/index.css";

type ToolType = "freedraw" | "eraser" | "selection" | "text" | "rectangle" | "ellipse";
type InkColor = { name: string; value: string };
type BoardAnimation = {
  markup: string;
  durationMs: number;
  width: number;
  height: number;
};
type SvgImageLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
};

const INKS: InkColor[] = [
  { name: "Dark green", value: "#293c35" },
  { name: "Red", value: "#cf5547" },
  { name: "Orange", value: "#df8b37" },
  { name: "Green", value: "#53886b" },
  { name: "Blue", value: "#477fb2" },
  { name: "Purple", value: "#8a63aa" },
];

const TOOLS: { type: ToolType; label: string; symbol: string }[] = [
  { type: "freedraw", label: "Draw", symbol: "✎" },
  { type: "eraser", label: "Erase", symbol: "▱" },
  { type: "selection", label: "Move", symbol: "↖" },
  { type: "text", label: "Write", symbol: "T" },
  { type: "rectangle", label: "Box", symbol: "□" },
  { type: "ellipse", label: "Circle", symbol: "◯" },
];

const Excalidraw = dynamic(
  async () => ({
    default: (await import("@excalidraw/excalidraw")).Excalidraw,
  }),
  {
    ssr: false,
    loading: () => <div className="canvas-loading">Getting your board ready…</div>,
  },
);

export function WhiteboardSandbox() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("freedraw");
  const [color, setColor] = useState(INKS[0].value);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [hasContent, setHasContent] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [animation, setAnimation] = useState<BoardAnimation | null>(null);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState) => {
      setActiveTool(appState.activeTool.type as ToolType);
      setColor(appState.currentItemStrokeColor);
      setStrokeWidth(appState.currentItemStrokeWidth);
      const hasVisibleElements = elements.some((element) => !element.isDeleted);
      setHasContent((current) =>
        current === hasVisibleElements ? current : hasVisibleElements,
      );
    },
    [],
  );

  function selectTool(tool: ToolType) {
    api?.setActiveTool({ type: tool, locked: tool !== "selection" });
  }

  function selectInk(ink: InkColor) {
    setColor(ink.value);
    api?.updateScene({ appState: { currentItemStrokeColor: ink.value } });
  }

  async function generateSvg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || !prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setStatus(null);
    setError(null);
    setGeneratedSvg(null);

    try {
      const response = await fetch("/api/generate-svg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "The drawing could not be generated.",
        );
      }
      if (
        !isRecord(data) ||
        typeof data.svg !== "string" ||
        typeof data.provider !== "string"
      )
        throw new Error("The server returned an invalid drawing.");

      const layout = getSvgImageLayout(api);
      setGeneratedSvg(data.svg);
      setProviderName(data.provider);
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!prefersReducedMotion) {
        const drawAnimation = createDrawAnimation(data.svg);
        setStatus("Drawing on the whiteboard…");
        setAnimation({
          ...drawAnimation,
          width: layout.displayWidth,
          height: layout.displayHeight,
        });
        await waitForPaint();
        await wait(drawAnimation.durationMs);
        setAnimation(null);
      }
      await addSvgImage(api, data.svg, layout);
      setStatus(
        data.provider === "mock"
          ? "Sample SVG added. Choose Anthropic or OpenAI in LLM_PROVIDER to use the LLM."
          : `SVG generated with ${data.provider} and added to the board.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The drawing could not be generated.",
      );
    } finally {
      setAnimation(null);
      setIsGenerating(false);
    }
  }

  return (
    <div className="prototype-page">
      <header className="prototype-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">✎</div>
          <div>
            <p className="brand-title">Practice Room</p>
            <p className="brand-subtitle">AI drawing sandbox</p>
          </div>
        </div>
        <span className="prototype-badge">SVG generation prototype</span>
      </header>

      <main className="prototype-main">
        <section className="board-column" aria-labelledby="board-title">
          <div className="board-heading">
            <div>
              <h2 id="board-title">Shared whiteboard</h2>
              <p>Try the familiar tools, then add an AI-generated SVG doodle.</p>
            </div>
            <span className="board-state">
              <span className="state-dot" aria-hidden="true" />
              {hasContent ? "Board has content" : "Blank board"}
            </span>
          </div>

          <div className="whiteboard-mock">
            <div className="whiteboard-toolbar" aria-label="Whiteboard tools">
              <div className="toolbar-group" role="group" aria-label="Drawing tools">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.type}
                    type="button"
                    className="tool-button"
                    aria-label={tool.label}
                    aria-pressed={activeTool === tool.type}
                    disabled={!api}
                    onClick={() => selectTool(tool.type)}
                  >
                    <span className="tool-symbol" aria-hidden="true">{tool.symbol}</span>
                    {tool.label}
                  </button>
                ))}
              </div>

              <span className="toolbar-divider" aria-hidden="true" />

              <div className="ink-group" role="group" aria-label="Ink colors">
                {INKS.map((ink) => (
                  <button
                    key={ink.value}
                    type="button"
                    className="ink-button"
                    style={{ backgroundColor: ink.value }}
                    aria-label={ink.name}
                    aria-pressed={color === ink.value}
                    title={ink.name}
                    disabled={!api}
                    onClick={() => selectInk(ink)}
                  >
                    {color === ink.value && <span className="ink-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>

              <span className="toolbar-divider" aria-hidden="true" />

              <label className="line-size-label">
                Line
                <select
                  className="line-size"
                  aria-label="Line size"
                  disabled={!api}
                  value={strokeWidth}
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    setStrokeWidth(width);
                    api?.updateScene({ appState: { currentItemStrokeWidth: width } });
                  }}
                >
                  <option value={1}>Thin</option>
                  <option value={2}>Medium</option>
                  <option value={4}>Thick</option>
                </select>
              </label>

              <button
                type="button"
                className="clear-button"
                disabled={!api || !hasContent || isGenerating}
                onClick={() => {
                  api?.resetScene();
                  setAnimation(null);
                  setGeneratedSvg(null);
                  setStatus("Board cleared.");
                }}
              >
                Clear
              </button>
            </div>

            <div className="canvas-frame">
              <Excalidraw
                excalidrawAPI={setApi}
                onChange={handleChange}
                initialData={{
                  appState: {
                    activeTool: {
                      type: "freedraw",
                      locked: true,
                      lastActiveTool: null,
                      customType: null,
                    },
                    currentItemStrokeColor: INKS[0].value,
                    currentItemStrokeWidth: 2,
                    viewBackgroundColor: "#ffffff",
                  },
                }}
                UIOptions={{
                  canvasActions: {
                    changeViewBackgroundColor: false,
                    loadScene: false,
                    saveToActiveFile: false,
                    toggleTheme: false,
                    export: false,
                  },
                  tools: { image: false },
                }}
              />
              {animation && (
                <div className="svg-animation-layer" aria-hidden="true">
                  <div
                    className="svg-animation-art"
                    style={{ width: animation.width, height: animation.height }}
                    dangerouslySetInnerHTML={{ __html: animation.markup }}
                  />
                </div>
              )}
              <span className="whiteboard-zoom-hint">Scroll to zoom · drag to pan</span>
            </div>
          </div>
        </section>

        <aside className="ai-panel" aria-labelledby="ai-panel-title">
          <div>
            <p className="panel-kicker">Proposal 3 · SVG</p>
            <h2 id="ai-panel-title">Ask the client to draw</h2>
          </div>
          <p className="panel-description">
            The model returns a small SVG. The sandbox checks it, animates the
            strokes as it draws, then adds a selectable, undoable image.
          </p>

          <form onSubmit={generateSvg}>
            <label className="prompt-label" htmlFor="drawing-prompt">Drawing prompt</label>
            <textarea
              id="drawing-prompt"
              className="prompt-input"
              maxLength={500}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Draw a small, friendly symbol for feeling nervous before a test."
            />
            <p className="prompt-count">{prompt.length}/500</p>
            <button
              className="generate-button"
              type="submit"
              disabled={!api || !prompt.trim() || isGenerating}
            >
              {isGenerating ? <span className="button-spinner" aria-hidden="true" /> : <span aria-hidden="true">✦</span>}
              {isGenerating ? "Generating…" : "Generate SVG and add"}
            </button>
          </form>

          {error && <p className="generation-error" role="alert">{error}</p>}
          {status && (
            <div className="generation-status" role="status">
              {providerName && <span className="provider-label">{providerName}</span>}
              <div>{status}</div>
            </div>
          )}

          {generatedSvg && (
            <details className="svg-details">
              <summary>Inspect generated SVG</summary>
              <pre className="svg-source">{generatedSvg}</pre>
              <button
                type="button"
                className="copy-button"
                onClick={() => void navigator.clipboard.writeText(generatedSvg)}
              >
                Copy SVG
              </button>
            </details>
          )}

          <p className="privacy-note">
            The prompt is sent to the configured model provider. Keep it to a
            generic drawing idea; this sandbox does not save prompts or drawings.
          </p>
        </aside>
      </main>
      <p className="sr-only" aria-live="polite">{status ?? ""}</p>
    </div>
  );
}

function getSvgImageLayout(api: ExcalidrawImperativeAPI): SvgImageLayout {
  const appState = api.getAppState();
  const zoom = appState.zoom.value || 1;
  const aspectRatio = 500 / 350;
  const visibleWidth = appState.width / zoom;
  const visibleHeight = appState.height / zoom;
  const width = Math.min(
    1_000,
    visibleWidth * 0.82,
    visibleHeight * 0.82 * aspectRatio,
  );
  const height = width / aspectRatio;
  return {
    x: -appState.scrollX + visibleWidth / 2 - width / 2,
    y: -appState.scrollY + visibleHeight / 2 - height / 2,
    width,
    height,
    displayWidth: width * zoom,
    displayHeight: height * zoom,
  };
}

async function addSvgImage(
  api: ExcalidrawImperativeAPI,
  svg: string,
  layout: SvgImageLayout,
) {
  const { CaptureUpdateAction, convertToExcalidrawElements } =
    await import("@excalidraw/excalidraw");
  const fileId = `llm-svg-${crypto.randomUUID()}` as FileId;
  const svgBytes = new TextEncoder().encode(svg);
  const binarySvg = Array.from(svgBytes, (byte) => String.fromCharCode(byte)).join("");
  const dataURL = `data:image/svg+xml;base64,${btoa(binarySvg)}` as DataURL;
  api.addFiles([
    {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL,
      created: Date.now(),
    },
  ]);

  const image = convertToExcalidrawElements(
    [
      {
        type: "image",
        fileId,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        status: "saved",
      },
    ],
    { regenerateIds: true },
  );

  api.updateScene({
    elements: [...api.getSceneElements(), ...image],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent(image, { fitToContent: true, animate: true });
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
