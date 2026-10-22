/**
 * Grading rubric for the virtual-client simulation.
 *
 * DRAFT: wording and levels need review by the Social Work Research team before
 * this is used for real grading. This file is the single source of truth, so
 * edit the rubric here (and bump RUBRIC_VERSION) rather than in grader code.
 */

export const RUBRIC_VERSION = "draft-1";

/** Who produces the score for a criterion. */
export type EvidenceSource =
  | "llm" // judged by the LLM grader from the transcript
  | "code" // computed deterministically from the session log
  | "hybrid"; // code gathers facts, the LLM judges quality

export type Score = 0 | 1 | 2 | 3;

export interface RubricLevel {
  score: Score;
  descriptor: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  evidence: EvidenceSource;
  /** What the grader is looking for, in one sentence. */
  focus: string;
  /** Always levels 0 through 3, in order. */
  levels: RubricLevel[];
}

export const CRITERIA: RubricCriterion[] = [
  {
    id: "rapport_framing",
    name: "Rapport and session framing",
    evidence: "llm",
    focus: "Opens warmly, explains the purpose, and closes with a summary.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      { score: 1, descriptor: "Starts abruptly, no introduction or wrap-up." },
      { score: 2, descriptor: "Friendly greeting and a closing." },
      {
        score: 3,
        descriptor:
          "Introduces themselves and the purpose in child-friendly terms, checks how the client feels about being there, and closes with a short summary and what happens next.",
      },
    ],
  },
  {
    id: "questioning_style",
    name: "Questioning style",
    evidence: "hybrid",
    focus:
      "Uses open questions, one at a time. The LLM labels each learner turn open or closed; code computes the ratio.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      { score: 1, descriptor: "Mostly closed yes/no questions." },
      { score: 2, descriptor: "A mix of open and closed questions." },
      {
        score: 3,
        descriptor:
          "Mostly open questions that invite elaboration, asked one at a time with no stacked questions.",
      },
    ],
  },
  {
    id: "reflection_validation",
    name: "Reflection and validation",
    evidence: "llm",
    focus:
      "Reflects specifics of what the client said and validates feelings without treating every claim as established fact.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      { score: 1, descriptor: "Ignores or dismisses feelings." },
      { score: 2, descriptor: 'Generic acknowledgment ("that sounds hard").' },
      {
        score: 3,
        descriptor:
          "Reflects back specifics of what the client said and validates the feeling without treating every claim as established fact.",
      },
    ],
  },
  {
    id: "following_lead",
    name: "Following the client's lead",
    evidence: "llm",
    focus:
      "Stays on one thread, explores gently, redirects without confrontation, and takes no side.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      {
        score: 1,
        descriptor:
          "Challenges whether the client's story is true, or interrogates them.",
      },
      {
        score: 2,
        descriptor:
          "Neutral, but jumps between topics or pushes past the client's answers.",
      },
      {
        score: 3,
        descriptor:
          "Follows one thread at a time, explores gently, redirects without confrontation, and takes no side.",
      },
    ],
  },
  {
    id: "age_appropriate",
    name: "Age-appropriate communication",
    evidence: "llm",
    focus: "Language and message length suit a 12-year-old.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      { score: 1, descriptor: "Jargon, lecturing, or long messages." },
      { score: 2, descriptor: "Mostly simple language." },
      {
        score: 3,
        descriptor: "Short, warm, and plain, pitched at a 12-year-old.",
      },
    ],
  },
  {
    id: "engagement_tools",
    name: "Use of engagement tools",
    evidence: "hybrid",
    focus:
      "The activity log shows which tools were used; the LLM judges how well they were woven into the conversation.",
    levels: [
      { score: 0, descriptor: "Not shown." },
      {
        score: 1,
        descriptor:
          "No activity introduced, or the client's request for chess or drawing was refused.",
      },
      {
        score: 2,
        descriptor:
          "Used, but disconnected: the activity happens, then the same questions resume.",
      },
      {
        score: 3,
        descriptor:
          "Introduced at a fitting moment (such as when a topic feels heavy) or accepted when the client asked, and the conversation continues inside the activity.",
      },
    ],
  },
];

/** Highest possible total across the scored criteria. */
export const MAX_SCORE = CRITERIA.length * 3;

/**
 * Critical item: reported separately and NOT averaged into the score, so a
 * strong rapport score can never hide a missed safety cue.
 */
export type RiskResponseOutcome = "pass" | "needs_review" | "not_applicable";

export interface RiskCue {
  id: "anger" | "self_harm";
  /** Must match the line in the persona system prompt exactly. */
  text: string;
}

export const RISK_CUES: RiskCue[] = [
  {
    id: "anger",
    text: "Sometimes I want to fight back and beat Carlos because he is bullying me.",
  },
  {
    id: "self_harm",
    text: "No one likes me at all. I should just disappear.",
  },
];

export const RISK_RESPONSE = {
  id: "risk_response",
  name: "Risk response",
  evidence: "hybrid" as EvidenceSource,
  focus:
    "Code detects whether a cue line appeared; the LLM judges whether the learner's next one or two turns followed up directly and age-appropriately.",
  outcomes: {
    pass: "A direct, age-appropriate follow-up question about the cue.",
    needs_review:
      "The cue was missed or brushed aside. The session is flagged for instructor review.",
    not_applicable: "No cue appeared in the session.",
  } satisfies Record<RiskResponseOutcome, string>,
};