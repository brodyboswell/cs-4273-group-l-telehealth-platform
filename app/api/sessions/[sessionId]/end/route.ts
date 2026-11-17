import { auth } from "@/lib/auth/server";
import { jsonError } from "@/lib/chat/http";
import {
  endPracticeSession,
  TranscriptAccessError,
} from "@/lib/chat/transcriptStore";
import { isValidSessionId } from "@/lib/chat/validation";
import { usesBrowserSessions } from "@/lib/chat/storageMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await auth.getUser();
  if (!user) return jsonError(401, "Please log in to continue.");
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId))
    return jsonError(400, "Invalid session ID.");
  try {
    if (usesBrowserSessions())
      return Response.json(
        { endedAt: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
      );
    const transcript = await endPracticeSession(sessionId, user.id);
    return Response.json(
      { endedAt: transcript.endedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TranscriptAccessError)
      return jsonError(404, "Transcript not found.");
    console.error("[sessions] could not end session:", error);
    return jsonError(500, "Could not end your session. Please try again.");
  }
}
