"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { Icon } from "@/components/ui/Icon";
import "@excalidraw/excalidraw/index.css";

export function preloadWhiteboardEditor() {
  return import("@excalidraw/excalidraw");
}

const Excalidraw = dynamic(
  async () => ({ default: (await preloadWhiteboardEditor()).Excalidraw }),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="flex h-full items-center justify-center text-charcoal/60">
        Getting your board ready…
      </div>
    ),
  },
);

const TOOLS = [
  { type: "freedraw", label: "Draw", icon: "pen" },
  { type: "eraser", label: "Erase", icon: "eraser" },
  { type: "selection", label: "Move", icon: "pointer" },
  { type: "text", label: "Write", icon: "text" },
  { type: "rectangle", label: "Box", icon: "rectangle" },
  { type: "ellipse", label: "Circle", icon: "ellipse" },
] as const;
const COLORS = [
  { name: "Dark green", value: "#293c35" },
  { name: "Red", value: "#cf5547" },
  { name: "Orange", value: "#df8b37" },
  { name: "Green", value: "#53886b" },
  { name: "Blue", value: "#477fb2" },
  { name: "Purple", value: "#8a63aa" },
] as const;

export function WhiteboardCanvas() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [{ activeTool, color, strokeWidth }, setControls] = useState({
    activeTool: "freedraw",
    color: COLORS[0].value as string,
    strokeWidth: 2,
  });
  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (_, state) => {
      const next = {
        activeTool: state.activeTool.type,
        color: state.currentItemStrokeColor,
        strokeWidth: state.currentItemStrokeWidth,
      };
      // Pointer movement changes the scene frequently, but usually not the toolbar.
      setControls((previous) =>
        previous.activeTool === next.activeTool &&
        previous.color === next.color &&
        previous.strokeWidth === next.strokeWidth
          ? previous
          : next,
      );
    },
    [],
  );

  return (
    <div className="kid-whiteboard flex h-full flex-col gap-3 bg-charcoal p-3 sm:p-5">
      <div
        className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-cream p-3"
        aria-label="Whiteboard tools"
      >
        <div
          className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap"
          role="group"
          aria-label="Drawing tools"
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.type}
              type="button"
              disabled={!api}
              aria-pressed={activeTool === tool.type}
              onClick={() => {
                api?.setActiveTool({
                  type: tool.type,
                  locked: tool.type !== "selection",
                });
              }}
              className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40 ${activeTool === tool.type ? "border-charcoal bg-sage/25 text-charcoal" : "border-transparent text-charcoal hover:bg-sage/15"}`}
            >
              <Icon name={tool.icon} width="24" height="24" />
              {tool.label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-1 sm:gap-2 sm:border-l sm:border-charcoal/15 sm:pl-3"
          role="group"
          aria-label="Ink colors"
        >
          {COLORS.map((ink) => (
            <button
              key={ink.value}
              type="button"
              disabled={!api}
              aria-label={ink.name}
              aria-pressed={color === ink.value}
              title={ink.name}
              onClick={() => {
                api?.updateScene({
                  appState: { currentItemStrokeColor: ink.value },
                });
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40 ${color === ink.value ? "border-charcoal ring-2 ring-white" : "border-white"}`}
              style={{ backgroundColor: ink.value }}
            >
              {color === ink.value && <Icon name="check" />}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-charcoal">
          Line
          <select
            disabled={!api}
            value={strokeWidth}
            onChange={(event) =>
              api?.updateScene({
                appState: {
                  currentItemStrokeWidth: Number(event.target.value),
                },
              })
            }
            className="min-h-10 rounded-lg border border-charcoal/20 bg-white px-2"
            aria-label="Line size"
          >
            <option value={1}>Thin</option>
            <option value={2}>Medium</option>
            <option value={4}>Thick</option>
          </select>
        </label>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-white">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{
            appState: {
              activeTool: {
                type: "freedraw",
                locked: true,
                lastActiveTool: null,
                customType: null,
              },
              currentItemStrokeColor: COLORS[0].value,
              currentItemStrokeWidth: 2,
              viewBackgroundColor: "#ffffff",
            },
          }}
          onChange={handleChange}
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
      </div>
    </div>
  );
}
