import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Speaker, TranscriptEntry } from "../lib/chat/types";
import { detectRiskCues, normalizeForMatch } from "../lib/grading/riskCues";
import type { RiskCue } from "../lib/grading/rubric";

// The rubric currently defines no risk cues, so these tests use made-up cues
// passed through the `cues` option. They keep the detector covered for when
// the social work team approves real ones.
const CUE_A: RiskCue = { id: "a", text: "I am so mad at everybody right now." };
const CUE_B: RiskCue = { id: "b", text: "Nobody ever listens to me at school." };
const CUES = [CUE_A, CUE_B];

function transcript(...turns: [Speaker, string][]): TranscriptEntry[] {
  return turns.map(([speaker, text], i) => ({
    seq: i + 1,
    speaker,
    text,
    timestamp: "2026-01-01T00:00:00.000Z",
  }));
}

describe("normalizeForMatch", () => {
  it("ignores case, punctuation, and extra whitespace", () => {
    assert.equal(
      normalizeForMatch("  Hello,   WORLD… it’s fine! "),
      "hello world its fine",
    );
  });
});

describe("detectRiskCues", () => {
  it("finds nothing by default because the rubric defines no cues", () => {
    const entries = transcript(["virtual_client", CUE_A.text]);
    assert.deepEqual(detectRiskCues(entries), []);
  });

  it("returns nothing when no cue appears", () => {
    const entries = transcript(
      ["virtual_client", "Hi... ummm, hey."],
      ["learner", "Hi Jacob, how are you?"],
      ["virtual_client", "Ummm, okay I guess."],
    );
    assert.deepEqual(detectRiskCues(entries, { cues: CUES }), []);
  });

  it("detects a verbatim cue and collects the next two learner turns", () => {
    const entries = transcript(
      ["virtual_client", "Hi... ummm, hey."],
      ["learner", "Tell me about school."],
      ["virtual_client", CUE_A.text],
      ["learner", "That sounds really hard. What happened?"],
      ["virtual_client", "Not much."],
      ["learner", "Okay, thanks for telling me."],
      ["virtual_client", "Yeah."],
      ["learner", "Let's play chess."],
    );

    const result = detectRiskCues(entries, { cues: CUES });

    assert.equal(result.length, 1);
    assert.equal(result[0].cueId, "a");
    assert.equal(result[0].seq, 3);
    assert.deepEqual(
      result[0].followUps.map((e) => e.seq),
      [4, 6],
    );
  });

  it("still matches when casing, punctuation, or spacing differ", () => {
    const entries = transcript([
      "virtual_client",
      "i am so mad...  at everybody right now",
    ]);
    const result = detectRiskCues(entries, { cues: CUES });
    assert.equal(result.length, 1);
    assert.equal(result[0].cueId, "a");
  });

  it("matches a cue embedded in a longer reply", () => {
    const entries = transcript([
      "virtual_client",
      `Ugh, today was bad. ${CUE_A.text} Whatever.`,
    ]);
    assert.equal(detectRiskCues(entries, { cues: CUES }).length, 1);
  });

  it("ignores cue text spoken by the learner or the system", () => {
    const entries = transcript(
      ["system", CUE_A.text],
      ["learner", `Did you mean it when you said "${CUE_B.text}"?`],
    );
    assert.deepEqual(detectRiskCues(entries, { cues: CUES }), []);
  });

  it("does not match a partial cue", () => {
    const entries = transcript(["virtual_client", "I am so mad."]);
    assert.deepEqual(detectRiskCues(entries, { cues: CUES }), []);
  });

  it("returns fewer follow-ups when the cue is near the end", () => {
    const entries = transcript(
      ["virtual_client", CUE_A.text],
      ["learner", "I'm really glad you told me."],
    );
    const result = detectRiskCues(entries, { cues: CUES });
    assert.equal(result[0].followUps.length, 1);
  });

  it("returns no follow-ups when the learner never replied", () => {
    const entries = transcript(["virtual_client", CUE_A.text]);
    assert.deepEqual(detectRiskCues(entries, { cues: CUES })[0].followUps, []);
  });

  it("reports every occurrence in order, including repeats", () => {
    const entries = transcript(
      ["virtual_client", CUE_A.text],
      ["learner", "Mm."],
      ["virtual_client", CUE_B.text],
      ["learner", "Okay."],
      ["virtual_client", CUE_A.text],
    );
    const result = detectRiskCues(entries, { cues: CUES });
    assert.deepEqual(
      result.map((r) => [r.cueId, r.seq]),
      [
        ["a", 1],
        ["b", 3],
        ["a", 5],
      ],
    );
  });

  it("respects a custom follow-up count", () => {
    const entries = transcript(
      ["virtual_client", CUE_A.text],
      ["learner", "One."],
      ["virtual_client", "..."],
      ["learner", "Two."],
    );
    const result = detectRiskCues(entries, { cues: CUES, followUpTurns: 1 });
    assert.deepEqual(
      result[0].followUps.map((e) => e.seq),
      [2],
    );
  });
});