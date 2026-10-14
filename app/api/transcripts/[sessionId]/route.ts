/**
 * GET /api/transcripts/:sessionId            -> transcript as JSON
 * GET /api/transcripts/:sessionId?format=txt -> readable plain-text transcript
 * Add &download=1 to either to get a file download.
 * Add ?mode=counselor when creating a session for "Watch a model counselor".
 *
 * A session that has no messages yet is created on first GET so the chat UI can
 * show the virtual client's opening line immediately.
 */
import { jsonError } from "@/lib/chat/http";
import { isChatMode, isValidSessionId } from "@/lib/chat/validation";
import type { Transcript } from "@/lib/chat/types";
import { personaForMode } from "@/lib/chat/persona";
import {
  formatTranscriptText,
  getOrCreateTranscript,
  withSessionLock,
} from "@/lib/chat/transcriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) {
    return jsonError(400, "Invalid session id.");
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  if (modeParam !== null && !isChatMode(modeParam)) {
    return jsonError(400, 'mode must be "client" or "counselor".');
  }

  let transcript: Transcript;
  try {
    // The mode only applies when this request creates the session.
    transcript = await withSessionLock(sessionId, () =>
      getOrCreateTranscript(sessionId, personaForMode(modeParam ?? undefined)),
    );
  } catch (error) {
    console.error("[transcripts] could not load session:", error);
    return jsonError(500, "Could not load the transcript.");
  }

  const asText = url.searchParams.get("format") === "txt";
  const download = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (download) {
    headers["content-disposition"] =
      `attachment; filename="transcript-${sessionId}.${asText ? "txt" : "json"}"`;
  }

  if (asText) {
    return new Response(formatTranscriptText(transcript), {
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
    });
  }
  return Response.json(transcript, { headers });
}
