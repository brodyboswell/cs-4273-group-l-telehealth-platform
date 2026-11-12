import { auth } from "@/lib/auth/server";
/**
 * GET /api/transcripts -> the authenticated learner's sessions, newest first.
 */
import { jsonError } from "@/lib/chat/http";
import { listTranscripts } from "@/lib/chat/transcriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await auth.getUser();
  if (!user) return jsonError(401, "Please log in to continue.");
  try {
    return Response.json(
      { sessions: await listTranscripts(user.id) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[transcripts] could not list sessions:", error);
    return jsonError(500, "Could not load the sessions.");
  }
}
