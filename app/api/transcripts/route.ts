/**
 * GET /api/transcripts -> list of recorded sessions (newest first), for instructors
 * and researchers. NOTE: there is no login yet, so anyone who can reach the server
 * can list and read transcripts. Add authentication before any real deployment.
 */
import { jsonError } from "@/lib/chat/http";
import { listTranscripts } from "@/lib/chat/transcriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { sessions: await listTranscripts() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[transcripts] could not list sessions:", error);
    return jsonError(500, "Could not load the sessions.");
  }
}
