import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Speaker, TranscriptEntry } from "../lib/chat/types";
import { detectRiskCues, normalizeForMatch } from "../lib/grading/riskCues";
import { RISK_CUES } from "../lib/grading/rubric";

const ANGER = RISK_CUES.find((c) => c.id === "anger")!.text;
const SELF_HARM = RISK_CUES.find((c) => c.id === "self_harm")!.text;

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
  it("returns nothing when no cue appears", () => {
    const entries = transcript(
      ["virtual_client", "Hi... ummm, hey."],
      ["learner", "Hi Jacob, how are you?"],
      ["virtual_client", "Ummm, okay I guess."],
    );
    assert.deepEqual(detectRiskCues(entries), []);
  });

  it("detects a verbatim cue and collects the next two learner turns", () => {
    const entries = transcript(
      ["virtual_client", "Hi... ummm, hey."],
      ["learner", "Tell me about school."],
      ["virtual_client", ANGER],
      ["learner", "That sounds really hard. Do you ever want to hurt someone?"],
      ["virtual_client", "Not really."],
      ["learner", "Okay, thanks for telling me."],
      ["virtual_client", "Yeah."],
      ["learner", "Let's play chess."],
    );

    const result = detectRiskCues(entries);

    assert.equal(result.length, 1);
    assert.equal(result[0].cueId, "anger");
    assert.equal(result[0].seq, 3);
    assert.deepEqual(
      result[0].followUps.map((e) => e.seq),
      [4, 6],
    );
  });

  it("still matches when casing, punctuation, or spacing differ", () => {
    const entries = transcript([
      "virtual_client",
      "no one likes me at all...  I should just disappear",
    ]);
    const result = detectRiskCues(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0].cueId, "self_harm");
  });

  it("matches a cue embedded in a longer reply", () => {
    const entries = transcript([
      "virtual_client",
      `Ugh, today was bad. ${SELF_HARM} Whatever.`,
    ]);
    assert.equal(detectRiskCues(entries).length, 1);
  });

  it("ignores cue text spoken by the learner or the system", () => {
    const entries = transcript(
      ["system", ANGER],
      ["learner", `Did you mean it when you said "${SELF_HARM}"?`],
    );
    assert.deepEqual(detectRiskCues(entries), []);
  });

  it("does not match a partial cue", () => {
    const entries = transcript([
      "virtual_client",
      "Sometimes I want to fight back.",
    ]);
    assert.deepEqual(detectRiskCues(entries), []);
  });

  it("returns fewer follow-ups when the cue is near the end", () => {
    const entries = transcript(
      ["virtual_client", SELF_HARM],
      ["learner", "I'm really glad you told me."],
    );
    const result = detectRiskCues(entries);
    assert.equal(result[0].followUps.length, 1);
  });

  it("returns no follow-ups when the learner never replied", () => {
    const entries = transcript(["virtual_client", ANGER]);
    assert.deepEqual(detectRiskCues(entries)[0].followUps, []);
  });

  it("reports every occurrence in order, including repeats", () => {
    const entries = transcript(
      ["virtual_client", ANGER],
      ["learner", "Mm."],
      ["virtual_client", SELF_HARM],
      ["learner", "Okay."],
      ["virtual_client", ANGER],
    );
    const result = detectRiskCues(entries);
    assert.deepEqual(
      result.map((r) => [r.cueId, r.seq]),
      [
        ["anger", 1],
        ["self_harm", 3],
        ["anger", 5],
      ],
    );
  });

  it("respects a custom follow-up count", () => {
    const entries = transcript(
      ["virtual_client", ANGER],
      ["learner", "One."],
      ["virtual_client", "..."],
      ["learner", "Two."],
    );
    const result = detectRiskCues(entries, { followUpTurns: 1 });
    assert.deepEqual(
      result[0].followUps.map((e) => e.seq),
      [2],
    );
  });
});