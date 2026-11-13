// Server-only module: calls the LLM provider. Never import from a client component.
import {
  generateClientReply,
  LlmError,
  resolveProvider,
} from "../chat/llm";
import type { Transcript } from "../chat/types";
import {
  buildGradeTool,
  GRADE_TOOL_NAME,
  GradeParseError,
  parseGradeInput,
} from "./parseGrade";
import {
  buildGraderSystemPrompt,
  buildGraderUserMessage,
  countLearnerTurns,
} from "./prompt";
import { CRITERIA, MAX_SCORE, RUBRIC_VERSION } from "./rubric";
import type { GradeReport } from "./types";

/** Sessions with fewer learner messages are not graded; there is too little to judge. */
export const MIN_LEARNER_TURNS = 3;

const GRADER_MAX_OUTPUT_TOKENS = 4_000;
const GRADER_ATTEMPTS = 2;

type Environment = Record<string, string | undefined>;

/** The grader may use a different (e.g. stronger) model than the virtual client. */
function graderEnvironment(env: Environment): Environment {
  return {
    ...env,
    ANTHROPIC_MODEL: env.ANTHROPIC_GRADER_MODEL || env.ANTHROPIC_MODEL,
    OPENAI_MODEL: env.OPENAI_GRADER_MODEL || env.OPENAI_MODEL,
  };
}

/**
 * Grades a practice session against the rubric. Returns an
 * "insufficient_evidence" report for very short sessions, and a clearly
 * labeled placeholder when no AI provider is configured.
 */
export async function gradeTranscript(
  transcript: Transcript,
  env: Environment = process.env,
): Promise<GradeReport> {
  const base = {
    sessionId: transcript.sessionId,
    rubricVersion: RUBRIC_VERSION,
    gradedAt: new Date().toISOString(),
    learnerTurnCount: countLearnerTurns(transcript.entries),
  };

  if (base.learnerTurnCount < MIN_LEARNER_TURNS)
    return {
      status: "insufficient_evidence",
      ...base,
      minimumLearnerTurns: MIN_LEARNER_TURNS,
      message: `This session was too short to give feedback. Try sending at least ${MIN_LEARNER_TURNS} messages next time.`,
    };

  if (resolveProvider(env) === "mock")
    return {
      status: "graded",
      ...base,
      model: "mock:offline",
      criteria: CRITERIA.map((criterion) => ({
        criterionId: criterion.id,
        name: criterion.name,
        score: 2,
        rationale:
          "Offline placeholder. No AI provider is configured, so this is not a real evaluation.",
        evidence: [],
      })),
      totalScore: CRITERIA.length * 2,
      maxScore: MAX_SCORE,
      strengths: [],
      nextSteps: [],
    };

  const tool = buildGradeTool();
  const history = [
    { role: "user" as const, content: buildGraderUserMessage(transcript) },
  ];

  for (let attempt = 1; attempt <= GRADER_ATTEMPTS; attempt++) {
    const reply = await generateClientReply(
      buildGraderSystemPrompt(),
      history,
      graderEnvironment(env),
      [tool],
      GRADE_TOOL_NAME,
      // Deterministic, and long enough for six criteria with evidence.
      { maxOutputTokens: GRADER_MAX_OUTPUT_TOKENS, temperature: 0 },
    );
    const call = reply.toolCalls.find((c) => c.name === GRADE_TOOL_NAME);
    try {
      if (!call) throw new GradeParseError("The grader did not submit a grade.");
      const parsed = parseGradeInput(call.input, transcript);
      return {
        status: "graded",
        ...base,
        model: reply.model,
        criteria: parsed.criteria,
        totalScore: parsed.criteria.reduce((sum, c) => sum + c.score, 0),
        maxScore: MAX_SCORE,
        strengths: parsed.strengths,
        nextSteps: parsed.nextSteps,
      };
    } catch (error) {
      if (!(error instanceof GradeParseError)) throw error;
      // Log the reason only; never the transcript or the model's raw output.
      console.error(`[grading] invalid grade (attempt ${attempt}):`, error.message);
    }
  }
  throw new LlmError(
    "Feedback could not be generated for this session. Please try again.",
    502,
  );
}