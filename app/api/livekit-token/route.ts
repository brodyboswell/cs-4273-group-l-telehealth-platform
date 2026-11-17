/**
 * POST /api/livekit-token mints a short-lived LiveKit access token so the
 * browser can join the realtime voice room for a practice session.
 *
 * The room name is always the session ID, so the voice agent (voice-agent/)
 * and the browser land in the same room, and the same room name is used to
 * find/append to the session's transcript file — one session ID ties the
 * text chat, the voice call, and the stored transcript together.
 *
 * Only the logged-in learner who owns the session gets a token, and only while
 * the session is open; voice needs file transcript storage, because the agent
 * writes the same transcript file the text chat uses.
 *
 * LIVEKIT_API_KEY / LIVEKIT_API_SECRET never reach the browser — only the
 * signed token does. Get these from https://cloud.livekit.io (Settings ->
 * API keys) and put them in .env.local, alongside LIVEKIT_URL.
 */
import { AccessToken } from "livekit-server-sdk";
import { auth } from "@/lib/auth/server";
import { jsonError } from "@/lib/chat/http";
import { usesBrowserSessions } from "@/lib/chat/storageMode";
import {
  getOwnedTranscript,
  TranscriptAccessError,
} from "@/lib/chat/transcriptStore";
import { isRecord, isValidSessionId } from "@/lib/chat/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await auth.getUser();
  if (!user) return jsonError(401, "Please log in to continue.");
  if (usesBrowserSessions())
    return jsonError(
      503,
      "Voice sessions need file transcript storage (PRACTICE_STORAGE=file).",
    );

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return jsonError(
      500,
      "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env.local " +
        "(see .env.example) before the voice session can start.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }
  const sessionId = isRecord(body) ? body.sessionId : undefined;
  if (!isValidSessionId(sessionId)) {
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  }

  try {
    const transcript = await getOwnedTranscript(sessionId, user.id);
    if (transcript.endedAt)
      return jsonError(409, "This practice session has ended.");
  } catch (err) {
    if (err instanceof TranscriptAccessError)
      return jsonError(404, "Practice session not found.");
    throw err;
  }

  // One browser identity per tab per token request; the voice agent worker
  // joins the same room under its own identity (see voice-agent/agent.py).
  const identity = `learner-${crypto.randomUUID().slice(0, 8)}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "10m",
  });
  token.addGrant({
    room: sessionId,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return Response.json(
    { token: await token.toJwt(), url, identity, room: sessionId },
    { headers: { "cache-control": "no-store" } },
  );
}
