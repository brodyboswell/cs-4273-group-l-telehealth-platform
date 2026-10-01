/**
 * Server-only LLM client for the virtual client.
 *
 * The API key is read from environment variables on the server (see .env.example)
 * and is never sent to the browser. Providers are called with plain fetch so the
 * project needs no extra SDK dependency.
 *
 * Provider selection (LLM_PROVIDER):
 *   "anthropic" | "openai" | "mock"
 * If unset, the first provider with a key wins (Anthropic, then OpenAI); with no key
 * at all it falls back to "mock" so the UI can be developed without spending tokens.
 */
// Server-only module: never import this from a "use client" component.
import type { ChatTurn } from "./types";

export type ProviderName = "anthropic" | "openai" | "mock";

export interface LlmReply {
  text: string;
  /** "provider:model", stored in the transcript for research traceability. */
  model: string;
}

export class LlmError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "LlmError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 300;

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderName {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "openai" || explicit === "mock") {
    return explicit;
  }
  if (explicit) {
    throw new LlmError(`Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use anthropic, openai, or mock.`, 500);
  }
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export async function generateClientReply(
  systemPrompt: string,
  history: ChatTurn[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<LlmReply> {
  const provider = resolveProvider(env);
  switch (provider) {
    case "anthropic":
      return callAnthropic(systemPrompt, history, env);
    case "openai":
      return callOpenAI(systemPrompt, history, env);
    case "mock":
      return mockReply(history);
  }
}

function requireKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new LlmError(`${name} is not set. Add it to .env.local (see .env.example).`, 500);
  }
  return value;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "could not be reached";
    throw new LlmError(`The AI provider ${reason}.`, 504);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Log the provider's message server-side only; it can mention the key or account.
    console.error(`[chat] provider error ${res.status}:`, data?.error ?? data);
    const hint =
      res.status === 401 ? "the API key was rejected" :
      res.status === 429 ? "the rate limit or quota was reached" :
      `status ${res.status}`;
    throw new LlmError(`The AI provider returned an error (${hint}).`, 502);
  }
  return data;
}

async function callAnthropic(systemPrompt: string, history: ChatTurn[], env: NodeJS.ProcessEnv): Promise<LlmReply> {
  const apiKey = requireKey(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY");
  const model = env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    { model, max_tokens: MAX_OUTPUT_TOKENS, system: systemPrompt, messages: history },
  );
  const text = (data?.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("")
    .trim();
  if (!text) throw new LlmError("The AI provider returned an empty reply.");
  return { text, model: `anthropic:${data.model ?? model}` };
}

async function callOpenAI(systemPrompt: string, history: ChatTurn[], env: NodeJS.ProcessEnv): Promise<LlmReply> {
  const apiKey = requireKey(env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const data = await postJson(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${apiKey}` },
    {
      model,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...history],
    },
  );
  const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new LlmError("The AI provider returned an empty reply.");
  return { text, model: `openai:${data.model ?? model}` };
}

const MOCK_REPLIES = [
  "*shrugs* I dunno. It's been kind of a lot lately, I guess.",
  "Classes are… fine. I mean, I've missed some. More than some.",
  "I just don't really feel like going. It's easier to stay in my room.",
  "My parents don't know about the grades yet. That's kind of the worst part.",
  "Yeah. It's lonely here, honestly. Everyone already has their people.",
];

/** Deterministic offline replies so the chat can be demoed without an API key. */
function mockReply(history: ChatTurn[]): LlmReply {
  const learnerTurns = history.filter((t) => t.role === "user").length;
  // History starts with a synthetic "session connected" user turn, so skip it.
  const text = MOCK_REPLIES[Math.max(0, learnerTurns - 2) % MOCK_REPLIES.length];
  return { text, model: "mock:offline" };
}
