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
import { isRecord } from "./validation";
import type { ChatTurn } from "./types";
import type { ToolInputSchema } from "@/lib/activities/types";

type ProviderEnvironment = Record<string, string | undefined>;

export type ProviderName = "anthropic" | "openai" | "mock";

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  mockInput?: unknown;
}

export interface LlmToolCall {
  name: string;
  input: unknown;
}

export interface LlmReply {
  text: string;
  /** "provider:model", stored in the transcript for research traceability. */
  model: string;
  toolCalls: LlmToolCall[];
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 300;

export function resolveProvider(
  env: ProviderEnvironment = process.env,
): ProviderName {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "anthropic" ||
    explicit === "openai" ||
    explicit === "mock"
  ) {
    return explicit;
  }
  if (explicit) {
    throw new LlmError(
      `Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use anthropic, openai, or mock.`,
      500,
    );
  }
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export async function generateClientReply(
  systemPrompt: string,
  history: ChatTurn[],
  env: ProviderEnvironment = process.env,
  tools: readonly LlmToolDefinition[] = [],
  requiredToolName?: string,
): Promise<LlmReply> {
  const provider = resolveProvider(env);
  switch (provider) {
    case "anthropic":
      return callAnthropic(systemPrompt, history, env, tools, requiredToolName);
    case "openai":
      return callOpenAI(systemPrompt, history, env, tools, requiredToolName);
    case "mock":
      return mockReply(history, tools, requiredToolName);
  }
}

function requireKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new LlmError(
      `${name} is not set. Add it to .env.local (see .env.example).`,
      500,
    );
  }
  return value;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? "timed out"
        : "could not be reached";
    throw new LlmError(`The AI provider ${reason}.`, 504);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // Provider response bodies may contain account details; log only the status.
    console.error(`[chat] provider error ${res.status}`);
    const hint =
      res.status === 401
        ? "the API key was rejected"
        : res.status === 429
          ? "the rate limit or quota was reached"
          : `status ${res.status}`;
    throw new LlmError(`The AI provider returned an error (${hint}).`, 502);
  }
  if (!isRecord(data))
    throw new LlmError("The AI provider returned an invalid reply.");
  return data;
}

async function callAnthropic(
  systemPrompt: string,
  history: ChatTurn[],
  env: ProviderEnvironment,
  tools: readonly LlmToolDefinition[],
  requiredToolName?: string,
): Promise<LlmReply> {
  const apiKey = requireKey(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY");
  const model = env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: history,
      ...(tools.length > 0
        ? {
            tools: tools.map(({ name, description, inputSchema }) => ({
              name,
              description,
              input_schema: inputSchema,
            })),
          }
        : {}),
      ...(requiredToolName
        ? { tool_choice: { type: "tool", name: requiredToolName } }
        : {}),
    },
  );
  const content = Array.isArray(data.content) ? data.content : [];
  const text = content
    .filter(
      (block: unknown): block is { type: "text"; text: string } =>
        isRecord(block) &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("")
    .trim();
  const toolBlocks = content.filter(
    (block): block is Record<string, unknown> =>
      isRecord(block) && block.type === "tool_use",
  );
  const toolCalls = toolBlocks.map((block): LlmToolCall => {
    if (typeof block.name !== "string" || !("input" in block))
      throw new LlmError("The AI provider returned an invalid tool call.");
    return { name: block.name, input: block.input };
  });
  if (!text && toolCalls.length === 0)
    throw new LlmError("The AI provider returned an empty reply.");
  return {
    text,
    model: `anthropic:${typeof data.model === "string" ? data.model : model}`,
    toolCalls,
  };
}

async function callOpenAI(
  systemPrompt: string,
  history: ChatTurn[],
  env: ProviderEnvironment,
  tools: readonly LlmToolDefinition[],
  requiredToolName?: string,
): Promise<LlmReply> {
  const apiKey = requireKey(env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const data = await postJson(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${apiKey}` },
    {
      model,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      ...(tools.length > 0
        ? {
            tools: tools.map(({ name, description, inputSchema }) => ({
              type: "function",
              function: { name, description, parameters: inputSchema },
            })),
          }
        : {}),
      ...(requiredToolName
        ? {
            tool_choice: {
              type: "function",
              function: { name: requiredToolName },
            },
            parallel_tool_calls: false,
          }
        : {}),
    },
  );
  const choice: unknown = Array.isArray(data.choices) ? data.choices[0] : null;
  const message: unknown = isRecord(choice) ? choice.message : null;
  const text =
    isRecord(message) && typeof message.content === "string"
      ? message.content.trim()
      : "";
  const rawToolCalls = isRecord(message) ? message.tool_calls : undefined;
  if (rawToolCalls !== undefined && !Array.isArray(rawToolCalls))
    throw new LlmError("The AI provider returned invalid tool calls.");
  const toolCalls = (Array.isArray(rawToolCalls) ? rawToolCalls : []).map(
    (call): LlmToolCall => {
      const fn = isRecord(call) ? call.function : null;
      if (
        !isRecord(fn) ||
        typeof fn.name !== "string" ||
        typeof fn.arguments !== "string"
      )
        throw new LlmError("The AI provider returned an invalid tool call.");
      let input: unknown;
      try {
        input = JSON.parse(fn.arguments);
      } catch {
        throw new LlmError("The AI provider returned invalid tool arguments.");
      }
      return { name: fn.name, input };
    },
  );
  if (!text && toolCalls.length === 0)
    throw new LlmError("The AI provider returned an empty reply.");
  return {
    text,
    model: `openai:${typeof data.model === "string" ? data.model : model}`,
    toolCalls,
  };
}

const MOCK_REPLIES = [
  "Ummm, okay I guess.",
  "School's just... a lot. Like, the rules here are so weird.",
  "I like chess. I'm not that good, but it's better than just sitting around.",
  "I dunno. Can we talk about something else? Wait, no, what was I saying...",
  "Yeah, so my lunch was expired the other day, like actually expired. Nobody even cared. I just ate it anyway.",
];

/** Deterministic offline replies so the chat can be demoed without an API key. */
function mockReply(
  history: ChatTurn[],
  tools: readonly LlmToolDefinition[],
  requiredToolName?: string,
): LlmReply {
  const learnerTurns = history.filter((t) => t.role === "user").length;
  // History starts with a synthetic "session connected" user turn, so skip it.
  const text =
    MOCK_REPLIES[Math.max(0, learnerTurns - 2) % MOCK_REPLIES.length];
  const mockTool = requiredToolName
    ? tools.find((tool) => tool.name === requiredToolName)
    : tools.find((tool) => tool.mockInput !== undefined);
  const mockInput = mockTool?.mockInput;
  const mockText =
    requiredToolName &&
    isRecord(mockInput) &&
    typeof mockInput.commentary === "string"
      ? mockInput.commentary
      : text;
  return {
    text: mockText,
    model: "mock:offline",
    toolCalls: mockTool
      ? [{ name: mockTool.name, input: mockInput }]
      : [],
  };
}
