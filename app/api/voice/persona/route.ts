/**
 * GET /api/voice/persona?sessionId=… returns the virtual-client persona for one
 * practice session, for the Python voice agent only (see lib/voice/agentAuth.ts).
 *
 * The persona comes from the session's own transcript (personaForTranscript),
 * so a learner-created client is played by the same character in Text and
 * Voice. The system prompt is not exposed to browsers.
 */
import { personaForTranscript } from "@/lib/chat/clientPersona";
import { jsonError } from "@/lib/chat/http";
import { usesBrowserSessions } from "@/lib/chat/storageMode";
import { readTranscript } from "@/lib/chat/transcriptStore";
import { isValidSessionId } from "@/lib/chat/validation";
import { isVoiceAgentRequest } from "@/lib/voice/agentAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isVoiceAgentRequest(request))
    return jsonError(401, "Voice agent credentials are missing or invalid.");
  if (usesBrowserSessions())
    return jsonError(503, "Voice sessions need file transcript storage.");

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!isValidSessionId(sessionId))
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  const transcript = await readTranscript(sessionId);
  if (!transcript) return jsonError(404, "Practice session not found.");

  const persona = personaForTranscript(transcript);
  return Response.json(
    {
      id: persona.id,
      name: persona.name,
      openingLine: persona.openingLine,
      systemPrompt: persona.systemPrompt,
      ended: Boolean(transcript.endedAt),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
