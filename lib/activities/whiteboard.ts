import {
  parseWhiteboardDoodle,
  WHITEBOARD_DOODLE_COLORS,
} from "@/lib/whiteboard/doodle";
import { defineActivity, type ActivityDefinition } from "./types";

interface WhiteboardState {
  hasContent: boolean;
}

function parseWhiteboardState(value: unknown): WhiteboardState {
  if (!isRecord(value) || typeof value.hasContent !== "boolean")
    throw new Error("Expected a whiteboard state with a content flag.");
  if (Object.keys(value).some((key) => key !== "hasContent"))
    throw new Error("Whiteboard state contains an unsupported field.");
  return { hasContent: value.hasContent };
}

const definition: ActivityDefinition<WhiteboardState> = {
  id: "whiteboard",
  label: "whiteboard",
  parseState: parseWhiteboardState,
  describeState: ({ hasContent }) =>
    `The learner is using a shared whiteboard that ${hasContent ? "already has content" : "is blank"}. You may draw only after the learner directly asks you or agrees to draw. When invited, call the doodle tool in the same reply instead of only saying that you will draw. The tool replaces the entire board, including any learner marks. Draw an event the client has described or an emotion the learner named; do not invent story details. For a named emotion, a simple expressive face or symbol is enough, even without a specific event. Always provide at least one stroke with at least two points.`,
  tools: [
    {
      name: "replace_whiteboard_with_doodle",
      description:
        "When the learner directly asks you or agrees to draw, call this tool in the same reply and replace the whole whiteboard with a simple first-person doodle. Represent an event you described or an emotion the learner named; for a named emotion, a simple face or symbol is enough. Do not ask for more detail when a feeling has been named. Use normalized integer coordinates from 0 to 100. Include at least 1 stroke and 2 points per stroke, no more than 16 strokes or 192 points total, and an optional caption of at most 80 characters. Colors must come from the provided palette.",
      inputSchema: {
        type: "object",
        properties: {
          strokes: {
            type: "array",
            description:
              "One to 16 freehand strokes with at least 2 points each and at most 192 points total.",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              properties: {
                points: {
                  type: "array",
                  description:
                    "Ordered points on a normalized 0–100 canvas; each coordinate is an integer.",
                  minItems: 2,
                  maxItems: 192,
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "integer", minimum: 0, maximum: 100 },
                      y: { type: "integer", minimum: 0, maximum: 100 },
                    },
                    required: ["x", "y"],
                    additionalProperties: false,
                  },
                },
                color: {
                  type: "string",
                  description:
                    "Optional color from the existing whiteboard palette.",
                  enum: WHITEBOARD_DOODLE_COLORS.map(({ value }) => value),
                },
              },
              required: ["points"],
              additionalProperties: false,
            },
          },
          caption: {
            type: "string",
            description: "Optional short caption, at most 80 characters.",
            minLength: 1,
            maxLength: 80,
          },
        },
        required: ["strokes"],
        additionalProperties: false,
      },
      parseInput: parseWhiteboardDoodle,
    },
  ],
};

export const whiteboardActivity = defineActivity(definition);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
