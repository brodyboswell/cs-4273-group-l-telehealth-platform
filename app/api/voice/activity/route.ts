/**
 * POST /api/voice/activity lets the Python voice agent (voice-agent/) use the
 * same activity registry as the text chat, instead of re-implementing every
 * activity's validation and description in Python.
 *
 * Called only by the voice agent, with the shared VOICE_AGENT_SECRET header
 * (lib/voice/agentAuth.ts); the session must already exist (created by
 * /api/sessions when the learner started it).
 *
 * Body: { sessionId, activity: ActivitySnapshot, record?: boolean }
 *   - activity is the browser's snapshot from the ActivityBridge, forwarded by
 *     the voice agent. It is untrusted and validated here exactly like a text
 *     chat request's activity field.
 *   - record=true means the learner just interacted with the activity, so an
 *     "activity" entry is appended to the session transcript (under the same
 *     per-session lock app/api/chat uses) before Jacob reacts by voice.
 *
 * Returns { activityId, label, context, tools } where context is the same
 * prompt text app/api/chat adds for the text chat (buildActivityContext) and
 * tools lists the activity tools available in this state (name, description,
 * inputSchema), so the voice agent can offer them to the LLM without a Python
 * copy of each schema. Tool calls come back through POST /api/voice/action.
 */
import { activityRegistry } from "@/lib/activities/catalog";
import {
  ActivityRegistryError,
  buildActivityContext,
  type ResolvedActivity,
} from "@/lib/activities/registry";
import { jsonError } from "@/lib/chat/http";
import { usesBrowserSessions } from "@/lib/chat/storageMode";
import {
  appendEntry,
  readTranscript,
  withSessionLock,
} from "@/lib/chat/transcriptStore";
import { isRecord, isValidSessionId } from "@/lib/chat/validation";
import { isVoiceAgentRequest } from "@/lib/voice/agentAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isVoiceAgentRequest(request))
    return jsonError(401, "Voice agent credentials are missing or invalid.");
  if (usesBrowserSessions())
    return jsonError(503, "Voice sessions need file transcript storage.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }
  if (!isRecord(body)) return jsonError(400, "Request body must be an object.");

  const { sessionId, activity, record } = body;
  if (!isValidSessionId(sessionId))
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  if (record !== undefined && typeof record !== "boolean")
    return jsonError(400, "record must be a boolean.");

  let resolved: ResolvedActivity;
  try {
    resolved = activityRegistry.resolve(activity);
  } catch (err) {
    return jsonError(
      400,
      err instanceof ActivityRegistryError
        ? err.message
        : "Activity context is invalid.",
    );
  }

  if (record) {
    let outcome: "saved" | "missing" | "ended";
    try {
      outcome = await withSessionLock(sessionId, async () => {
        const transcript = await readTranscript(sessionId);
        if (!transcript) return "missing";
        if (transcript.endedAt) return "ended";
        await appendEntry(
          transcript,
          "activity",
          `The learner updated the ${resolved.label}. ${resolved.description}`,
          {
            activity: {
              activityId: resolved.activityId,
              state: resolved.state,
            },
          },
        );
        return "saved";
      });
    } catch {
      return jsonError(500, "Could not save the activity update.");
    }
    if (outcome === "missing")
      return jsonError(404, "Practice session not found.");
    if (outcome === "ended")
      return jsonError(409, "This practice session has ended.");
  }

  return Response.json(
    {
      activityId: resolved.activityId,
      label: resolved.label,
      context: buildActivityContext(resolved),
      tools: resolved.tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
