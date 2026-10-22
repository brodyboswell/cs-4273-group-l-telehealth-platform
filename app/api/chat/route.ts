/**
 * POST /api/chat
 * Body: { sessionId: string, message: string }
 *
 * Records the learner's message, asks the LLM (as the virtual client) for a reply,
 * records the reply, and returns both entries plus the full transcript.
 * The conversation history comes from the server-side transcript, never from the
 * browser, so the log is the single source of truth for what was said.
 */
import { generateClientReply, LlmError } from "@/lib/chat/llm";
import { activityRegistry } from "@/lib/activities/catalog";
import {
  ActivityRegistryError,
  buildAvailabilityMessage,
  buildActivityContext,
  type ResolvedActivity,
} from "@/lib/activities/registry";
import { DEFAULT_PERSONA } from "@/lib/chat/persona";
import {
  appendEntry,
  getOrCreateTranscript,
  toChatHistory,
  withSessionLock,
} from "@/lib/chat/transcriptStore";
import { jsonError } from "@/lib/chat/http";
import {
  isRecord,
  isValidSessionId,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat/validation";
import type { ActivityAction } from "@/lib/activities/types";
import type { ChatResponseBody } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }

  if (!isRecord(body))
    return jsonError(400, "Request body must be a JSON object.");
  const { sessionId, message } = body;
  if (!isValidSessionId(sessionId)) {
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  }
  if (typeof message !== "string" || !message.trim()) {
    return jsonError(400, "message cannot be empty.");
  }
  const text = message.trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonError(
      413,
      `message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
    );
  }

  let activeActivity: ResolvedActivity | null = null;
  if (body.activity !== undefined) {
    try {
      activeActivity = activityRegistry.resolve(body.activity);
    } catch (err) {
      return jsonError(
        400,
        err instanceof ActivityRegistryError
          ? err.message
          : "Activity context is invalid.",
      );
    }
  }

  try {
    const result = await withSessionLock(sessionId, async () => {
      const transcript = await getOrCreateTranscript(
        sessionId,
        DEFAULT_PERSONA,
      );
      const toolNames = (activeActivity?.tools ?? [])
        .map(({ name }) => name)
        .sort();
      if (activeActivity && toolNames.length > 0) {
        const previousLearnerEntry = [...transcript.entries]
          .reverse()
          .find((entry) => entry.speaker === "learner");
        const previousNotice = [...transcript.entries]
          .reverse()
          .find((entry) => entry.activityNotice)?.activityNotice;
        const sameActivity =
          previousLearnerEntry?.activity?.activityId ===
          activeActivity.activityId;
        const sameTools =
          previousNotice?.activityId === activeActivity.activityId &&
          previousNotice.toolNames.join("\0") === toolNames.join("\0");

        if (!sameActivity || !sameTools) {
          await appendEntry(
            transcript,
            "virtual_client",
            buildAvailabilityMessage(activeActivity),
            {
              activityNotice: {
                activityId: activeActivity.activityId,
                toolNames,
              },
            },
          );
        }
      }

      const learnerEntry = await appendEntry(
        transcript,
        "learner",
        text,
        {
          activity: activeActivity
            ? {
                activityId: activeActivity.activityId,
                state: activeActivity.state,
              }
            : null,
        },
      );

      const started = performance.now();
      try {
        const activityContext = activeActivity
          ? buildActivityContext(activeActivity)
          : null;
        const systemPrompt = activityContext
          ? `${DEFAULT_PERSONA.systemPrompt}\n\n${activityContext}`
          : DEFAULT_PERSONA.systemPrompt;
        const tools = (activeActivity?.tools ?? []).map(
          ({ name, description, inputSchema, mockInput }) => ({
            name,
            description,
            inputSchema,
            ...(mockInput !== undefined ? { mockInput } : {}),
          }),
        );
        const reply = await generateClientReply(
          systemPrompt,
          toChatHistory(transcript),
          process.env,
          tools,
        );

        const actions: ActivityAction[] = [];
        for (const call of reply.toolCalls) {
          try {
            if (!activeActivity)
              throw new ActivityRegistryError(
                `No active activity is available for tool "${call.name}".`,
              );
            actions.push(
              activityRegistry.validateAction(
                activeActivity.activityId,
                call.name,
                call.input,
              ),
            );
          } catch (err) {
            const reason =
              err instanceof Error ? err.message : "Invalid tool call.";
            await appendEntry(
              transcript,
              "system",
              `Rejected activity tool call "${call.name.slice(0, 80)}": ${reason.slice(0, 240)}`,
            );
          }
        }

        const replyEntry = await appendEntry(
          transcript,
          "virtual_client",
          reply.text,
          {
            model: reply.model,
            latencyMs: Math.round(performance.now() - started),
            ...(actions.length > 0 ? { actions } : {}),
          },
        );
        return {
          ok: true as const,
          body: { reply: replyEntry, learnerEntry, transcript },
        };
      } catch (err) {
        // Keep the failure in the audit trail; the learner's message stays recorded.
        const msg =
          err instanceof LlmError
            ? err.message
            : "Unexpected error while generating a reply.";
        await appendEntry(
          transcript,
          "system",
          `Virtual client failed to respond: ${msg}`,
        );
        if (!(err instanceof LlmError))
          console.error("[chat] unexpected error:", err);
        return {
          ok: false as const,
          status: err instanceof LlmError ? err.status : 500,
          msg,
        };
      }
    });

    if (!result.ok) return jsonError(result.status, result.msg);
    return Response.json(result.body satisfies ChatResponseBody, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[chat] transcript storage error:", err);
    return jsonError(500, "Could not save the transcript.");
  }
}
