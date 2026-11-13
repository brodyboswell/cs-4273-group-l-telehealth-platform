import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PERSONA } from "../lib/chat/persona";
import { RISK_CUES } from "../lib/grading/rubric";

describe("persona and rubric stay in sync", () => {
  it("contains every rubric risk cue line verbatim", () => {
    // Vacuous while RISK_CUES is empty; guards any cue added later.
    for (const cue of RISK_CUES) {
      assert.ok(
        DEFAULT_PERSONA.systemPrompt.includes(cue.text),
        `Persona prompt is missing the "${cue.id}" cue line.`,
      );
    }
  });

  it("does not script self-harm or violence cues", () => {
    const prompt = DEFAULT_PERSONA.systemPrompt;
    assert.ok(!prompt.includes("I should just disappear."));
    assert.ok(!prompt.includes("Sometimes I want to fight back"));
  });

  it("tells the client never to indicate self-harm or violence", () => {
    assert.match(
      DEFAULT_PERSONA.systemPrompt,
      /Never mention, hint at, or act out self-harm/,
    );
    assert.match(
      DEFAULT_PERSONA.systemPrompt,
      /Never mention, threaten, or describe violence/,
    );
  });
});