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
