import type { Score } from "./rubric";

/** A verbatim excerpt from one transcript entry that supports a score. */
export interface EvidenceQuote {
  /** seq of the transcript entry the quote comes from. */
  seq: number;
  quote: string;
}

export interface CriterionGrade {
  criterionId: string;
  name: string;
  score: Score;
  rationale: string;
  evidence: EvidenceQuote[];
}

export interface GradedReport {
  status: "graded";
  sessionId: string;
  rubricVersion: string;
  /** "provider:model" that produced the grade, or "mock:offline". */
  model: string;
  gradedAt: string;
  learnerTurnCount: number;
  criteria: CriterionGrade[];
  totalScore: number;
  maxScore: number;
  /** Short, learner-facing notes. */
  strengths: string[];
  nextSteps: string[];
}

/** Returned instead of a score when the session is too short to judge fairly. */
export interface InsufficientEvidenceReport {
  status: "insufficient_evidence";
  sessionId: string;
  rubricVersion: string;
  gradedAt: string;
  learnerTurnCount: number;
  minimumLearnerTurns: number;
  message: string;
}

export type GradeReport = GradedReport | InsufficientEvidenceReport;