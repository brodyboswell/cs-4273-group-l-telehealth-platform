/** The small color set shared by the learner's toolbar and client doodles. */
export const WHITEBOARD_DOODLE_COLORS = [
  { name: "Dark green", value: "#293c35" },
  { name: "Red", value: "#cf5547" },
  { name: "Orange", value: "#df8b37" },
  { name: "Green", value: "#53886b" },
  { name: "Blue", value: "#477fb2" },
  { name: "Purple", value: "#8a63aa" },
] as const;

const DOODLE_COLOR_VALUES = new Set(
  WHITEBOARD_DOODLE_COLORS.map(({ value }) => value),
);

export const MAX_DOODLE_STROKES = 16;
export const MAX_DOODLE_POINTS = 192;
export const MAX_DOODLE_CAPTION_LENGTH = 80;

export interface DoodlePoint {
  /** Integer coordinates on a normalized 0–100 canvas. */
  x: number;
  y: number;
}

export interface DoodleStroke {
  points: DoodlePoint[];
  color?: (typeof WHITEBOARD_DOODLE_COLORS)[number]["value"];
}

/** Provider-neutral description of a simple client doodle. */
export interface WhiteboardDoodle {
  strokes: DoodleStroke[];
  caption?: string;
}

/** Validates and canonicalizes tool input before it is recorded or dispatched. */
export function parseWhiteboardDoodle(value: unknown): WhiteboardDoodle {
  if (!isRecord(value)) throw new Error("Expected a doodle object.");
  assertOnlyKeys(value, ["strokes", "caption"], "Doodle");

  if (!Array.isArray(value.strokes) || value.strokes.length === 0)
    throw new Error("A doodle must contain at least one stroke.");
  if (value.strokes.length > MAX_DOODLE_STROKES)
    throw new Error(`A doodle can contain at most ${MAX_DOODLE_STROKES} strokes.`);

  let totalPoints = 0;
  const strokes = value.strokes.map((strokeValue, strokeIndex) => {
    if (!isRecord(strokeValue))
      throw new Error(`Stroke ${strokeIndex + 1} must be an object.`);
    assertOnlyKeys(strokeValue, ["points", "color"], "Stroke");

    if (!Array.isArray(strokeValue.points) || strokeValue.points.length < 2)
      throw new Error(`Stroke ${strokeIndex + 1} must have at least two points.`);

    totalPoints += strokeValue.points.length;
    if (totalPoints > MAX_DOODLE_POINTS)
      throw new Error(`A doodle can contain at most ${MAX_DOODLE_POINTS} points.`);

    const points = strokeValue.points.map((pointValue, pointIndex) => {
      if (!isRecord(pointValue))
        throw new Error(
          `Point ${pointIndex + 1} in stroke ${strokeIndex + 1} must be an object.`,
        );
      assertOnlyKeys(pointValue, ["x", "y"], "Point");

      return {
        x: parseCoordinate(pointValue.x, "x", strokeIndex, pointIndex),
        y: parseCoordinate(pointValue.y, "y", strokeIndex, pointIndex),
      };
    });

    if (
      strokeValue.color !== undefined &&
      (typeof strokeValue.color !== "string" ||
        !DOODLE_COLOR_VALUES.has(
          strokeValue.color as (typeof WHITEBOARD_DOODLE_COLORS)[number]["value"],
        ))
    )
      throw new Error(`Stroke ${strokeIndex + 1} has an unsupported color.`);

    return {
      points,
      ...(strokeValue.color !== undefined
        ? { color: strokeValue.color as DoodleStroke["color"] }
        : {}),
    };
  });

  if (value.caption !== undefined) {
    if (typeof value.caption !== "string" || !value.caption.trim())
      throw new Error("A doodle caption must be non-empty text.");
    if (value.caption.length > MAX_DOODLE_CAPTION_LENGTH)
      throw new Error(
        `A doodle caption can contain at most ${MAX_DOODLE_CAPTION_LENGTH} characters.`,
      );
  }

  return {
    strokes,
    ...(value.caption !== undefined ? { caption: value.caption.trim() } : {}),
  };
}

function parseCoordinate(
  value: unknown,
  axis: "x" | "y",
  strokeIndex: number,
  pointIndex: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  )
    throw new Error(
      `${axis} in point ${pointIndex + 1} of stroke ${strokeIndex + 1} must be an integer from 0 to 100.`,
    );
  return value;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
) {
  const unexpected = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unexpected) throw new Error(`${label} contains an unsupported field.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
