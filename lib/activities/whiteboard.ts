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
    `The learner is using a shared whiteboard that ${hasContent ? "already has content" : "is blank"}. You may draw only after the learner directly asks you or agrees to draw. When invited, plan a rudimentary but recognizable composition, then call the doodle tool in the same reply instead of only saying that you will draw. Use an event the client has described or an emotion the learner named; for an emotion, a simple expressive face or symbol is enough. Build the image from visual parts such as circles, squares, lines, and dots. The tool accepts stroke paths: use several sampled points for curves, closed paths for circles or polygons, and tiny loops or short marks for dots. Choose as many strokes and points as the drawing needs, within the tool's input limits. The tool replaces the entire board, including any learner marks. Do not invent story details.`,
  tools: [
    {
      name: "replace_whiteboard_with_doodle",
      description:
        "When the learner directly asks you or agrees to draw, plan a rudimentary but recognizable doodle, then call this tool in the same reply and replace the whole whiteboard. Choose simple visual parts that express the event or named emotion, such as circles, squares, lines, and dots. Encode each part as one or more stroke paths: use several sampled points to make curves, close the path for circles and polygons, and use a tiny loop or short mark for a dot. Choose as many strokes and points as needed to express the image at a rudimentary level, within the input limits; do not reduce curved parts to straight segments. Draw only from events or emotions already discussed, and do not invent story details. Use normalized integer coordinates from 0 to 100. You may include a short caption. Colors must come from the provided palette.",
      inputSchema: {
        type: "object",
        properties: {
          strokes: {
            type: "array",
            description:
              "Freehand paths that combine into the complete doodle; use as many as the composition needs.",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              properties: {
                points: {
                  type: "array",
                  description:
                    "Ordered integer coordinates from 0 to 100 along the path. Include intermediate points for curves and repeat the first point to close circles or polygons.",
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
