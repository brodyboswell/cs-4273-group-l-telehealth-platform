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
import { DEFAULT_PERSONA } from "@/lib/chat/persona";
import {
  appendEntry,
  getOrCreateTranscript,
  isValidSessionId,
  toChatHistory,
  withSessionLock,
} from "@/lib/chat/transcriptStore";
import type { ChatResponseBody } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }

  const { sessionId, message } = (body ?? {}) as Record<string, unknown>;
  if (!isValidSessionId(sessionId)) {
    return jsonError(400, "sessionId must be 8–64 letters, numbers, dashes or underscores.");
  }
  if (typeof message !== "string" || !message.trim()) {
    return jsonError(400, "message cannot be empty.");
  }
  const text = message.trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonError(413, `message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }

  try {
    const result = await withSessionLock(sessionId, async () => {
      const transcript = await getOrCreateTranscript(sessionId, DEFAULT_PERSONA);
      const learnerEntry = await appendEntry(transcript, "learner", text);

      const started = performance.now();
      try {
        const reply = await generateClientReply(DEFAULT_PERSONA.systemPrompt, toChatHistory(transcript));
        const replyEntry = await appendEntry(transcript, "virtual_client", reply.text, {
          model: reply.model,
          latencyMs: Math.round(performance.now() - started),
        });
        return { ok: true as const, body: { reply: replyEntry, learnerEntry, transcript } };
      } catch (err) {
        // Keep the failure in the audit trail; the learner's message stays recorded.
        const msg = err instanceof LlmError ? err.message : "Unexpected error while generating a reply.";
        await appendEntry(transcript, "system", `Virtual client failed to respond: ${msg}`);
        if (!(err instanceof LlmError)) console.error("[chat] unexpected error:", err);
        return { ok: false as const, status: err instanceof LlmError ? err.status : 500, msg };
      }
    });

    if (!result.ok) return jsonError(result.status, result.msg);
    return Response.json(result.body satisfies ChatResponseBody);
  } catch (err) {
    console.error("[chat] transcript storage error:", err);
    return jsonError(500, "Could not save the transcript.");
  }
}
