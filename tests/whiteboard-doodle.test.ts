import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_DOODLE_CAPTION_LENGTH,
  MAX_DOODLE_POINTS,
  MAX_DOODLE_STROKES,
  WHITEBOARD_DOODLE_COLORS,
  parseWhiteboardDoodle,
} from "../lib/whiteboard/doodle";

const validDoodle = {
  strokes: [
    {
      points: [
        { x: 10, y: 15 },
        { x: 45, y: 20 },
        { x: 70, y: 80 },
      ],
      color: WHITEBOARD_DOODLE_COLORS[1].value,
    },
  ],
  caption: "A rough day",
};

describe("whiteboard doodle parser", () => {
  it("accepts bounded freehand strokes and a caption", () => {
    assert.deepEqual(parseWhiteboardDoodle(validDoodle), validDoodle);
  });

  it("defaults an omitted color and trims an optional caption", () => {
    assert.deepEqual(
      parseWhiteboardDoodle({
        strokes: [{ points: [{ x: 0, y: 100 }, { x: 100, y: 0 }] }],
        caption: "  The bus was late  ",
      }),
      {
        strokes: [{ points: [{ x: 0, y: 100 }, { x: 100, y: 0 }] }],
        caption: "The bus was late",
      },
    );
  });

  it("rejects empty doodles and strokes shorter than two points", () => {
    assert.throws(() => parseWhiteboardDoodle({ strokes: [] }), /at least one/);
    assert.throws(
      () => parseWhiteboardDoodle({ strokes: [{ points: [{ x: 1, y: 2 }] }] }),
      /at least two points/,
    );
  });

  it("rejects out-of-range and non-integer coordinates", () => {
    for (const coordinate of [-1, 101, 1.5, "5"]) {
      assert.throws(
        () =>
          parseWhiteboardDoodle({
            strokes: [
              { points: [{ x: coordinate, y: 5 }, { x: 10, y: 20 }] },
            ],
          }),
        /integer from 0 to 100/,
      );
    }
  });

  it("rejects unsupported colors and extra fields", () => {
    assert.throws(
      () =>
        parseWhiteboardDoodle({
          strokes: [
            {
              points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
              color: "#ffffff",
            },
          ],
        }),
      /unsupported color/,
    );
    assert.throws(
      () => parseWhiteboardDoodle({ ...validDoodle, imageUrl: "https://example.test" }),
      /unsupported field/,
    );
  });

  it("enforces stroke, total-point, and caption limits", () => {
    const point = { x: 1, y: 1 };
    const manyPoints = Array.from({ length: MAX_DOODLE_POINTS + 1 }, () => point);
    const tooManyStrokes = Array.from({ length: MAX_DOODLE_STROKES + 1 }, () => ({
      points: [point, point],
    }));

    assert.throws(
      () => parseWhiteboardDoodle({ strokes: tooManyStrokes }),
      /at most 16 strokes/,
    );
    assert.throws(
      () => parseWhiteboardDoodle({ strokes: [{ points: manyPoints }] }),
      /at most 192 points/,
    );
    assert.throws(
      () =>
        parseWhiteboardDoodle({
          ...validDoodle,
          caption: "x".repeat(MAX_DOODLE_CAPTION_LENGTH + 1),
        }),
      /at most 80 characters/,
    );
  });
});
