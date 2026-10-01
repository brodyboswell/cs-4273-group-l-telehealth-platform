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

function FeelingFace({ color }: { color: string }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="26" fill={color} stroke="#293C35" strokeWidth="2" />
      <circle cx="20" cy="24" r="2.5" fill="#293C35" />
      <circle cx="36" cy="24" r="2.5" fill="#293C35" />
      <path
        d="M20 36 Q28 42 36 36"
        fill="none"
        stroke="#293C35"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
      <div className="flex min-w-0 flex-1 items-center justify-center p-8">
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
            {MOOD_OPTIONS.map((feeling) => {
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
                  <FeelingFace color={feeling.color} />
                  <span className="text-sm text-charcoal">{feeling.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AnnotationToolbar />
    </div>
  );
}
