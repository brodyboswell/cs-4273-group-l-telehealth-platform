import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WHITEBOARD_DOODLE_COLORS,
  parseWhiteboardDoodle,
} from "../lib/whiteboard/doodle";
import { toExcalidrawDoodleSkeletons } from "../lib/whiteboard/excalidrawDoodle";

describe("Excalidraw doodle adapter", () => {
  it("maps normalized strokes into centered freehand elements", () => {
    const skeletons = toExcalidrawDoodleSkeletons(
      parseWhiteboardDoodle({
        strokes: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 50, y: 25 },
              { x: 100, y: 100 },
            ],
            color: WHITEBOARD_DOODLE_COLORS[2].value,
          },
        ],
      }),
    );

    assert.equal(skeletons.length, 1);
    const stroke = skeletons[0];
    assert.equal(stroke?.type, "freedraw");
    assert.equal(stroke?.x, -300);
    assert.equal(stroke?.y, -200);
    assert.equal(stroke?.width, 600);
    assert.equal(stroke?.height, 400);
    assert.equal(stroke?.strokeColor, WHITEBOARD_DOODLE_COLORS[2].value);
    assert.deepEqual(stroke?.points, [
      [0, 0],
      [300, 100],
      [600, 400],
    ]);
  });

  it("adds the optional caption below the doodle", () => {
    const skeletons = toExcalidrawDoodleSkeletons(
      parseWhiteboardDoodle({
        strokes: [{ points: [{ x: 20, y: 30 }, { x: 40, y: 50 }] }],
        caption: "The bus was late",
      }),
    );

    assert.equal(skeletons.length, 2);
    assert.deepEqual(skeletons[1], {
      type: "text",
      x: -300,
      y: 232,
      text: "The bus was late",
    });
  });
});
