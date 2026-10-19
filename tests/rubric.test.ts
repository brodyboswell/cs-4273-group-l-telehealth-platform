import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRITERIA,
  MAX_SCORE,
  RISK_CUES,
  RISK_RESPONSE,
  RUBRIC_VERSION,
} from "../lib/grading/rubric";

describe("grading rubric", () => {
  it("has a version string", () => {
    assert.ok(RUBRIC_VERSION.length > 0);
  });

  it("has unique criterion ids", () => {
    const ids = CRITERIA.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes(RISK_RESPONSE.id));
  });

  it("defines levels 0 through 3 in order for every criterion", () => {
    for (const criterion of CRITERIA) {
      assert.deepEqual(
        criterion.levels.map((l) => l.score),
        [0, 1, 2, 3],
        criterion.id,
      );
      for (const level of criterion.levels) {
        assert.ok(level.descriptor.trim().length > 0, criterion.id);
      }
    }
  });

  it("computes the maximum score from the criteria", () => {
    assert.equal(MAX_SCORE, CRITERIA.length * 3);
  });

  it("has non-empty, distinct risk cue lines", () => {
    assert.ok(RISK_CUES.length > 0);
    const texts = RISK_CUES.map((c) => c.text);
    for (const text of texts) {
      assert.ok(text.trim().length > 0);
    }
    assert.equal(new Set(texts).size, texts.length);
  });
});