/**
 * Transcript storage: one JSON file per practice session.
 *
 * Files live in TRANSCRIPT_DIR (default: ./data/transcripts, git-ignored). This is
 * fine for a local prototype and for researchers to collect files after a study
 * session. On serverless hosts (e.g. Vercel) the filesystem is not persistent —
 * swap this module for a database while keeping the same exported functions.
 */
// Server-only module: never import this from a "use client" component.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isValidSessionId, isTranscript } from "./validation";
import type { Persona } from "./persona";
import type { ChatTurn, Speaker, Transcript, TranscriptEntry } from "./types";

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
): Promise<Transcript> {
  const existing = await readTranscript(sessionId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const t: Transcript = {
    sessionId,
    personaId: persona.id,
    personaName: persona.name,
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
  await writeTranscript(t);
  return t;
}

function pushEntry(
  t: Transcript,
  speaker: Speaker,
  text: string,
  extra: Pick<TranscriptEntry, "latencyMs" | "model"> = {},
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
  extra: Pick<TranscriptEntry, "latencyMs" | "model"> = {},
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
    const role = e.speaker === "learner" ? "user" : "assistant";
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

export async function listTranscripts(): Promise<
  Array<
    Pick<
      Transcript,
      "sessionId" | "personaName" | "createdAt" | "updatedAt"
    > & { entryCount: number }
  >
> {
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
      "sessionId" | "personaName" | "createdAt" | "updatedAt"
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
      if (transcript)
        rows.push({
          sessionId: transcript.sessionId,
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
};

/** Human-readable plain-text transcript, e.g. for instructors or qualitative coding. */
export function formatTranscriptText(t: Transcript): string {
  const header = [
    `Telehealth practice session transcript`,
    `Session ID: ${t.sessionId}`,
    `Virtual client: ${t.personaName} (${t.personaId})`,
    `Started: ${t.createdAt}`,
    `Last updated: ${t.updatedAt}`,
    `Entries: ${t.entries.length}`,
    "".padEnd(60, "-"),
  ];
  const lines = t.entries.map(
    (e) =>
      `[${e.timestamp}] #${e.seq} ${SPEAKER_LABEL[e.speaker](t)}: ${e.text}`,
  );
  return [...header, ...lines, ""].join("\n");
}
