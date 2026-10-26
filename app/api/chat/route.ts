/**
 * POST /api/chat accepts a learner message or an activity-triggered client turn.
 * Conversation history always comes from the ordered server transcript.
 */
import { generateClientReply, LlmError } from "@/lib/chat/llm";
import { activityRegistry } from "@/lib/activities/catalog";
import {
  ActivityRegistryError,
  buildAvailabilityMessage,
  buildActivityContext,
  type ResolvedActivity,
} from "@/lib/activities/registry";
import type { ActivityAction, ActivityTurnEvent } from "@/lib/activities/types";
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
import type {
  ActivityTurnResponseBody,
  ChatResponseBody,
  Transcript,
  TranscriptEntry,
} from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatOperation =
  | { kind: "message"; text: string; activity: unknown }
  | {
      kind: "activity_turn";
      activity: unknown;
      requestId: string;
      event: unknown;
    };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }

  if (!isRecord(body))
    return jsonError(400, "Request body must be a JSON object.");
  const { sessionId } = body;
  if (!isValidSessionId(sessionId)) {
    return jsonError(
      400,
      "sessionId must be 8–64 letters, numbers, dashes or underscores.",
    );
  }

  let operation: ChatOperation;
  if (body.activityTurn !== undefined) {
    if (body.message !== undefined || !isRecord(body.activityTurn))
      return jsonError(400, "activityTurn requests cannot include a chat message.");
    const turn = body.activityTurn;
    if (
      typeof turn.requestId !== "string" ||
      !("activity" in turn) ||
      !("event" in turn)
    )
      return jsonError(400, "activityTurn must include its activity, requestId and event.");
    operation = {
      kind: "activity_turn",
      activity: turn.activity,
      requestId: turn.requestId,
      event: turn.event,
    };
  } else {
    const { message } = body;
    if (typeof message !== "string" || !message.trim())
      return jsonError(400, "message cannot be empty.");
    const text = message.trim();
    if (text.length > MAX_MESSAGE_LENGTH)
      return jsonError(
        413,
        `message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
      );
    operation = { kind: "message", text, activity: body.activity };
  }

  let activeActivity: ResolvedActivity | null = null;
  let activityEvent: ActivityTurnEvent | null = null;
  try {
    if (operation.activity !== undefined)
      activeActivity = activityRegistry.resolve(operation.activity);
    if (operation.kind === "activity_turn") {
      if (!activeActivity)
        throw new ActivityRegistryError("A client turn requires an active activity.");
      activityEvent = activityRegistry.validateTurnEvent(
        activeActivity.activityId,
        operation.requestId,
        operation.event,
        activeActivity.state,
      );
      if (!activeActivity.requiredToolName)
        throw new ActivityRegistryError("No activity tool is available for this client turn.");
    }
  } catch (err) {
    return jsonError(
      400,
      err instanceof ActivityRegistryError
        ? err.message
        : "Activity context is invalid.",
    );
  }

  try {
    const result = await withSessionLock(sessionId, async () => {
      const transcript = await getOrCreateTranscript(sessionId, DEFAULT_PERSONA);
      if (operation.kind === "activity_turn") {
        const cachedReply = transcript.entries.find(
          (entry) =>
            entry.speaker === "virtual_client" &&
            entry.activityTurnId === operation.requestId &&
            (entry.actions?.length ?? 0) > 0,
        );
        if (cachedReply) {
          const savedEvent = transcript.entries.find(
            (entry) => entry.activityEvent?.requestId === operation.requestId,
          );
          if (savedEvent)
            return {
              ok: true as const,
              body: {
                activityEvent: savedEvent,
                reply: cachedReply,
                transcript,
              } satisfies ActivityTurnResponseBody,
            };
        }
      }

      if (activeActivity) {
        await ensureAvailabilityNotice(transcript, activeActivity);
      }

      let learnerEntry: TranscriptEntry | undefined;
      let activityEntry: TranscriptEntry | undefined;
      if (operation.kind === "message") {
        learnerEntry = await appendEntry(transcript, "learner", operation.text, {
          activity: activeActivity
            ? {
                activityId: activeActivity.activityId,
                state: activeActivity.state,
              }
            : null,
        });
      } else {
        activityEntry = transcript.entries.find(
          (entry) => entry.activityEvent?.requestId === operation.requestId,
        );
        if (!activityEntry) {
          activityEntry = await appendEntry(
            transcript,
            "activity",
            activityEvent!.text,
            {
              activity: {
                activityId: activeActivity!.activityId,
                state: activeActivity!.state,
              },
              activityEvent: activityEvent!,
            },
          );
        }
      }

      const started = performance.now();
      try {
        const activityContext = activeActivity
          ? buildActivityContext(activeActivity)
          : null;
        const turnInstruction =
          operation.kind === "activity_turn"
            ? "This is your turn in the active activity. Make exactly one required tool call. The platform will create the client-facing line from the validated action."
            : null;
        const systemPrompt = [
          DEFAULT_PERSONA.systemPrompt,
          activityContext,
          turnInstruction,
        ]
          .filter(Boolean)
          .join("\n\n");
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
          activeActivity?.requiredToolName,
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
                activeActivity.state,
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

        const requiredToolName = activeActivity?.requiredToolName;
        if (
          requiredToolName &&
          (reply.toolCalls.length !== 1 ||
            actions.length !== 1 ||
            actions[0]?.tool !== requiredToolName)
        ) {
          const fallbackText =
            actionSpeech(actions) ||
            reply.text.trim() ||
            actionClientText(actions);
          if (fallbackText) {
            await appendEntry(transcript, "virtual_client", fallbackText, {
              model: reply.model,
              latencyMs: Math.round(performance.now() - started),
              ...(operation.kind === "activity_turn"
                ? { activityTurnId: operation.requestId }
                : {}),
            });
          }
          const msg = "The virtual client did not return one valid activity action.";
          await appendEntry(transcript, "system", msg);
          return { ok: false as const, status: 502, msg };
        }

        const replyText =
          actionSpeech(actions) ||
          reply.text.trim() ||
          actionClientText(actions);
        if (!replyText) throw new LlmError("The virtual client returned an empty reply.");

        const replyEntry = await appendEntry(
          transcript,
          "virtual_client",
          replyText,
          {
            model: reply.model,
            latencyMs: Math.round(performance.now() - started),
            ...(actions.length > 0 ? { actions } : {}),
            ...(operation.kind === "activity_turn"
              ? { activityTurnId: operation.requestId }
              : {}),
          },
        );
        if (operation.kind === "activity_turn") {
          return {
            ok: true as const,
            body: {
              activityEvent: activityEntry!,
              reply: replyEntry,
              transcript,
            } satisfies ActivityTurnResponseBody,
          };
        }
        return {
          ok: true as const,
          body: {
            reply: replyEntry,
            learnerEntry: learnerEntry!,
            transcript,
          } satisfies ChatResponseBody,
        };
      } catch (err) {
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
    return Response.json(result.body, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[chat] transcript storage error:", err);
    return jsonError(500, "Could not save the transcript.");
  }
}

async function ensureAvailabilityNotice(
  transcript: Transcript,
  activeActivity: ResolvedActivity,
) {
  const toolNames = activeActivity.tools.map(({ name }) => name).sort();
  if (toolNames.length === 0) return;

  const previousActivityEntry = [...transcript.entries]
    .reverse()
    .find((entry) => entry.speaker === "learner" || entry.speaker === "activity");
  const previousNotice = [...transcript.entries]
    .reverse()
    .find((entry) => entry.activityNotice)?.activityNotice;
  const sameActivity =
    previousActivityEntry?.activity?.activityId === activeActivity.activityId;
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

function actionClientText(actions: ActivityAction[]): string {
  for (const action of actions) {
    if (!isRecord(action.input)) continue;
    for (const field of ["commentary", "rationale"] as const) {
      const text = action.input[field];
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
}

function actionSpeech(actions: ActivityAction[]): string {
  for (const action of actions) {
    if (
      isRecord(action.input) &&
      typeof action.input.spokenText === "string" &&
      action.input.spokenText.trim()
    )
      return action.input.spokenText.trim();
  }
  return "";
}
