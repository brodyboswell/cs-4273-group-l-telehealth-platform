export const MOOD_OPTIONS = [
  { id: "calm", label: "Calm", color: "#88A294" },
  { id: "happy", label: "Happy", color: "#E8C84A" },
  { id: "excited", label: "Excited", color: "#E8A060" },
  { id: "proud", label: "Proud", color: "#B07AC9" },
  { id: "worried", label: "Worried", color: "#7BA3C9" },
  { id: "sad", label: "Sad", color: "#6B8FB8" },
  { id: "angry", label: "Angry", color: "#D65A4A" },
  { id: "frustrated", label: "Frustrated", color: "#E89060" },
  { id: "tired", label: "Tired", color: "#9B7AB8" },
  { id: "lonely", label: "Lonely", color: "#88A294" },
  { id: "hopeful", label: "Hopeful", color: "#E8C84A" },
  { id: "unsure", label: "Unsure", color: "#E8A060" },
] as const;

export type MoodId = (typeof MOOD_OPTIONS)[number]["id"];

export type MoodAgentAction = {
  type: "select_mood";
  moodId: MoodId;
  rationale: string;
};

export function parseMoodAgentAction(response: unknown): MoodAgentAction {
  if (typeof response !== "object" || response === null) {
    throw new Error("AI Bot returned an invalid response");
  }

  const candidate = response as Record<string, unknown>;
  const isKnownMood = MOOD_OPTIONS.some(
    (mood) => mood.id === candidate.moodId,
  );

  if (
    candidate.type !== "select_mood" ||
    typeof candidate.moodId !== "string" ||
    !isKnownMood ||
    typeof candidate.rationale !== "string" ||
    !candidate.rationale.trim()
  ) {
    throw new Error("AI Bot returned an invalid mood action");
  }

  return {
    type: "select_mood",
    moodId: candidate.moodId as MoodId,
    rationale: candidate.rationale,
  };
}
