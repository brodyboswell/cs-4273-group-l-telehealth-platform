import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Chess } from "chess.js";
import { POST } from "../app/api/chat/route";
import { GET as getTranscript } from "../app/api/transcripts/[sessionId]/route";
import { GET as getTranscripts } from "../app/api/transcripts/route";
import { DEFAULT_PERSONA } from "../lib/chat/persona";
import {
  generateClientReply,
  LlmError,
  resolveProvider,
  type LlmToolDefinition,
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

  it("passes feelings context to the mock, records its action, and deduplicates notices", async () => {
    const sessionId = "feelings-agent-session";
    const activity = {
      activityId: "feelings",
      state: { selectedMoodId: null },
    };
    const first = await post({ sessionId, message: "I'm not sure.", activity });
    assert.equal(first.status, 200);
    const firstData = await first.json();
    assert.deepEqual(firstData.learnerEntry.activity, activity);
    assert.equal(firstData.reply.actions.length, 1);
    assert.deepEqual(firstData.reply.actions[0], {
      activityId: "feelings",
      tool: "select_mood",
      input: {
        type: "select_mood",
        moodId: "worried",
        rationale:
          "I'm feeling worried because something has been weighing on me today.",
      },
    });
    assert.equal(
      firstData.transcript.entries.filter((entry: { activityNotice?: unknown }) =>
        entry.activityNotice,
      ).length,
      1,
    );

    const repeated = await post({ sessionId, message: "Why worried?", activity });
    const repeatedData = await repeated.json();
    assert.equal(
      repeatedData.transcript.entries.filter(
        (entry: { activityNotice?: unknown }) => entry.activityNotice,
      ).length,
      1,
    );

    await post({ sessionId, message: "Back in the room." });
    const returned = await post({ sessionId, message: "Back to feelings.", activity });
    const returnedData = await returned.json();
    assert.equal(
      returnedData.transcript.entries.filter(
        (entry: { activityNotice?: unknown }) => entry.activityNotice,
      ).length,
      2,
    );
  });

  it("uses a validated feelings rationale when the provider returns only a tool call", async (context) => {
    const previousProvider = process.env.LLM_PROVIDER;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    context.mock.method(console, "error", () => undefined);
    context.mock.method(globalThis, "fetch", async () =>
      Response.json({
        model: "test-model",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "select_mood",
                    arguments: JSON.stringify({
                      moodId: "worried",
                      rationale: "I feel worried because a lot is on my mind.",
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    try {
      process.env.LLM_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "test-key";
      const response = await post({
        sessionId: "feelings-tool-only",
        message: "Can you show how you are feeling?",
        activity: {
          activityId: "feelings",
          state: { selectedMoodId: null },
        },
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(
        data.reply.text,
        "I feel worried because a lot is on my mind.",
      );
      assert.deepEqual(data.reply.actions, [
        {
          activityId: "feelings",
          tool: "select_mood",
          input: {
            type: "select_mood",
            moodId: "worried",
            rationale: "I feel worried because a lot is on my mind.",
          },
        },
      ]);
    } finally {
      if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = previousProvider;
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it("runs an idempotent chess client turn and logs the learner move separately from speech", async () => {
    const game = new Chess();
    game.move({ from: "e2", to: "e4" });
    const gameId = "chess-api-game";
    const requestId = `${gameId}-1`;
    const activity = {
      activityId: "chess",
      state: {
        gameId,
        turnEpoch: 1,
        fen: game.fen(),
        moveHistory: game.history({ verbose: true }).map((move) => ({
          from: move.from,
          to: move.to,
          ...(move.promotion ? { promotion: move.promotion } : {}),
        })),
        learnerColor: "w",
      },
    };
    const request = {
      sessionId: "chess-turn-session",
      activityTurn: {
        activity,
        requestId,
        event: {
          type: "learner_move",
          input: { move: { from: "e2", to: "e4" } },
        },
      },
    };

    const [first, repeated] = await Promise.all([post(request), post(request)]);
    assert.equal(first.status, 200);
    const firstData = await first.json();
    assert.equal(firstData.activityEvent.speaker, "activity");
    assert.equal(firstData.activityEvent.activityEvent.actor, "learner");
    assert.equal(firstData.activityEvent.text, "The learner played e2e4. It is your turn to move.");
    assert.equal(firstData.reply.activityTurnId, requestId);
    assert.equal(firstData.reply.actions.length, 1);
    assert.equal(firstData.reply.actions[0].tool, "play_chess_move");
    assert.equal(firstData.reply.actions[0].input.gameId, gameId);
    assert.equal(firstData.reply.actions[0].input.turnEpoch, 1);
    assert.equal(firstData.reply.actions[0].input.fen, game.fen());
    assert.equal(
      firstData.transcript.entries.filter((entry: { speaker: string }) => entry.speaker === "learner").length,
      0,
    );

    const repeatedData = await repeated.json();
    assert.equal(repeatedData.reply.seq, firstData.reply.seq);
    assert.equal(repeatedData.transcript.entries.length, firstData.transcript.entries.length);

    const invalid = await post({
      ...request,
      sessionId: "invalid-chess-turn",
      activityTurn: {
        ...request.activityTurn,
        event: { type: "opening" },
      },
    });
    assert.equal(invalid.status, 400);
    assert.equal(await readTranscript("invalid-chess-turn"), null);
  });

  it("plays the client opening move when the learner chooses Black", async () => {
    const game = new Chess();
    const gameId = "black-chess-game";
    const response = await post({
      sessionId: "black-chess-session",
      activityTurn: {
        activity: {
          activityId: "chess",
          state: {
            gameId,
            turnEpoch: 0,
            fen: game.fen(),
            moveHistory: [],
            learnerColor: "b",
          },
        },
        requestId: `${gameId}-0`,
        event: { type: "opening" },
      },
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.activityEvent.activityEvent.actor, "platform");
    assert.equal(data.reply.actions.length, 1);
    assert.equal(data.reply.actions[0].tool, "play_chess_move");
    const input = data.reply.actions[0].input;
    assert.equal(input.gameId, gameId);
    assert.equal(input.turnEpoch, 0);
    assert.equal(input.fen, game.fen());
    assert.equal(game.move(input.move).color, "w");
    assert.equal(data.reply.activityTurnId, `${gameId}-0`);
  });

  it("retries a failed chess turn without duplicating the activity event", async (context) => {
    const previousProvider = process.env.LLM_PROVIDER;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    context.mock.method(console, "error", () => undefined);
    const game = new Chess();
    game.move({ from: "d2", to: "d4" });
    const gameId = "retry-chess-game";
    const request = {
      sessionId: "retry-chess-session",
      activityTurn: {
        activity: {
          activityId: "chess",
          state: {
            gameId,
            turnEpoch: 1,
            fen: game.fen(),
            moveHistory: [{ from: "d2", to: "d4" }],
            learnerColor: "w",
          },
        },
        requestId: `${gameId}-1`,
        event: {
          type: "learner_move",
          input: { move: { from: "d2", to: "d4" } },
        },
      },
    };

    try {
      process.env.LLM_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "test-key";
      context.mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response(JSON.stringify({ error: { message: "rate limited" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      );
      const failed = await post(request);
      assert.equal(failed.status, 502);

      process.env.LLM_PROVIDER = "mock";
      const retried = await post(request);
      assert.equal(retried.status, 200);
      const data = await retried.json();
      assert.equal(data.reply.activityTurnId, request.activityTurn.requestId);
      assert.equal(
        data.transcript.entries.filter(
          (entry: { activityEvent?: { requestId?: string } }) =>
            entry.activityEvent?.requestId === request.activityTurn.requestId,
        ).length,
        1,
      );
    } finally {
      if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = previousProvider;
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it("rejects unknown or invalid activity snapshots before recording a message", async () => {
    for (const activity of [
      { activityId: "unknown", state: {} },
      { activityId: "feelings", state: { selectedMoodId: "invented" } },
    ]) {
      const response = await post({
        sessionId: "bad-activity-session",
        message: "Hi",
        activity,
      });
      assert.equal(response.status, 400);
    }
    assert.equal(await readTranscript("bad-activity-session"), null);
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
  const moodTool: LlmToolDefinition = {
    name: "select_mood",
    description: "Select a mood.",
    inputSchema: {
      type: "object",
      properties: { moodId: { type: "string" } },
      required: ["moodId"],
    },
  };

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

  it("sends Anthropic tool schemas and parses tool_use blocks", async (context) => {
    let requestBody: unknown;
    context.mock.method(
      globalThis,
      "fetch",
      async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          model: "test-model",
          content: [
            { type: "tool_use", name: "select_mood", input: { moodId: "sad" } },
          ],
        });
      },
    );

    const reply = await generateClientReply(
      "scenario",
      [],
      { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" },
      [moodTool],
      "select_mood",
    );

    assert.equal(reply.text, "");
    assert.deepEqual(reply.toolCalls, [
      { name: "select_mood", input: { moodId: "sad" } },
    ]);
    assert.deepEqual(
      (requestBody as { tools: Array<{ input_schema: unknown }> }).tools[0]
        .input_schema,
      moodTool.inputSchema,
    );
    assert.deepEqual(
      (requestBody as { tool_choice: unknown }).tool_choice,
      { type: "tool", name: "select_mood" },
    );
  });

  it("sends OpenAI function tools and parses tool_calls", async (context) => {
    let requestBody: unknown;
    context.mock.method(
      globalThis,
      "fetch",
      async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          model: "test-model",
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: "select_mood",
                      arguments: '{"moodId":"sad"}',
                    },
                  },
                ],
              },
            },
          ],
        });
      },
    );

    const reply = await generateClientReply(
      "scenario",
      [],
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-key" },
      [moodTool],
      "select_mood",
    );

    assert.equal(reply.text, "");
    assert.deepEqual(reply.toolCalls, [
      { name: "select_mood", input: { moodId: "sad" } },
    ]);
    assert.deepEqual(
      (requestBody as { tools: Array<{ function: { parameters: unknown } }> })
        .tools[0].function.parameters,
      moodTool.inputSchema,
    );
    assert.deepEqual(
      (requestBody as { tool_choice: unknown }).tool_choice,
      { type: "function", function: { name: "select_mood" } },
    );
  });

  it("rejects malformed OpenAI tool arguments", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
      Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: { name: "select_mood", arguments: "{broken" },
                },
              ],
            },
          },
        ],
      }),
    );

    await assert.rejects(
      generateClientReply(
        "scenario",
        [],
        { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-key" },
        [moodTool],
      ),
      /invalid tool arguments/,
    );
  });
});
