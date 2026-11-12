import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/voice/activity/route";
import { readTranscript } from "../lib/chat/transcriptStore";
import { isTranscript } from "../lib/chat/validation";

let directory: string;
const previousDirectory = process.env.TRANSCRIPT_DIR;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "telehealth-voice-tests-"));
  process.env.TRANSCRIPT_DIR = directory;
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.TRANSCRIPT_DIR;
  else process.env.TRANSCRIPT_DIR = previousDirectory;
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/voice/activity", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("voice activity context endpoint", () => {
  it("describes a valid feelings snapshot without touching the transcript", async () => {
    const res = await post({
      sessionId: "voice-describe-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "worried" } },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.activityId, "feelings");
    assert.equal(data.label, "feelings chart");
    assert.match(data.context, /Currently selected: Worried/);
    assert.equal(await readTranscript("voice-describe-1"), null);
  });

  it("records a learner update as a valid, ordered activity entry", async () => {
    const res = await post({
      sessionId: "voice-record-1",
      activity: { activityId: "feelings", state: { selectedMoodId: "sad" } },
      record: true,
    });
    assert.equal(res.status, 200);

    const transcript = await readTranscript("voice-record-1");
    assert.ok(transcript && isTranscript(transcript));
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

  it("rejects an invalid session id", async () => {
    const res = await post({
      sessionId: "../etc",
      activity: { activityId: "feelings", state: { selectedMoodId: null } },
    });
    assert.equal(res.status, 400);
  });
});
