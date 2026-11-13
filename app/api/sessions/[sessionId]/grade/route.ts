import { auth } from "@/lib/auth/server";
import { jsonError } from "@/lib/chat/http";
import { LlmError } from "@/lib/chat/llm";
import { DEFAULT_PERSONA } from "@/lib/chat/persona";
import { usesBrowserSessions } from "@/lib/chat/storageMode";
import {
  getOwnedTranscript,
  TranscriptAccessError,
} from "@/lib/chat/transcriptStore";
import type { Transcript } from "@/lib/chat/types";
import {
  isRecord,
  isTranscript,
  isValidSessionId,
} from "@/lib/chat/validation";
import { gradeTranscript } from "@/lib/grading/grader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grades a practice session against the rubric. In hosted (browser) mode the
 * transcript comes from the learner's tab, so the result is feedback for the
 * learner, not an authoritative record.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await auth.getUser();
  if (!user) return jsonError(401, "Please log in to continue.");
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId))
    return jsonError(400, "Invalid session ID.");

  try {
    let transcript: Transcript;
    if (usesBrowserSessions()) {
      const body: unknown = await request.json().catch(() => null);
      const snapshot = isRecord(body) ? body.transcript : undefined;
      if (
        !isTranscript(snapshot) ||
        snapshot.sessionId !== sessionId ||
        snapshot.ownerId !== user.id ||
        snapshot.personaId !== DEFAULT_PERSONA.id
      )
        return jsonError(
          400,
          "The practice conversation is unavailable for feedback.",
        );
      transcript = snapshot;
    } else {
      transcript = await getOwnedTranscript(sessionId, user.id);
    }
    const report = await gradeTranscript(transcript);
    return Response.json(
      { report },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TranscriptAccessError)
      return jsonError(404, "Transcript not found.");
    if (error instanceof LlmError) return jsonError(error.status, error.message);
    console.error("[grading] could not grade session:", error);
    return jsonError(500, "Could not generate feedback. Please try again.");
  }
}