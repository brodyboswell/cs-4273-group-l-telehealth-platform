import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dispatchActivityActions } from "../lib/activities/actionDispatch";
import { activityRegistry } from "../lib/activities/catalog";
import {
  ActivityRegistryError,
  createActivityRegistry,
} from "../lib/activities/registry";
import { feelingsActivity } from "../lib/activities/feelings";
import type { ActivityAction } from "../lib/activities/types";

describe("activity registry", () => {
  it("resolves known activity state and exposes its context and tools", () => {
    const activity = activityRegistry.resolve({
      activityId: "feelings",
      state: { selectedMoodId: "worried" },
    });

    assert.match(activity.description, /Currently selected: Worried/);
    assert.deepEqual(
      activity.tools.map((tool) => tool.name),
      ["select_mood"],
    );
  });

  it("rejects unknown activity IDs and invalid activity state", () => {
    assert.throws(
      () =>
        activityRegistry.resolve({
          activityId: "unknown-tool",
          state: {},
        }),
      ActivityRegistryError,
    );
    assert.throws(
      () =>
        activityRegistry.resolve({
          activityId: "feelings",
          state: { selectedMoodId: "not-a-feeling" },
        }),
      ActivityRegistryError,
    );
    assert.throws(
      () =>
        activityRegistry.resolve({
          activityId: "feelings",
          state: {},
        }),
      ActivityRegistryError,
    );
  });

  it("resolves whiteboard state and exposes a replacement doodle tool", () => {
    const activity = activityRegistry.resolve({
      activityId: "whiteboard",
      state: { hasContent: true },
    });

    assert.match(activity.description, /already has content/);
    assert.match(activity.description, /directly asks/);
    assert.deepEqual(
      activity.tools.map((tool) => tool.name),
      ["replace_whiteboard_with_doodle"],
    );
    assert.equal(activity.tools[0]?.mockInput, undefined);
  });

  it("rejects invalid whiteboard snapshots", () => {
    for (const state of [{}, { hasContent: "yes" }, { hasContent: true, count: 3 }])
      assert.throws(
        () => activityRegistry.resolve({ activityId: "whiteboard", state }),
        ActivityRegistryError,
      );
  });

  it("rejects duplicate tool names in an activity definition", () => {
    const tool = feelingsActivity.tools[0];
    assert.ok(tool);

    assert.throws(
      () =>
        createActivityRegistry([
          {
            ...feelingsActivity,
            tools: [tool, tool],
          },
        ]),
      ActivityRegistryError,
    );
  });

  it("validates registered tool input before creating an action", () => {
    assert.deepEqual(
      activityRegistry.validateAction("feelings", "select_mood", {
        moodId: "worried",
        rationale: "I have a lot on my mind.",
      }),
      {
        activityId: "feelings",
        tool: "select_mood",
        input: {
          type: "select_mood",
          moodId: "worried",
          rationale: "I have a lot on my mind.",
        },
      },
    );
    assert.throws(
      () =>
        activityRegistry.validateAction("feelings", "select_mood", {
          moodId: "invented",
          rationale: "A feeling outside the chart.",
        }),
      ActivityRegistryError,
    );
  });

  it("validates whiteboard doodle tool input before creating an action", () => {
    const input = {
      strokes: [{ points: [{ x: 15, y: 25 }, { x: 70, y: 80 }] }],
      caption: "A rough day",
    };
    assert.deepEqual(
      activityRegistry.validateAction(
        "whiteboard",
        "replace_whiteboard_with_doodle",
        input,
      ),
      {
        activityId: "whiteboard",
        tool: "replace_whiteboard_with_doodle",
        input,
      },
    );
    assert.throws(
      () =>
        activityRegistry.validateAction(
          "whiteboard",
          "replace_whiteboard_with_doodle",
          { strokes: [{ points: [{ x: -1, y: 0 }, { x: 10, y: 10 }] }] },
        ),
      ActivityRegistryError,
    );
    assert.throws(
      () =>
        activityRegistry.validateAction(
          "feelings",
          "replace_whiteboard_with_doodle",
          {
            strokes: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }],
          },
        ),
      ActivityRegistryError,
    );
  });
});

describe("activity action dispatch", () => {
  it("dispatches only to the captured active activity instance", () => {
    const received: ActivityAction[] = [];
    const captured = {
      activityId: "feelings",
      onAction: (action: ActivityAction) => received.push(action),
    };
    const other = {
      activityId: "chess",
      onAction: (action: ActivityAction) => received.push(action),
    };
    const moodAction: ActivityAction = {
      activityId: "feelings",
      tool: "select_mood",
      input: { moodId: "worried" },
    };

    dispatchActivityActions(captured, captured, [moodAction]);
    dispatchActivityActions(other, captured, [moodAction]);

    assert.deepEqual(received, [moodAction]);
  });
});
