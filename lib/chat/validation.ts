import type { Transcript } from "./types";

/** Shared browser/server input rules; keep this module free of server imports. */
export const MAX_MESSAGE_LENGTH = 2000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && SESSION_ID_PATTERN.test(id);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Reject corrupt logs rather than rewriting them or sending malformed data to a provider. */
export function isTranscript(value: unknown): value is Transcript {
  if (
    !isRecord(value) ||
    !isValidSessionId(value.sessionId) ||
    typeof value.personaId !== "string" ||
    typeof value.personaName !== "string" ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !Array.isArray(value.entries)
  )
    return false;
  return value.entries.every(
    (entry: unknown, index: number) =>
      isRecord(entry) &&
      entry.seq === index + 1 &&
      (entry.speaker === "learner" ||
        entry.speaker === "virtual_client" ||
        entry.speaker === "system") &&
      typeof entry.text === "string" &&
      isTimestamp(entry.timestamp) &&
      (entry.model === undefined || typeof entry.model === "string") &&
      (entry.latencyMs === undefined ||
        (typeof entry.latencyMs === "number" &&
          Number.isFinite(entry.latencyMs) &&
          entry.latencyMs >= 0)),
  );
}
