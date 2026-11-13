import type { LlmToolDefinition } from "../chat/llm";
import type { Transcript } from "../chat/types";
import { isRecord } from "../chat/validation";
import { normalizeForMatch } from "./riskCues";
import { CRITERIA, type Score } from "./rubric";
import type { CriterionGrade, EvidenceQuote } from "./types";

/**
 * Tool schema the grader is forced to call, plus the validator for what comes
 * back. The model's output is never trusted: every id, score, and evidence
 * quote is checked against the rubric and the transcript before it is used.
 */

export const GRADE_TOOL_NAME = "submit_grade";

const MAX_EVIDENCE_PER_CRITERION = 3;
const MAX_NOTES = 3;
const MAX_RATIONALE_LENGTH = 600;
const MAX_QUOTE_LENGTH = 300;
const MAX_NOTE_LENGTH = 300;
const MIN_NORMALIZED_QUOTE_LENGTH = 3;

export class GradeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradeParseError";
  }
}

export interface ParsedGrade {
  criteria: CriterionGrade[];
  strengths: string[];
  nextSteps: string[];
}

export function buildGradeTool(): LlmToolDefinition {
  return {
    name: GRADE_TOOL_NAME,
    description:
      "Submit the final grade for the learner: one entry per rubric criterion with a score, a short rationale, and verbatim evidence quotes, plus brief feedback notes.",
    inputSchema: {
      type: "object",
      properties: {
        criteria: {
          type: "array",
          minItems: CRITERIA.length,
          maxItems: CRITERIA.length,
          description: "Exactly one entry for each rubric criterion.",
          items: {
            type: "object",
            properties: {
              criterionId: {
                type: "string",
                enum: CRITERIA.map((c) => c.id),
              },
              score: {
                type: "integer",
                minimum: 0,
                maximum: 3,
                description: "Rubric level from 0 (not shown) to 3 (strong).",
              },
              rationale: {
                type: "string",
                maxLength: MAX_RATIONALE_LENGTH,
                description:
                  "One or two sentences explaining the score, addressed to the learner.",
              },
              evidence: {
                type: "array",
                maxItems: MAX_EVIDENCE_PER_CRITERION,
                description:
                  "Verbatim excerpts from the transcript. Required for any score above 0.",
                items: {
                  type: "object",
                  properties: {
                    seq: {
                      type: "integer",
                      minimum: 1,
                      description: "The #number of the transcript entry.",
                    },
                    quote: {
                      type: "string",
                      maxLength: MAX_QUOTE_LENGTH,
                      description:
                        "Exact words copied from that entry, not paraphrased.",
                    },
                  },
                  required: ["seq", "quote"],
                  additionalProperties: false,
                },
              },
            },
            required: ["criterionId", "score", "rationale", "evidence"],
            additionalProperties: false,
          },
        },
        strengths: {
          type: "array",
          maxItems: MAX_NOTES,
          description: "Up to three things the learner did well.",
          items: { type: "string", maxLength: MAX_NOTE_LENGTH },
        },
        nextSteps: {
          type: "array",
          maxItems: MAX_NOTES,
          description: "Up to three specific things to try next time.",
          items: { type: "string", maxLength: MAX_NOTE_LENGTH },
        },
      },
      required: ["criteria", "strengths", "nextSteps"],
      additionalProperties: false,
    },
  };
}

function fail(message: string): never {
  throw new GradeParseError(message);
}

function parseText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be a non-empty string.`);
  const text = value.trim();
  if (text.length > max) fail(`${label} is longer than ${max} characters.`);
  return text;
}

function parseNotes(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_NOTES)
    fail(`${label} must be a list (got ${value === undefined ? "nothing" : typeof value}).`);
  return value
    .slice(0, MAX_NOTES) // trim extras instead of rejecting
    .map((item, index) => parseText(item, `${label}[${index}]`, MAX_NOTE_LENGTH),
    );
}

function parseEvidence(
  value: unknown,
  transcript: Transcript,
  label: string,
): EvidenceQuote[] {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_PER_CRITERION)
    fail(`${label} evidence must be a list of at most ${MAX_EVIDENCE_PER_CRITERION}.`);
  return value.map((item, index) => {
    const where = `${label} evidence[${index}]`;
    if (!isRecord(item)) fail(`${where} must be an object.`);
    const { seq } = item;
    if (!Number.isInteger(seq)) fail(`${where} needs an integer seq.`);
    const quote = parseText(item.quote, `${where} quote`, MAX_QUOTE_LENGTH);
    // isTranscript guarantees entries[i].seq === i + 1.
    const entry = transcript.entries[(seq as number) - 1];
    if (!entry) fail(`${where} cites entry #${seq}, which does not exist.`);
    if (entry.speaker === "system")
      fail(`${where} cannot cite a system entry.`);
    const needle = normalizeForMatch(quote);
    if (
      needle.length < MIN_NORMALIZED_QUOTE_LENGTH ||
      !normalizeForMatch(entry.text).includes(needle)
    )
      fail(`${where} is not a verbatim quote from entry #${seq}.`);
    return { seq: seq as number, quote };
  });
}

/**
 * Validates the grader's tool input. Throws GradeParseError on anything
 * unexpected. On success, criteria are returned in rubric order.
 */
export function parseGradeInput(
  value: unknown,
  transcript: Transcript,
): ParsedGrade {
  if (!isRecord(value)) fail("The grade must be an object.");
  if (!Array.isArray(value.criteria))
    fail("The grade must include a criteria list.");

  const byId = new Map<string, CriterionGrade>();
  for (const item of value.criteria) {
    if (!isRecord(item)) fail("Each criterion grade must be an object.");
    const rubricEntry = CRITERIA.find((c) => c.id === item.criterionId);
    if (!rubricEntry) fail("A grade names an unknown criterion.");
    if (byId.has(rubricEntry.id))
      fail(`Criterion "${rubricEntry.id}" is graded more than once.`);
    const score = item.score;
    if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 3)
      fail(`Criterion "${rubricEntry.id}" needs an integer score from 0 to 3.`);
    const evidence = parseEvidence(item.evidence, transcript, rubricEntry.id);
    if ((score as number) > 0 && evidence.length === 0)
      fail(`Criterion "${rubricEntry.id}" scores above 0 without evidence.`);
    byId.set(rubricEntry.id, {
      criterionId: rubricEntry.id,
      name: rubricEntry.name,
      score: score as Score,
      rationale: parseText(
        item.rationale,
        `${rubricEntry.id} rationale`,
        MAX_RATIONALE_LENGTH,
      ),
      evidence,
    });
  }

  const criteria = CRITERIA.map((c) => {
    const grade = byId.get(c.id);
    if (!grade) fail(`Criterion "${c.id}" is missing.`);
    return grade;
  });

  return {
    criteria,
    strengths: parseNotes(value.strengths, "strengths"),
    nextSteps: parseNotes(value.nextSteps, "nextSteps"),
  };
}