/**
 * POST /api/voice/action lets the Python voice agent run an activity tool the
 * LLM chose during a call (for example select_mood on the feelings chart or
 * replace_whiteboard_with_svg on the whiteboard).
 *
 * Called only by the voice agent, with the shared VOICE_AGENT_SECRET header
 * (lib/voice/agentAuth.ts), for a session that already exists and is open.
 *
 * Body: { sessionId, activity: ActivitySnapshot, tool: string, input: unknown }
 *   - activity is the latest snapshot the agent received from the browser. It
 *     is untrusted and resolved here exactly like a text chat request's
 *     activity field, so tool availability and input validation (including
 *     the SVG sanitizer) are the same as in /api/chat.
 *
 * On success the validated action is appended to the transcript as a
 * virtual_client entry with `actions`, mirroring app/api/chat, and returned so
 * the agent can forward it to the browser, where VoicePanel applies it with
 * ActivityBridge.capture().dispatch().
 */
import { activityRegistry } from "@/lib/activities/catalog";
import {
  ActivityRegistryError,
  type ResolvedActivity,
} from "@/lib/activities/registry";
import type { ActivityAction } from "@/lib/activities/types";
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

const MAX_TOOL_NAME_LENGTH = 80;

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

  const { sessionId, activity, tool, input } = body;
  if (!isValidSessionId(sessionId))
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  if (
    typeof tool !== "string" ||
    !tool.trim() ||
    tool.length > MAX_TOOL_NAME_LENGTH
  )
    return jsonError(400, "tool must be a non-empty tool name.");

  let resolved: ResolvedActivity;
  let action: ActivityAction;
  try {
    resolved = activityRegistry.resolve(activity);
    action = activityRegistry.validateAction(
      resolved.activityId,
      tool,
      input,
      resolved.state,
    );
  } catch (err) {
    return jsonError(
      400,
      err instanceof ActivityRegistryError
        ? err.message
        : "The activity action is invalid.",
    );
  }

  const text = actionText(action);
  let outcome: "saved" | "missing" | "ended";
  try {
    outcome = await withSessionLock(sessionId, async () => {
      const transcript = await readTranscript(sessionId);
      if (!transcript) return "missing";
      if (transcript.endedAt) return "ended";
      await appendEntry(transcript, "virtual_client", text, {
        model: "voice-agent",
        actions: [action],
      });
      return "saved";
    });
  } catch {
    return jsonError(500, "Could not save the activity action.");
  }
  if (outcome === "missing") return jsonError(404, "Practice session not found.");
  if (outcome === "ended")
    return jsonError(409, "This practice session has ended.");

  return Response.json(
    { action, text, label: resolved.label },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Same wording rules as app/api/chat: spoken line, then commentary/rationale. */
function actionText(action: ActivityAction): string {
  if (isRecord(action.input)) {
    for (const field of ["spokenText", "commentary", "rationale"] as const) {
      const value = action.input[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return `(Used the ${action.tool} tool.)`;
}
