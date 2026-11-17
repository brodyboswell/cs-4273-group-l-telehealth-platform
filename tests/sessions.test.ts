import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { POST as startSession } from "../app/api/sessions/route";
import { POST as endSession } from "../app/api/sessions/[sessionId]/end/route";
import { POST as chat } from "../app/api/chat/route";
import { GET as getTranscript } from "../app/api/transcripts/[sessionId]/route";
import { GET as getSessions } from "../app/api/transcripts/route";
import { auth } from "../lib/auth/server";
import { readTranscript } from "../lib/chat/transcriptStore";
import { isTranscript, isValidSessionId } from "../lib/chat/validation";

let directory: string;
const previousDirectory = process.env.TRANSCRIPT_DIR;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "practice-session-tests-"));
  process.env.TRANSCRIPT_DIR = directory;
});

describe("hosted browser-only practice", () => {
  it("starts, chats, and ends without filesystem storage, while checking snapshot ownership", async (context) => {
    context.mock.method(auth, "getUser", async () => ({
      id: "browser-learner",
    }));
    const previousMode = process.env.PRACTICE_STORAGE;
    const previousProvider = process.env.LLM_PROVIDER;
    const blocked = path.join(directory, "not-a-directory");
    await writeFile(blocked, "untouched");
    process.env.PRACTICE_STORAGE = "browser";
    process.env.LLM_PROVIDER = "mock";
    process.env.TRANSCRIPT_DIR = blocked;
    try {
      const response = await start({
        requestId: randomUUID(),
        name: "Hosted practice",
      });
      assert.equal(response.status, 201);
      const { sessionId, transcript } = await response.json();
      assert.ok(isTranscript(transcript));
      assert.equal(transcript.name, "Hosted practice");
      const send = (snapshot: unknown) =>
        chat(
          new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              sessionId,
              transcript: snapshot,
              message: "How is school?",
            }),
          }),
        );
      assert.equal((await send(undefined)).status, 400);
      assert.equal(
        (await send({ ...transcript, ownerId: "other-learner" })).status,
        400,
      );
      assert.equal(
        (await send({ ...transcript, sessionId: "different-session" })).status,
        400,
      );
      const reply = await send(transcript);
      assert.equal(reply.status, 200);
      const first = await reply.json();
      assert.equal(first.transcript.entries.length, 4);
      const next = await send(first.transcript);
      assert.equal(next.status, 200);
      assert.equal((await next.json()).transcript.entries.length, 6);
      assert.deepEqual((await (await getSessions()).json()).sessions, []);
      assert.equal((await get(sessionId)).status, 404);
      assert.equal((await end(sessionId)).status, 200);
      assert.equal(await readFile(blocked, "utf8"), "untouched");
    } finally {
      process.env.TRANSCRIPT_DIR = directory;
      if (previousMode === undefined) delete process.env.PRACTICE_STORAGE;
      else process.env.PRACTICE_STORAGE = previousMode;
      if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = previousProvider;
    }
  });
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.TRANSCRIPT_DIR;
  else process.env.TRANSCRIPT_DIR = previousDirectory;
});

function start(body: unknown) {
  return startSession(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}
function end(id: string) {
  return endSession(
    new Request(`http://localhost/api/sessions/${id}/end`, { method: "POST" }),
    { params: Promise.resolve({ sessionId: id }) },
  );
}
function get(id: string) {
  return getTranscript(new Request(`http://localhost/api/transcripts/${id}`), {
    params: Promise.resolve({ sessionId: id }),
  });
}

describe("explicit practice sessions", () => {
  it("requires authentication for creation, completion, listing, and reads", async (context) => {
    context.mock.method(auth, "getUser", async () => null);
    const beforeFiles = await readdir(directory);
    for (const response of [
      await start({ requestId: randomUUID() }),
      await end("unknown-session"),
      await get("unknown-session"),
      await getSessions(),
    ]) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(await readdir(directory), beforeFiles);
  });

  it("validates the form without creating any transcripts", async (context) => {
    context.mock.method(auth, "getUser", async () => ({
      id: "validation-learner",
    }));
    const beforeFiles = await readdir(directory);
    for (const body of [
      null,
      [],
      {},
      { requestId: "invalid" },
      { requestId: randomUUID(), name: 42 },
      { requestId: randomUUID(), name: "x".repeat(101) },
    ])
      assert.equal((await start(body)).status, 400);
    const malformed = await startSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: "{",
      }),
    );
    assert.equal(malformed.status, 400);
    assert.deepEqual(await readdir(directory), beforeFiles);
  });

  it("creates an owned session once across concurrent retries, with a default or trimmed name", async (context) => {
    context.mock.method(auth, "getUser", async () => ({ id: "start-learner" }));
    const requestId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        start({
          requestId,
          name: "  Rapport practice  ",
          ownerId: "someone-else",
        }),
      ),
    );
    const ids = await Promise.all(
      responses.map(async (response) => {
        assert.equal(response.status, 201);
        assert.equal(response.headers.get("cache-control"), "no-store");
        return (await response.json()).sessionId;
      }),
    );
    assert.equal(new Set(ids).size, 1);
    assert.ok(isValidSessionId(ids[0]));
    const transcript = await readTranscript(ids[0]);
    assert.ok(isTranscript(transcript));
    assert.equal(transcript.ownerId, "start-learner");
    assert.equal(transcript.name, "Rapport practice");
    assert.equal(transcript.personaName, "Jacob");
    assert.equal(transcript.entries.length, 2);
    const next = await (
      await start({ requestId: randomUUID(), name: "   " })
    ).json();
    assert.notEqual(next.sessionId, ids[0]);
    assert.equal(
      (await readTranscript(next.sessionId))?.name,
      "Practice with Jacob",
    );
    const listing = await (await getSessions()).json();
    assert.equal(listing.sessions.length, 2);
    assert.ok(
      listing.sessions.some(
        (row: { name: string }) => row.name === "Rapport practice",
      ),
    );
  });

  it("does not create missing sessions by reading or sending chat", async (context) => {
    context.mock.method(auth, "getUser", async () => ({
      id: "missing-learner",
    }));
    assert.equal((await get("never-started-session")).status, 404);
    assert.equal(
      (
        await chat(
          new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              sessionId: "never-started-session",
              message: "Hello",
            }),
          }),
        )
      ).status,
      404,
    );
    assert.equal(await readTranscript("never-started-session"), null);
  });

  it("keeps owners isolated, including when they reuse the same start request key", async (context) => {
    const user = context.mock.method(auth, "getUser", async () => ({
      id: "owner-a",
    }));
    const requestId = randomUUID();
    const own = await (await start({ requestId })).json();
    const original = await readTranscript(own.sessionId);
    user.mock.mockImplementation(async () => ({ id: "owner-b" }));
    assert.equal((await get(own.sessionId)).status, 404);
    assert.equal((await end(own.sessionId)).status, 404);
    assert.equal(
      (
        await chat(
          new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
              sessionId: own.sessionId,
              message: "Unauthorized",
            }),
          }),
        )
      ).status,
      404,
    );
    assert.deepEqual((await (await getSessions()).json()).sessions, []);
    const other = await (await start({ requestId })).json();
    assert.notEqual(other.sessionId, own.sessionId);
    assert.deepEqual(await readTranscript(own.sessionId), original);
  });

  it("completes a session once, preserves downloads, and rejects further messages", async (context) => {
    const getUser = context.mock.method(auth, "getUser", async () => ({
      id: "end-learner",
    }));
    const { sessionId } = await (
      await start({ requestId: randomUUID(), name: "Completed practice" })
    ).json();
    const responses = await Promise.all([end(sessionId), end(sessionId)]);
    assert.ok(responses.every((response) => response.status === 200));
    const transcript = await readTranscript(sessionId);
    assert.ok(transcript?.endedAt);
    assert.equal(
      transcript.entries.filter(
        (entry) => entry.text === "Practice session ended.",
      ).length,
      1,
    );
    assert.equal(
      (
        await chat(
          new Request("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({ sessionId, message: "Late message" }),
          }),
        )
      ).status,
      409,
    );
    assert.deepEqual(await readTranscript(sessionId), transcript);
    const download = await getTranscript(
      new Request(
        `http://localhost/api/transcripts/${sessionId}?format=txt&download=1`,
      ),
      { params: Promise.resolve({ sessionId }) },
    );
    assert.equal(download.status, 200);
    const text = await download.text();
    assert.match(text, /Session name: Completed practice/);
    assert.match(text, /Ended:/);
    assert.match(text, /Jacob/);
    assert.equal(getUser.mock.callCount() > 0, true);
    const listed = (await (await getSessions()).json()).sessions;
    assert.equal(listed[0].endedAt, transcript.endedAt);
  });
});
