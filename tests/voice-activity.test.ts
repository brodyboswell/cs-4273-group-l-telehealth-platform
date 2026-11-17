import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/voice/activity/route";
import { GET as getPersona } from "../app/api/voice/persona/route";
import { DEFAULT_PERSONA } from "../lib/chat/persona";
import {
  endPracticeSession,
  getOrCreateTranscript,
  readTranscript,
} from "../lib/chat/transcriptStore";
import { isTranscript } from "../lib/chat/validation";
import { VOICE_AGENT_SECRET_HEADER } from "../lib/voice/agentAuth";

const SECRET = "test-voice-agent-secret-0123456789";
const OWNER = "user-voice-tests";
let directory: string;
const previous = {
  dir: process.env.TRANSCRIPT_DIR,
  secret: process.env.VOICE_AGENT_SECRET,
};

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "telehealth-voice-tests-"));
  process.env.TRANSCRIPT_DIR = directory;
  process.env.VOICE_AGENT_SECRET = SECRET;
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

function startSession(sessionId: string) {
  return getOrCreateTranscript(sessionId, DEFAULT_PERSONA, OWNER, "Voice test");
}

function post(body: unknown, secret: string | null = SECRET) {
  return POST(
    new Request("http://localhost/api/voice/activity", {
      method: "POST",
      headers: secret ? { [VOICE_AGENT_SECRET_HEADER]: secret } : {},
      body: JSON.stringify(body),
    }),
  );
}

describe("voice activity context endpoint", () => {
  it("describes a valid feelings snapshot without touching the transcript", async () => {
    const before = await startSession("voice-describe-1");
    const res = await post({
      sessionId: "voice-describe-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "worried" } },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.activityId, "feelings");
    assert.equal(data.label, "feelings chart");
    assert.match(data.context, /Currently selected: Worried/);
    const after = await readTranscript("voice-describe-1");
    assert.equal(after?.entries.length, before.entries.length);
  });

  it("records a learner update and keeps the session owner", async () => {
    await startSession("voice-record-1");
    const res = await post({
      sessionId: "voice-record-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "sad" } },
      record: true,
    });
    assert.equal(res.status, 200);

    const transcript = await readTranscript("voice-record-1");
    assert.ok(transcript && isTranscript(transcript));
    assert.equal(transcript.ownerId, OWNER);
    const last = transcript.entries.at(-1);
    assert.equal(last?.speaker, "activity");
    assert.equal(last?.seq, transcript.entries.length);
    assert.match(last?.text ?? "", /Currently selected: Sad/);
    assert.deepEqual(last?.activity, {
      activityId: "feelings",
      state: { selectedMoodId: "sad" },
    });
  });

  it("rejects unknown activities and invalid state", async () => {
    const unknown = await post({
      sessionId: "voice-reject-1",
      activity: { activityId: "not-real", state: {} },
    });
    assert.equal(unknown.status, 400);

    const badMood = await post({
      sessionId: "voice-reject-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "ecstatic" } },
      record: true,
    });
    assert.equal(badMood.status, 400);
    assert.equal(await readTranscript("voice-reject-1"), null);
  });

  it("never creates a session and refuses ended ones", async () => {
    const missing = await post({
      sessionId: "voice-missing-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "sad" } },
      record: true,
    });
    assert.equal(missing.status, 404);
    assert.equal(await readTranscript("voice-missing-1"), null);

    await startSession("voice-ended-1");
    await endPracticeSession("voice-ended-1", OWNER);
    const ended = await post({
      sessionId: "voice-ended-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "sad" } },
      record: true,
    });
    assert.equal(ended.status, 409);
  });

  it("requires the voice agent secret", async () => {
    const body = {
      sessionId: "voice-describe-1",
      activity: { activityId: "feelings", state: { selectedMoodId: null } },
    };
    assert.equal((await post(body, null)).status, 401);
    assert.equal((await post(body, "wrong-secret-0123456789")).status, 401);
  });

  it("rejects an invalid session id", async () => {
    const res = await post({
      sessionId: "../etc",
      activity: { activityId: "feelings", state: { selectedMoodId: null } },
    });
    assert.equal(res.status, 400);
  });
});

describe("voice persona endpoint", () => {
  function persona(sessionId: string, secret: string | null = SECRET) {
    return getPersona(
      new Request(`http://localhost/api/voice/persona?sessionId=${sessionId}`, {
        headers: secret ? { [VOICE_AGENT_SECRET_HEADER]: secret } : {},
      }),
    );
  }

  it("returns the session's persona to the agent only", async () => {
    await startSession("voice-persona-1");
    assert.equal((await persona("voice-persona-1", null)).status, 401);
    const res = await persona("voice-persona-1");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.name, DEFAULT_PERSONA.name);
    assert.equal(data.ended, false);
    assert.equal((await persona("voice-persona-none")).status, 404);
  });
});
