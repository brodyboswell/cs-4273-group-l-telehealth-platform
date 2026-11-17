import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST as postAction } from "../app/api/voice/action/route";
import { POST as postActivity } from "../app/api/voice/activity/route";
import { DEFAULT_PERSONA } from "../lib/chat/persona";
import {
  getOrCreateTranscript,
  readTranscript,
} from "../lib/chat/transcriptStore";
import { VOICE_AGENT_SECRET_HEADER } from "../lib/voice/agentAuth";

const SECRET = "test-voice-agent-secret-0123456789";
const OWNER = "user-voice-action-tests";
let directory: string;
const previous = {
  dir: process.env.TRANSCRIPT_DIR,
  secret: process.env.VOICE_AGENT_SECRET,
};

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "telehealth-voice-action-"));
  process.env.TRANSCRIPT_DIR = directory;
  process.env.VOICE_AGENT_SECRET = SECRET;
  for (const id of ["voice-action-1", "voice-action-4", "voice-tools-1"])
    await getOrCreateTranscript(id, DEFAULT_PERSONA, OWNER, "Voice test");
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
  restore("TRANSCRIPT_DIR", previous.dir);
  restore("VOICE_AGENT_SECRET", previous.secret);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const agentHeaders = { [VOICE_AGENT_SECRET_HEADER]: SECRET };

function action(body: unknown, headers: Record<string, string> = agentHeaders) {
  return postAction(
    new Request("http://localhost/api/voice/action", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

const feelings = { activityId: "feelings", state: { selectedMoodId: null } };

describe("voice activity tools", () => {
  it("lists the registry's tools with the activity context", async () => {
    const res = await postActivity(
      new Request("http://localhost/api/voice/activity", {
        method: "POST",
        headers: agentHeaders,
        body: JSON.stringify({ sessionId: "voice-tools-1", activity: feelings }),
      }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(
      data.tools.map((tool: { name: string }) => tool.name),
      ["select_mood"],
    );
    assert.equal(data.tools[0].inputSchema.type, "object");
  });

  it("validates a feeling selection and records it with its action", async () => {
    const res = await action({
      sessionId: "voice-action-1",
      activity: feelings,
      tool: "select_mood",
      input: { moodId: "worried", rationale: "I have a lot on my mind." },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.action.activityId, "feelings");
    assert.equal(data.action.tool, "select_mood");
    assert.equal(data.action.input.moodId, "worried");

    const transcript = await readTranscript("voice-action-1");
    assert.equal(transcript?.ownerId, OWNER);
    const last = transcript?.entries.at(-1);
    assert.equal(last?.speaker, "virtual_client");
    assert.equal(last?.text, "I have a lot on my mind.");
    assert.equal(last?.actions?.[0]?.tool, "select_mood");
  });

  it("rejects an unknown feeling without touching the transcript", async () => {
    const res = await action({
      sessionId: "voice-action-2",
      activity: feelings,
      tool: "select_mood",
      input: { moodId: "ecstatic", rationale: "Great." },
    });
    assert.equal(res.status, 400);
    assert.equal(await readTranscript("voice-action-2"), null);
  });

  it("rejects tools the activity does not offer", async () => {
    const res = await action({
      sessionId: "voice-action-3",
      activity: feelings,
      tool: "replace_whiteboard_with_svg",
      input: {},
    });
    assert.equal(res.status, 400);
    assert.equal(await readTranscript("voice-action-3"), null);
  });

  it("sanitizes whiteboard drawings and keeps the spoken line", async () => {
    const res = await action({
      sessionId: "voice-action-4",
      activity: { activityId: "whiteboard", state: { hasContent: false } },
      tool: "replace_whiteboard_with_svg",
      input: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350"><circle cx="250" cy="175" r="60" fill="none" stroke="#293C35"/></svg>',
        spokenText: "Here is a little sun.",
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, "Here is a little sun.");
    assert.match(data.action.input.svg, /<circle/);
  });

  it("rejects whiteboard SVG with scripts", async () => {
    const res = await action({
      sessionId: "voice-action-5",
      activity: { activityId: "whiteboard", state: { hasContent: false } },
      tool: "replace_whiteboard_with_svg",
      input: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350"><script>alert(1)</script></svg>',
        spokenText: "Oops.",
      },
    });
    assert.equal(res.status, 400);
  });

  it("rejects chess moves when it is not the client's turn", async () => {
    const res = await action({
      sessionId: "voice-action-6",
      activity: {
        activityId: "chess",
        state: {
          gameId: "game-12345678",
          turnEpoch: 0,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          moveHistory: [],
          learnerColor: "w",
        },
      },
      tool: "play_chess_move",
      input: { move: "e7e5" },
    });
    assert.equal(res.status, 400);
  });

  it("requires the agent secret and an existing session", async () => {
    const body = {
      sessionId: "voice-action-1",
      activity: feelings,
      tool: "select_mood",
      input: { moodId: "sad", rationale: "Rough day." },
    };
    assert.equal((await action(body, {})).status, 401);
    const missing = await action({ ...body, sessionId: "voice-action-none" });
    assert.equal(missing.status, 404);
    assert.equal(await readTranscript("voice-action-none"), null);
  });

  it("rejects malformed requests", async () => {
    assert.equal(
      (await action({ sessionId: "../x", activity: feelings, tool: "select_mood", input: {} })).status,
      400,
    );
    assert.equal(
      (await action({ sessionId: "voice-action-7", activity: feelings, input: {} })).status,
      400,
    );
  });
});
