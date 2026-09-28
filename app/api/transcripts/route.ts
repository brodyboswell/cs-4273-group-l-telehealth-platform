/**
 * GET /api/transcripts -> list of recorded sessions (newest first), for instructors
 * and researchers. NOTE: there is no login yet, so anyone who can reach the server
 * can list and read transcripts. Add authentication before any real deployment.
 */
import { listTranscripts } from "@/lib/chat/transcriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ sessions: await listTranscripts() }, { headers: { "cache-control": "no-store" } });
}
