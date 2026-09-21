"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => {
    const module = await import("@excalidraw/excalidraw");
    return { default: module.Excalidraw };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-charcoal/60">
        Loading whiteboard…
      </div>
    ),
  },
);

export function WhiteboardCanvas() {
  const [hasContent, setHasContent] = useState(false);

  const handleChange = useCallback(
    (elements: readonly { isDeleted?: boolean }[]) => {
      // Keep this callback small for now. The next collaboration step will
      // turn Excalidraw scene changes into validated session operations.
      setHasContent(elements.some((element) => !element.isDeleted));
    },
    [],
  );

  return (
    <div className="flex h-full bg-charcoal">
      <div className="relative min-w-0 flex-1 p-6">
        <div className="relative h-full w-full overflow-hidden rounded-panel bg-white">
          <div className="absolute inset-0">
            <Excalidraw
              initialData={{
                appState: {
                  currentItemStrokeColor: "#293C35",
                  viewBackgroundColor: "#FFFFFF",
                },
              }}
              onChange={handleChange}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                },
                tools: {
                  image: false,
                },
              }}
            />
          </div>

          <div className="pointer-events-none absolute left-20 top-6 z-10 max-w-[14rem] rounded-sm border border-charcoal/10 bg-[#F5E6D8] px-3 py-2 text-sm text-charcoal shadow-sm">
            Draw a place you feel comfortable.
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full border border-charcoal/15 bg-cream px-3 py-1.5 text-xs text-charcoal">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="9" cy="8" r="3" />
              <circle cx="16" cy="9" r="2.5" />
              <path d="M2 20c0-3 3-5 7-5s7 2 7 5" />
              <path d="M14 15c2.5 0 5 1.5 5 4" />
            </svg>
            {hasContent ? "Draft in this session" : "Whiteboard ready"}
            <span className="h-2 w-2 rounded-full bg-sage" />
          </div>
        </div>
      </div>
    </div>
  );
}
