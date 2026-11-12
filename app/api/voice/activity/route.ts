/**
 * POST /api/voice/activity lets the Python voice agent (voice-agent/) use the
 * same activity registry as the text chat, instead of re-implementing every
 * activity's validation and description in Python.
 *
 * Body: { sessionId, activity: ActivitySnapshot, record?: boolean }
 *   - activity is the browser's snapshot from the ActivityBridge, forwarded by
 *     the voice agent. It is untrusted and validated here exactly like a text
 *     chat request's activity field.
 *   - record=true means the learner just interacted with the activity, so an
 *     "activity" entry is appended to the session transcript (under the same
 *     per-session lock app/api/chat uses) before Jacob reacts by voice.
 *
 * Returns { activityId, label, context } where context is the same prompt text
 * app/api/chat adds for the text chat (buildActivityContext).
 */
import { activityRegistry } from "@/lib/activities/catalog";
import {
  ActivityRegistryError,
  buildActivityContext,
  type ResolvedActivity,
} from "@/lib/activities/registry";
import { DEFAULT_PERSONA } from "@/lib/chat/persona";
import { jsonError } from "@/lib/chat/http";
import {
  appendEntry,
  getOrCreateTranscript,
  withSessionLock,
} from "@/lib/chat/transcriptStore";
import { isRecord, isValidSessionId } from "@/lib/chat/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    try {
      await withSessionLock(sessionId, async () => {
        const transcript = await getOrCreateTranscript(
          sessionId,
          DEFAULT_PERSONA,
        );
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
      });
    } catch {
      return jsonError(500, "Could not save the activity update.");
    }
  }

  return Response.json(
    {
      activityId: resolved.activityId,
      label: resolved.label,
      context: buildActivityContext(resolved),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
