"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

type Stroke = { color: string; points: string };
type ActiveStroke = Stroke & {
  pointerId: number;
  bounds: DOMRect;
  lastX: number;
  lastY: number;
};

const StrokeLine = memo(function StrokeLine({ stroke }: { stroke: Stroke }) {
  return (
    <polyline
      points={stroke.points}
      fill="none"
      stroke={stroke.color}
      strokeWidth="3"
      vectorEffect="non-scaling-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

export function FeelingsDrawing({ enabled }: { enabled: boolean }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [preview, setPreview] = useState<Stroke | null>(null);
  const [color, setColor] = useState("#293c35");
  const activeStroke = useRef<ActiveStroke | null>(null);
  const frame = useRef<number | null>(null);

  const finishStroke = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const current = activeStroke.current;
    if (!current) return;
    activeStroke.current = null;
    setStrokes((previous) => [
      ...previous,
      { color: current.color, points: current.points },
    ]);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!enabled) finishStroke();
  }, [enabled, finishStroke]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <>
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-label="Feelings drawing board"
        className={`absolute inset-0 h-full w-full ${enabled ? "touch-none cursor-crosshair" : "pointer-events-none"}`}
        onPointerDown={(event) => {
          if (
            !enabled ||
            !event.isPrimary ||
            event.button !== 0 ||
            activeStroke.current
          )
            return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * 1000;
          const y = ((event.clientY - bounds.top) / bounds.height) * 1000;
          const stroke = { color, points: `${x},${y} ${x + 0.1},${y + 0.1}` };
          activeStroke.current = {
            ...stroke,
            pointerId: event.pointerId,
            bounds,
            lastX: event.clientX,
            lastY: event.clientY,
          };
          setPreview(stroke);
        }}
        onPointerMove={(event) => {
          const current = activeStroke.current;
          if (!current || current.pointerId !== event.pointerId) return;
          if (
            Math.hypot(
              event.clientX - current.lastX,
              event.clientY - current.lastY,
            ) < 1
          )
            return;
          const { bounds } = current;
          current.points += ` ${((event.clientX - bounds.left) / bounds.width) * 1000},${((event.clientY - bounds.top) / bounds.height) * 1000}`;
          current.lastX = event.clientX;
          current.lastY = event.clientY;
          // Render only the live stroke once per frame; completed strokes stay memoized.
          if (frame.current === null)
            frame.current = requestAnimationFrame(() => {
              frame.current = null;
              const stroke = activeStroke.current;
              if (stroke)
                setPreview({ color: stroke.color, points: stroke.points });
            });
        }}
        onPointerUp={(event) => {
          if (activeStroke.current?.pointerId === event.pointerId)
            finishStroke();
        }}
        onPointerCancel={(event) => {
          if (activeStroke.current?.pointerId === event.pointerId)
            finishStroke();
        }}
      >
        {strokes.map((stroke, index) => (
          <StrokeLine key={index} stroke={stroke} />
        ))}
        {preview && <StrokeLine stroke={preview} />}
      </svg>
      {enabled && (
        <div
          className="absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-2 rounded-panel border bg-white p-2"
          aria-label="Drawing tools"
        >
          <label className="flex items-center gap-2 text-sm">
            Ink{" "}
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Drawing color"
              className="h-8 w-8"
            />
          </label>
          <button
            type="button"
            disabled={!strokes.length || !!preview}
            onClick={() => setStrokes((previous) => previous.slice(0, -1))}
            className="rounded border px-2 py-1 text-sm disabled:opacity-40"
            aria-label="Undo drawing"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!strokes.length || !!preview}
            onClick={() => setStrokes([])}
            className="rounded border px-2 py-1 text-sm disabled:opacity-40"
            aria-label="Clear drawing"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}
