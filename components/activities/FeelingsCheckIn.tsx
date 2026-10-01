"use client";

import { useState } from "react";
import {
  MOOD_OPTIONS,
  parseMoodAgentAction,
  type MoodAgentAction,
  type MoodId,
} from "@/lib/mood/moodTypes";
import { requestMockAgentMood } from "@/lib/mood/mockAgent";
import { AnnotationToolbar } from "./AnnotationToolbar";

const FACE_DETAILS: Record<
  MoodId,
  {
    eyes?: string;
    brows?: string;
    mouth: string;
    prompt: string;
  }
> = {
  calm: {
    eyes: "M16 25 Q20 28 24 25 M32 25 Q36 28 40 25",
    mouth: "M21 35 Q28 39 35 35",
    prompt: "What is helping you feel calm?",
  },
  happy: {
    mouth: "M18 33 Q28 48 38 33 Z",
    prompt: "What brought you joy today?",
  },
  excited: {
    eyes: "M16 24 Q20 15 24 24 M32 24 Q36 15 40 24",
    brows: "M16 15 L23 13 M33 13 L40 15",
    mouth: "M19 31 Q28 50 37 31 Z",
    prompt: "What are you excited about?",
  },
  proud: {
    eyes: "M16 24 Q20 19 24 24 M32 24 Q36 19 40 24",
    brows: "M16 16 L23 16 M33 16 L40 16",
    mouth: "M20 34 Q28 43 38 32",
    prompt: "What is something you feel proud of?",
  },
  worried: {
    brows: "M15 19 L24 15 M32 15 L41 19",
    mouth: "M20 38 Q28 31 36 38",
    prompt: "What is on your mind right now?",
  },
  sad: {
    eyes: "M17 26 L23 27 M33 27 L39 26",
    brows: "M16 19 L24 16 M32 16 L40 19",
    mouth: "M19 40 Q28 29 37 40",
    prompt: "What has been making you feel sad?",
  },
  angry: {
    brows: "M15 16 L24 21 M32 21 L41 16",
    mouth: "M19 40 Q28 30 37 40",
    prompt: "What happened that made you feel angry?",
  },
  frustrated: {
    eyes: "M16 23 L24 26 L16 28 M40 23 L32 26 L40 28",
    brows: "M16 16 L23 19 M33 19 L40 16",
    mouth: "M19 37 L24 35 L29 38 L34 35 L38 37",
    prompt: "What feels difficult or stuck right now?",
  },
  tired: {
    eyes: "M16 26 L24 26 M32 26 L40 26",
    mouth: "M24 35 C24 30 32 30 32 35 C32 43 24 43 24 35 Z",
    prompt: "What kind of rest would feel helpful?",
  },
  lonely: {
    eyes: "M18 28 L22 28 M34 28 L38 28",
    brows: "M16 20 Q20 21 24 17 M32 17 Q36 21 40 20",
    mouth: "M23 39 Q28 34 33 39",
    prompt: "Who would you like to feel more connected to?",
  },
  hopeful: {
    brows: "M16 16 Q20 12 24 16 M32 16 Q36 12 40 16",
    mouth: "M21 35 Q28 43 35 35",
    prompt: "What is something you are looking forward to?",
  },
  unsure: {
    brows: "M16 17 L24 17 M32 16 Q37 11 41 16",
    mouth: "M20 37 Q25 33 29 37 Q33 41 37 36",
    prompt: "What are you feeling uncertain about?",
  },
};

const FEELINGS = MOOD_OPTIONS.map((mood) => ({
  ...mood,
  ...FACE_DETAILS[mood.id],
}));

type Feeling = (typeof FEELINGS)[number];

function FeelingFace({ feeling }: { feeling: Feeling }) {
  return (
    <svg className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle cx="28" cy="28" r="26" fill={feeling.color} stroke="#293C35" strokeWidth="2" />
      <g fill="none" stroke="#293C35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {"eyes" in feeling ? <path d={feeling.eyes} /> : <g fill="#293C35" stroke="none"><circle cx="20" cy={feeling.label === "Hopeful" ? 22 : 24} r="2.5" /><circle cx="36" cy={feeling.label === "Hopeful" ? 22 : 24} r="2.5" /></g>}
        {"brows" in feeling && <path d={feeling.brows} />}
        <path d={feeling.mouth} fill={feeling.label === "Happy" || feeling.label === "Excited" || feeling.label === "Tired" ? "#293C35" : "none"} />
      </g>
    </svg>
  );
}

export function FeelingsCheckIn() {
  const [selectedMoodId, setSelectedMoodId] = useState<MoodId | null>(null);
  const [agentAction, setAgentAction] = useState<MoodAgentAction | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetAgentMood = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const response = await requestMockAgentMood();
      const action = parseMoodAgentAction(response);
      setSelectedMoodId(action.moodId);
      setAgentAction(action);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "AI Bot mood request failed",
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const selectedMood = MOOD_OPTIONS.find(
    (mood) => mood.id === selectedMoodId,
  );

  return (
    <div className="flex h-full bg-charcoal">
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-2xl rounded-panel bg-white px-10 py-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-charcoal">
            How are you feeling?
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Select a feeling to talk about.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGetAgentMood}
              disabled={isRequesting}
              className="rounded-panel bg-sage px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequesting ? "Getting mood…" : "TEMP Get Agent Mood"}
            </button>
            {isRequesting && (
              <span className="text-sm text-charcoal/60" role="status">
                AI Bot is choosing a mood…
              </span>
            )}
          </div>

          {error && (
            <p
              className="mt-4 rounded-panel border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-charcoal"
              role="alert"
            >
              {error}
            </p>
          )}

          {agentAction && selectedMood && (
            <div
              className="mt-4 rounded-panel border border-sage/30 bg-sage/10 px-4 py-3"
              aria-live="polite"
            >
              <p className="text-sm font-semibold text-charcoal">
                AI Bot selected: {selectedMood.label}
              </p>
              <p className="mt-1 text-sm text-charcoal/70">
                {agentAction.rationale}
              </p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-4 gap-x-6 gap-y-8">
            {FEELINGS.map((feeling) => {
              const selected = selectedMoodId === feeling.id;
              return (
                <div
                  key={feeling.id}
                  data-mood-id={feeling.id}
                  className={`relative flex flex-col items-center gap-2 rounded-panel p-2 ${
                    selected ? "ring-2 ring-sage" : ""
                  }`}
                >
                  {selected && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-xs text-white">
                      ✓
                    </span>
                  )}
                  <FeelingFace feeling={feeling} />
                  <span className="text-sm text-charcoal">{feeling.label}</span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedMoodId(null);
              setAgentAction(null);
              setError(null);
            }}
            disabled={!selectedMoodId}
            className="mt-4 rounded-panel border border-charcoal/30 px-3 py-2 text-sm text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40"
          >
            Clear selection
          </button>
        </div>
      </div>
      <AnnotationToolbar />
    </div>
  );
}
