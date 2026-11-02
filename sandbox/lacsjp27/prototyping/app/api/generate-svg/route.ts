import { sanitizeGeneratedSvg } from "@/lib/svg/sanitizeSvg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 30_000;

type Provider = "anthropic" | "openai" | "mock";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!isRecord(body) || typeof body.prompt !== "string" || !body.prompt.trim())
    return Response.json({ error: "Enter a short drawing prompt." }, { status: 400 });

  const prompt = body.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH)
    return Response.json(
      { error: `Keep the prompt under ${MAX_PROMPT_LENGTH} characters.` },
      { status: 413 },
    );

  try {
    const provider = resolveProvider();
    const result =
      provider === "mock"
        ? { text: makeSampleSvg(prompt), model: "local-sample" }
        : await requestProvider(provider, prompt);
    const svg = sanitizeGeneratedSvg(result.text);

    return Response.json({ svg, provider, model: result.model }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate the drawing.";
    const status = message.includes("not configured") ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}

function resolveProvider(): Provider {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "openai" || explicit === "mock")
    return explicit;
  if (explicit)
    throw new Error("LLM_PROVIDER must be anthropic, openai, or mock.");
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

async function requestProvider(provider: Exclude<Provider, "mock">, prompt: string) {
  const systemPrompt = [
    "Create one small, friendly SVG doodle for an educational telehealth whiteboard. Make it rudimentary, like a quick sketch someone could draw by hand in a few seconds. Use about 3–8 simple shapes or strokes, loose slightly imperfect lines, and minimal detail. Make the idea recognizable without making it look like a polished or realistic illustration; avoid shading, textures, tiny details, and decorative backgrounds.",
    "Return only a single complete SVG document, with no Markdown fences or explanation.",
    "Use a 500 by 350 viewBox. Do not use text, scripts, stylesheets, filters, gradients, masks, clip paths, images, links, or external resources.",
    "Use only g, path, rect, circle, ellipse, line, polyline, and polygon elements.",
    "Colors should come from this palette: #293c35, #cf5547, #df8b37, #53886b, #477fb2, #8a63aa.",
    "Keep all drawing content within the viewBox. Do not add facts beyond the user's prompt.",
  ].join(" ");

  const key =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`${provider} is not configured with an API key.`);

  const url =
    provider === "anthropic"
      ? "https://api.anthropic.com/v1/messages"
      : "https://api.openai.com/v1/chat/completions";
  const headers =
    provider === "anthropic"
      ? {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        }
      : { authorization: `Bearer ${key}` };
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"
      : process.env.OPENAI_MODEL || "gpt-4o-mini";
  const requestBody =
    provider === "anthropic"
      ? {
          model,
          max_tokens: 1200,
          temperature: 0.25,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }
      : {
          model,
          max_tokens: 1200,
          temperature: 0.25,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "timed out"
        : "could not be reached";
    throw new Error(`The ${provider} provider ${reason}.`);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`[svg-prototype] ${provider} provider returned ${response.status}`);
    throw new Error(`The ${provider} provider returned an error (${response.status}).`);
  }

  const text = extractProviderText(provider, data);
  if (!text) throw new Error("The model returned an empty drawing.");
  return { text, model: `${provider}:${model}` };
}

function extractProviderText(provider: Exclude<Provider, "mock">, value: unknown) {
  if (!isRecord(value)) return "";

  if (provider === "anthropic") {
    if (!Array.isArray(value.content)) return "";
    return value.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          isRecord(block) && block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n");
  }

  if (!Array.isArray(value.choices)) return "";
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return "";
  return typeof choice.message.content === "string" ? choice.message.content : "";
}

function makeSampleSvg(prompt: string): string {
  const accent = prompt.toLowerCase().includes("sun") ? "#df8b37" : "#477fb2";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350" viewBox="0 0 500 350"><circle cx="250" cy="154" r="67" fill="#f7f6f2" stroke="${accent}" stroke-width="9"/><path d="M218 147c9-10 18-10 27 0m10 0c9-10 18-10 27 0M222 178c18 17 38 17 56 0" fill="none" stroke="#293c35" stroke-width="8" stroke-linecap="round"/><path d="M250 64V38m0 232v-25M160 154h-25m230 0h-25m-153-63-18-18m163 163-18-18m0-127 18-18m-163 163 18-18" fill="none" stroke="#53886b" stroke-width="8" stroke-linecap="round"/></svg>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
