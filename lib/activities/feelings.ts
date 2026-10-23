import {
  defineActivity,
  type ActivityDefinition,
} from "./types";
import {
  MOOD_OPTIONS,
  parseMoodAgentAction,
  type MoodId,
} from "@/lib/mood/moodTypes";
import { isRecord } from "@/lib/chat/validation";

interface FeelingsState {
  selectedMoodId: MoodId | null;
}

const moodIds = MOOD_OPTIONS.map((mood) => mood.id);

function parseFeelingsState(value: unknown): FeelingsState {
  if (!isRecord(value)) throw new Error("Expected a feelings chart state.");
  const selectedMoodId = value.selectedMoodId;
  if (
    !("selectedMoodId" in value) ||
    selectedMoodId !== null &&
    (typeof selectedMoodId !== "string" ||
      !moodIds.includes(selectedMoodId as MoodId))
  )
    throw new Error("The selected feeling is not on the chart.");

  return { selectedMoodId: selectedMoodId as MoodId | null };
}

function parseSelectMoodInput(value: unknown) {
  if (!isRecord(value)) throw new Error("Expected a feeling selection.");
  return parseMoodAgentAction({ ...value, type: "select_mood" });
}

const definition: ActivityDefinition<FeelingsState> = {
  id: "feelings",
  label: "feelings chart",
  parseState: parseFeelingsState,
  describeState: ({ selectedMoodId }) => {
    const available = MOOD_OPTIONS.map((mood) => mood.label).join(", ");
    const selected =
      MOOD_OPTIONS.find((mood) => mood.id === selectedMoodId)?.label ?? "none";
    return `The learner is using a feelings chart. Available feelings: ${available}. Currently selected: ${selected}.`;
  },
  tools: [
    {
      name: "select_mood",
      description:
        "Choose the feeling that best matches how you feel, and briefly explain why.",
      inputSchema: {
        type: "object",
        properties: {
          moodId: {
            type: "string",
            description: "ID of a feeling shown on the chart.",
            enum: moodIds,
          },
          rationale: {
            type: "string",
            description: "A brief first-person explanation for the choice.",
          },
        },
        required: ["moodId", "rationale"],
        additionalProperties: false,
      },
      mockInput: {
        moodId: "worried",
        rationale:
          "I'm feeling worried because something has been weighing on me today.",
      },
      parseInput: parseSelectMoodInput,
    },
  ],
};

export const feelingsActivity = defineActivity(definition);
