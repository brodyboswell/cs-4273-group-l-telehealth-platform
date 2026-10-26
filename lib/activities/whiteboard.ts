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
    `The learner is using a shared whiteboard that ${hasContent ? "already has content" : "is blank"}. You may draw only after the learner directly asks you or agrees to draw. The doodle tool replaces the entire board, including any learner marks. Draw only events the client has already described; do not invent details.`,
  tools: [
    {
      name: "replace_whiteboard_with_doodle",
      description:
        "After the learner directly asks you or agrees to draw, replace the whole whiteboard with a simple first-person doodle of an event you have already described. Use normalized integer coordinates from 0 to 100. Include 1 to 16 strokes, at least 2 points per stroke, no more than 192 points total, and an optional caption of at most 80 characters. Colors must come from the provided palette.",
      inputSchema: {
        type: "object",
        properties: {
          strokes: {
            type: "array",
            description:
              "One to 16 freehand strokes with at least 2 points each and at most 192 points total.",
            items: {
              type: "object",
              properties: {
                points: {
                  type: "array",
                  description:
                    "Ordered points on a normalized 0–100 canvas; each coordinate is an integer.",
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "integer" },
                      y: { type: "integer" },
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
