/**
 * Transcript storage: one JSON file per practice session.
 *
 * Local file mode uses TRANSCRIPT_DIR (default: ./data/transcripts, git-ignored).
 * Hosted browser mode builds and appends temporary snapshots without filesystem
 * access. Browser history is not an authoritative audit log. Database persistence
 * and the session-log UI remain future work.
 */
// Server-only module: never import this from a "use client" component.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { isValidSessionId, isTranscript } from "./validation";
import { DEFAULT_PERSONA, type Persona } from "./persona";
import { buildClientPersona } from "./clientPersona";
import type { VirtualClient } from "./clientProfile";
import type { ChatTurn, Speaker, Transcript, TranscriptEntry } from "./types";
import { usesBrowserSessions } from "./storageMode";

export class TranscriptAccessError extends Error {}
export class SessionEndedError extends Error {}

/** A retry of the same start request must not create a second transcript. */
export async function createPracticeSession(
  ownerId: string,
  name: string,
  requestId: string,
  client?: VirtualClient,
): Promise<Transcript> {
  const sessionId = `s-${createHash("sha256")
    .update(ownerId)
    .update("\0")
    .update(requestId)
    .digest("hex")
    .slice(0, 40)}`;
  const persona = client ? buildClientPersona(client) : DEFAULT_PERSONA;
  const sessionName = name || `Practice with ${persona.name}`;
  if (usesBrowserSessions())
    return buildTranscript(sessionId, persona, ownerId, sessionName, client);
  return withSessionLock(sessionId, async () => {
    const existing = await readTranscript(sessionId);
    if (existing) {
      if (existing.ownerId !== ownerId)
        throw new TranscriptAccessError("Transcript not found.");
      return existing;
    }
    return getOrCreateTranscript(
      sessionId,
      persona,
      ownerId,
      sessionName,
      client,
    );
  });
}

export async function getOwnedTranscript(
  sessionId: string,
  ownerId: string,
): Promise<Transcript> {
  const transcript = await readTranscript(sessionId);
  if (!transcript || transcript.ownerId !== ownerId)
    throw new TranscriptAccessError("Transcript not found.");
  return transcript;
}

export async function endPracticeSession(
  sessionId: string,
  ownerId: string,
): Promise<Transcript> {
  return withSessionLock(sessionId, async () => {
    const transcript = await getOwnedTranscript(sessionId, ownerId);
    if (!transcript.endedAt) {
      transcript.endedAt = new Date().toISOString();
      await appendEntry(transcript, "system", "Practice session ended.");
    }
    return transcript;
  });
}

function transcriptDir(): string {
  return path.resolve(
    process.env.TRANSCRIPT_DIR ||
      path.join(process.cwd(), "data", "transcripts"),
  );
}

function fileFor(sessionId: string): string {
  // The strict ID pattern is what prevents path traversal ("../") here.
  if (!isValidSessionId(sessionId)) throw new Error("Invalid session id");
  return path.join(transcriptDir(), `${sessionId}.json`);
}

export async function readTranscript(
  sessionId: string,
): Promise<Transcript | null> {
  if (usesBrowserSessions()) return null;
  try {
    const data: unknown = JSON.parse(
      await fs.readFile(fileFor(sessionId), "utf8"),
    );
    if (!isTranscript(data) || data.sessionId !== sessionId)
      throw new Error("Invalid transcript data");
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeTranscript(t: Transcript): Promise<void> {
  if (usesBrowserSessions()) return;
  const file = fileFor(t.sessionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a half-written transcript.
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(t, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Serialises work per session so two quick messages can't interleave and
 * scramble the order of entries (the transcript must be strictly ordered).
 */
const locks = new Map<string, Promise<unknown>>();
export function withSessionLock<T>(
  sessionId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  const settled = next.catch(() => undefined);
  locks.set(sessionId, settled);
  settled.then(() => {
    if (locks.get(sessionId) === settled) locks.delete(sessionId);
  });
  return next;
}

/** Returns the session's transcript, creating it (with the client's opening line) if new. */
export async function getOrCreateTranscript(
  sessionId: string,
  persona: Persona,
  ownerId?: string,
  name?: string,
  client?: VirtualClient,
): Promise<Transcript> {
  const existing = await readTranscript(sessionId);
  if (existing) {
    // Legacy transcripts are never automatically claimed by a new login.
    if (ownerId !== undefined && existing.ownerId !== ownerId)
      throw new TranscriptAccessError("Transcript not found.");
    return existing;
  }
  const t = buildTranscript(sessionId, persona, ownerId, name, client);
  await writeTranscript(t);
  return t;
}

function buildTranscript(
  sessionId: string,
  persona: Persona,
  ownerId?: string,
  name?: string,
  client?: VirtualClient,
): Transcript {
  const now = new Date().toISOString();
  const t: Transcript = {
    sessionId,
    ...(name !== undefined ? { name } : {}),
    ...(ownerId !== undefined ? { ownerId } : {}),
    personaId: persona.id,
    personaName: persona.name,
    ...(client ? { client } : {}),
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
  pushEntry(
    t,
    "system",
    `Session started with virtual client ${persona.name} (${persona.id}).`,
  );
  pushEntry(t, "virtual_client", persona.openingLine, {
    model: "scripted:opening-line",
  });
  return t;
}

function pushEntry(
  t: Transcript,
  speaker: Speaker,
  text: string,
  extra: Pick<
    TranscriptEntry,
    | "latencyMs"
    | "model"
    | "activity"
    | "actions"
    | "activityNotice"
    | "activityEvent"
    | "activityTurnId"
  > = {},
): TranscriptEntry {
  const entry: TranscriptEntry = {
    seq: t.entries.length + 1,
    speaker,
    text,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  t.entries.push(entry);
  t.updatedAt = entry.timestamp;
  return entry;
}

export async function appendEntry(
  t: Transcript,
  speaker: Speaker,
  text: string,
  extra: Pick<
    TranscriptEntry,
    | "latencyMs"
    | "model"
    | "activity"
    | "actions"
    | "activityNotice"
    | "activityEvent"
    | "activityTurnId"
  > = {},
): Promise<TranscriptEntry> {
  const entry = pushEntry(t, speaker, text, extra);
  await writeTranscript(t);
  return entry;
}

/**
 * Converts the transcript into LLM history. System entries are skipped, and
 * consecutive turns from the same side are merged (e.g. after a failed reply),
 * because providers expect user/assistant turns to alternate.
 * The scripted opening line is kept so the model knows what "it" already said;
 * a leading assistant turn is prefixed with a neutral user turn for providers
 * that require the conversation to start with the user.
 */
export function toChatHistory(t: Transcript): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const e of t.entries) {
    if (e.speaker === "system") continue;
    const role =
      e.speaker === "learner" || e.speaker === "activity"
        ? "user"
        : "assistant";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${e.text}`;
    else turns.push({ role, content: e.text });
  }
  if (turns[0]?.role === "assistant") {
    turns.unshift({
      role: "user",
      content: "(The telehealth video session has just connected.)",
    });
  }
  return turns;
}

export async function listTranscripts(
  ownerId?: string,
): Promise<
  Array<
    Pick<
      Transcript,
      | "sessionId"
      | "name"
      | "endedAt"
      | "personaName"
      | "createdAt"
      | "updatedAt"
    > & { entryCount: number }
  >
> {
  if (usesBrowserSessions()) return [];
  let files: string[];
  try {
    files = await fs.readdir(transcriptDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const candidates = files.filter(
    (file) => file.endsWith(".json") && isValidSessionId(file.slice(0, -5)),
  );
  const rows: Array<
    Pick<
      Transcript,
      | "sessionId"
      | "name"
      | "endedAt"
      | "personaName"
      | "createdAt"
      | "updatedAt"
    > & { entryCount: number }
  > = [];
  // Bound file reads so a large archive cannot exhaust the process's file handles.
  for (let offset = 0; offset < candidates.length; offset += 32) {
    const batch = await Promise.all(
      candidates
        .slice(offset, offset + 32)
        .map((file) => readTranscript(file.slice(0, -5))),
    );
    for (const transcript of batch) {
      if (
        transcript &&
        (ownerId === undefined || transcript.ownerId === ownerId)
      )
        rows.push({
          sessionId: transcript.sessionId,
          name: transcript.name,
          endedAt: transcript.endedAt,
          personaName: transcript.personaName,
          createdAt: transcript.createdAt,
          updatedAt: transcript.updatedAt,
          entryCount: transcript.entries.length,
        });
    }
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const SPEAKER_LABEL: Record<Speaker, (t: Transcript) => string> = {
  learner: () => "Learner",
  virtual_client: (t) => `${t.personaName} (virtual client)`,
  system: () => "System",
  activity: () => "Activity event",
};

/** Human-readable plain-text transcript, e.g. for instructors or qualitative coding. */
export function formatTranscriptText(t: Transcript): string {
  const header = [
    `Telehealth practice session transcript`,
    `Session ID: ${t.sessionId}`,
    ...(t.name ? [`Session name: ${t.name}`] : []),
    `Virtual client: ${t.personaName} (${t.personaId})`,
    ...(t.client
      ? [
          `Client profile: ${t.client.gender}, age ${t.client.age}`,
          `Client scenario: ${t.client.scenario}`,
        ]
      : []),
    `Started: ${t.createdAt}`,
    `Last updated: ${t.updatedAt}`,
    ...(t.endedAt ? [`Ended: ${t.endedAt}`] : []),
    `Entries: ${t.entries.length}`,
    "".padEnd(60, "-"),
  ];
  const lines = t.entries.flatMap((e) => [
    `[${e.timestamp}] #${e.seq} ${SPEAKER_LABEL[e.speaker](t)}: ${e.text}`,
    ...(e.activity
      ? [
          `  Activity context (${e.activity.activityId}): ${JSON.stringify(e.activity.state)}`,
        ]
      : []),
    ...(e.actions ?? []).map(
      (action) =>
        `  Activity action (${action.activityId}.${action.tool}): ${JSON.stringify(action.input)}`,
    ),
    ...(e.activityNotice
      ? [`  Available tools: ${e.activityNotice.toolNames.join(", ")}`]
      : []),
    ...(e.activityEvent
      ? [
          `  Activity event (${e.activityEvent.activityId}.${e.activityEvent.type}): ${JSON.stringify(e.activityEvent.input)}`,
        ]
      : []),
  ]);
  return [...header, ...lines, ""].join("\n");
}
