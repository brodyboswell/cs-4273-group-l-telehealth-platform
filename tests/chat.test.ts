import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/chat/route";
import { GET as getTranscript } from "../app/api/transcripts/[sessionId]/route";
import { GET as getTranscripts } from "../app/api/transcripts/route";
import { DEFAULT_PERSONA } from "../lib/chat/persona";
import {
  generateClientReply,
  LlmError,
  resolveProvider,
} from "../lib/chat/llm";
import {
  appendEntry,
  getOrCreateTranscript,
  readTranscript,
  toChatHistory,
  withSessionLock,
} from "../lib/chat/transcriptStore";
import { isValidSessionId, MAX_MESSAGE_LENGTH } from "../lib/chat/validation";

let directory: string;
const previousDirectory = process.env.TRANSCRIPT_DIR;
const previousProvider = process.env.LLM_PROVIDER;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "telehealth-tests-"));
  process.env.TRANSCRIPT_DIR = directory;
  process.env.LLM_PROVIDER = "mock";
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.TRANSCRIPT_DIR;
  else process.env.TRANSCRIPT_DIR = previousDirectory;
  if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = previousProvider;
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function get(id: string) {
  return getTranscript(new Request(`http://localhost/api/transcripts/${id}`), {
    params: Promise.resolve({ sessionId: id }),
  });
}

describe("transcript storage", () => {
  it("rejects unsafe file names and invalid session identifiers", async () => {
    for (const id of ["../secret", "too-short/", "a".repeat(65), "", null])
      assert.equal(isValidSessionId(id), false);
    assert.equal(isValidSessionId("demo-session_123"), true);
    await assert.rejects(readTranscript("../secret"), /Invalid session id/);
  });

  it("creates the opening transcript once and preserves ordered concurrent writes", async () => {
    const id = "concurrent-session";
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        withSessionLock(id, async () => {
          const transcript = await getOrCreateTranscript(id, DEFAULT_PERSONA);
          await appendEntry(transcript, "learner", `Message ${index}`);
        }),
      ),
    );
    const transcript = await readTranscript(id);
    assert.ok(transcript);
    assert.equal(transcript.entries.length, 14);
    assert.deepEqual(
      transcript.entries.map((entry) => entry.seq),
      Array.from({ length: 14 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      transcript.entries.slice(2).map((entry) => entry.text),
      Array.from({ length: 12 }, (_, index) => `Message ${index}`),
    );
    assert.equal(
      (await readdir(directory)).some((file) => file.endsWith(".tmp")),
      false,
    );
  });

  it("keeps separate sessions independent and releases a failed lock", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const events: string[] = [];
    const failing = assert.rejects(
      withSessionLock("locked-session", async () => {
        events.push("first");
        started();
        await gate;
        throw new Error("planned failure");
      }),
      /planned failure/,
    );
    await entered;
    const queued = withSessionLock("locked-session", async () => {
      events.push("second");
    });
    await withSessionLock("another-session", async () => {
      events.push("independent");
    });
    assert.deepEqual(events, ["first", "independent"]);
    release();
    await Promise.all([failing, queued]);
    assert.deepEqual(events, ["first", "independent", "second"]);
  });

  it("keeps corrupt logs intact instead of silently replacing them", async () => {
    const id = "corrupt-session";
    const transcript = await getOrCreateTranscript(id, DEFAULT_PERSONA);
    transcript.entries[0].seq = 10;
    const contents = JSON.stringify(transcript);
    const file = path.join(directory, `${id}.json`);
    await writeFile(file, contents);
    await assert.rejects(
      getOrCreateTranscript(id, DEFAULT_PERSONA),
      /Invalid transcript data/,
    );
    assert.equal(await readFile(file, "utf8"), contents);
    await rm(file);
  });

  it("merges consecutive learner turns after provider failures without changing the audit log", async () => {
    const transcript = await getOrCreateTranscript(
      "history-session",
      DEFAULT_PERSONA,
    );
    await appendEntry(transcript, "learner", "First question");
    await appendEntry(transcript, "system", "Provider failed");
    await appendEntry(transcript, "learner", "Follow-up question");
    const history = toChatHistory(transcript);
    assert.equal(history[0].role, "user");
    assert.equal(history[1].content, DEFAULT_PERSONA.openingLine);
    assert.deepEqual(history[2], {
      role: "user",
      content: "First question\n\nFollow-up question",
    });
    assert.equal(transcript.entries.length, 5);
  });
});

describe("chat HTTP endpoints", () => {
  it("rejects malformed bodies and enforces the shared message limit", async () => {
    assert.equal((await post(null)).status, 400);
    assert.equal((await post([])).status, 400);
    assert.equal(
      (await post({ sessionId: "valid-session", message: "  " })).status,
      400,
    );
    assert.equal(
      (await post({ sessionId: "../secret", message: "Hi" })).status,
      400,
    );
    const response = await post({
      sessionId: "valid-session",
      message: "x".repeat(MAX_MESSAGE_LENGTH + 1),
    });
    assert.equal(response.status, 413);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const malformed = await POST(
      new Request("http://localhost/api/chat", { method: "POST", body: "{" }),
    );
    assert.equal(malformed.status, 400);
  });

  it("records both trimmed learner input and the offline reply in order", async () => {
    const response = await post({
      sessionId: "api-session",
      message: "  Hi Alex  ",
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.learnerEntry.text, "Hi Alex");
    assert.equal(data.reply.model, "mock:offline");
    assert.equal(data.reply.seq, data.learnerEntry.seq + 1);
    const download = await getTranscript(
      new Request(
        "http://localhost/api/transcripts/api-session?format=txt&download=1",
      ),
      { params: Promise.resolve({ sessionId: "api-session" }) },
    );
    assert.equal(
      download.headers.get("content-disposition"),
      'attachment; filename="transcript-api-session.txt"',
    );
    assert.match(await download.text(), /Learner: Hi Alex/);
  });

  it("returns consistent JSON errors when transcript storage cannot be accessed", async (context) => {
    context.mock.method(console, "error", () => undefined);
    const blocked = path.join(directory, "not-a-directory");
    await writeFile(blocked, "do not modify");
    process.env.TRANSCRIPT_DIR = blocked;
    try {
      for (const response of [
        await get("storage-error"),
        await getTranscripts(),
        await post({ sessionId: "storage-error", message: "Hi" }),
      ]) {
        assert.equal(response.status, 500);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(typeof (await response.json()).error, "string");
      }
      assert.equal(await readFile(blocked, "utf8"), "do not modify");
    } finally {
      process.env.TRANSCRIPT_DIR = directory;
    }
  });
});

describe("provider responses", () => {
  it("chooses an explicit provider before keys and rejects unsupported providers", () => {
    assert.equal(
      resolveProvider({ LLM_PROVIDER: "mock", OPENAI_API_KEY: "test" }),
      "mock",
    );
    assert.equal(
      resolveProvider({ ANTHROPIC_API_KEY: "test", OPENAI_API_KEY: "test" }),
      "anthropic",
    );
    assert.equal(resolveProvider({}), "mock");
    assert.throws(
      () => resolveProvider({ LLM_PROVIDER: "unsupported" }),
      LlmError,
    );
  });

  it("accepts only actual text content from OpenAI", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
      Response.json({
        choices: [{ message: { content: { unexpected: true } } }],
      }),
    );
    await assert.rejects(
      generateClientReply("scenario", [], {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
      }),
      (error: unknown) => error instanceof LlmError && error.status === 502,
    );
  });

  it("treats malformed Anthropic content as a provider error", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
      Response.json({ content: { text: "not an array" } }),
    );
    await assert.rejects(
      generateClientReply("scenario", [], {
        LLM_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test-key",
      }),
      LlmError,
    );
  });

  it("rejects invalid provider JSON without leaking its response", async (context) => {
    context.mock.method(
      globalThis,
      "fetch",
      async () => new Response("not-json"),
    );
    await assert.rejects(
      generateClientReply("scenario", [], {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
      }),
      /invalid reply/,
    );
  });
});
