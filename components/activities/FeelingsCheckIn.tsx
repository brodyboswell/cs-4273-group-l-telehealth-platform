"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FeelingsDrawing } from "./FeelingsDrawing";

const FEELINGS = [
  {
    label: "Calm",
    color: "#88A294",
    eyes: "M16 25 Q20 28 24 25 M32 25 Q36 28 40 25",
    mouth: "M21 35 Q28 39 35 35",
  },
  {
    label: "Happy",
    color: "#E8C84A",
    mouth: "M18 33 Q28 48 38 33 Z",
  },
  {
    label: "Excited",
    color: "#E8A060",
    eyes: "M16 24 Q20 15 24 24 M32 24 Q36 15 40 24",
    mouth: "M19 31 Q28 50 37 31 Z",
    brows: "M16 15 L23 13 M33 13 L40 15",
  },
  {
    label: "Proud",
    color: "#B07AC9",
    eyes: "M16 24 Q20 19 24 24 M32 24 Q36 19 40 24",
    mouth: "M20 34 Q28 43 38 32",
    brows: "M16 16 L23 16 M33 16 L40 16",
  },
  {
    label: "Worried",
    color: "#7BA3C9",
    mouth: "M20 38 Q28 31 36 38",
    brows: "M15 19 L24 15 M32 15 L41 19",
  },
  {
    label: "Sad",
    color: "#6B8FB8",
    eyes: "M17 26 L23 27 M33 27 L39 26",
    mouth: "M19 40 Q28 29 37 40",
    brows: "M16 19 L24 16 M32 16 L40 19",
  },
  {
    label: "Angry",
    color: "#D65A4A",
    mouth: "M19 40 Q28 30 37 40",
    brows: "M15 16 L24 21 M32 21 L41 16",
  },
  {
    label: "Frustrated",
    color: "#E89060",
    eyes: "M16 23 L24 26 L16 28 M40 23 L32 26 L40 28",
    mouth: "M19 37 L24 35 L29 38 L34 35 L38 37",
    brows: "M16 16 L23 19 M33 19 L40 16",
  },
  {
    label: "Tired",
    color: "#9B7AB8",
    eyes: "M16 26 L24 26 M32 26 L40 26",
    mouth: "M24 35 C24 30 32 30 32 35 C32 43 24 43 24 35 Z",
  },
  {
    label: "Lonely",
    color: "#88A294",
    eyes: "M18 28 L22 28 M34 28 L38 28",
    mouth: "M23 39 Q28 34 33 39",
    brows: "M16 20 Q20 21 24 17 M32 17 Q36 21 40 20",
  },
  {
    label: "Hopeful",
    color: "#E8C84A",
    mouth: "M21 35 Q28 43 35 35",
    brows: "M16 16 Q20 12 24 16 M32 16 Q36 12 40 16",
  },
  {
    label: "Unsure",
    color: "#E8A060",
    mouth: "M20 37 Q25 33 29 37 Q33 41 37 36",
    brows: "M16 17 L24 17 M32 16 Q37 11 41 16",
  },
] as const;

type Feeling = (typeof FEELINGS)[number];

function FeelingFace({ feeling }: { feeling: Feeling }) {
  return (
    <svg
      className="h-14 w-14 shrink-0 sm:h-16 sm:w-16"
      viewBox="0 0 56 56"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="28"
        cy="28"
        r="26"
        fill={feeling.color}
        stroke="#293C35"
        strokeWidth="2"
      />
      <g
        fill="none"
        stroke="#293C35"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {"eyes" in feeling ? (
          <path d={feeling.eyes} />
        ) : (
          <g fill="#293C35" stroke="none">
            <circle
              cx="20"
              cy={feeling.label === "Hopeful" ? 22 : 24}
              r="2.5"
            />
            <circle
              cx="36"
              cy={feeling.label === "Hopeful" ? 22 : 24}
              r="2.5"
            />
          </g>
        )}
        {"brows" in feeling && <path d={feeling.brows} />}
        <path
          d={feeling.mouth}
          fill={
            feeling.label === "Happy" ||
            feeling.label === "Excited" ||
            feeling.label === "Tired"
              ? "#293C35"
              : "none"
          }
        />
      </g>
    </svg>
  );
}

export function FeelingsCheckIn() {
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<Feeling | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-charcoal p-3 sm:p-6">
      <div className="mx-auto w-full max-w-2xl rounded-panel bg-white p-5 shadow-sm sm:px-10 sm:py-8">
        <div className="mb-4 flex justify-start">
          <button
            type="button"
            aria-pressed={drawing}
            onClick={() => setDrawing(!drawing)}
            className="flex items-center gap-2 rounded-panel border border-charcoal/30 bg-cream px-4 py-2 text-sm"
          >
            <Icon name={drawing ? "pointer" : "pen"} />
            {drawing ? "Select feelings" : "Draw on board"}
          </button>
        </div>
        <h1 className="text-2xl font-semibold text-charcoal">
          How are you feeling?
        </h1>
        <p id="feelings-instructions" className="sr-only">
          {drawing
            ? "Draw anywhere on the board to express how you feel."
            : "Select a feeling to talk about. All feelings are welcome."}
        </p>
        <div className="relative mt-6 pb-16">
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
            role="group"
            aria-label="Feelings"
            aria-describedby="feelings-instructions"
          >
            {FEELINGS.map((feeling) => {
              const active = selected?.label === feeling.label;
              return (
                <button
                  type="button"
                  key={feeling.label}
                  disabled={drawing}
                  aria-pressed={active}
                  onClick={() => setSelected(active ? null : feeling)}
                  className={`relative flex min-h-28 min-w-0 flex-col items-center justify-center gap-2 rounded-panel border-2 p-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal ${active ? "border-sage bg-sage/10" : "border-transparent hover:border-sage/50 hover:bg-cream"}`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-charcoal text-xs text-white"
                    >
                      <Icon name="check" width="14" height="14" />
                    </span>
                  )}
                  <FeelingFace feeling={feeling} />
                  <span className="text-sm text-charcoal">{feeling.label}</span>
                </button>
              );
            })}
          </div>
          <FeelingsDrawing enabled={drawing} />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {selected ? `Selected ${selected.label}` : "No feeling selected"}
        </p>
        <button
          type="button"
          onClick={() => setSelected(null)}
          disabled={!selected}
          className="mt-3 rounded-panel border border-charcoal/30 px-3 py-2 text-sm text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
