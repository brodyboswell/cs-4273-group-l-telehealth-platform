import type { Transcript } from "./types";
import type {
  ActivityAction,
  ActivitySnapshot,
  ActivityTurnEvent,
} from "@/lib/activities/types";

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

function isActivitySnapshot(value: unknown): value is ActivitySnapshot {
  return (
    isRecord(value) &&
    typeof value.activityId === "string" &&
    "state" in value
  );
}

function isActivityAction(value: unknown): value is ActivityAction {
  return (
    isRecord(value) &&
    typeof value.activityId === "string" &&
    value.activityId.length > 0 &&
    typeof value.tool === "string" &&
    value.tool.length > 0 &&
    isRecord(value.input)
  );
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
        entry.speaker === "system" ||
        entry.speaker === "activity") &&
      typeof entry.text === "string" &&
      isTimestamp(entry.timestamp) &&
      (entry.model === undefined || typeof entry.model === "string") &&
      (entry.latencyMs === undefined ||
        (typeof entry.latencyMs === "number" &&
          Number.isFinite(entry.latencyMs) &&
          entry.latencyMs >= 0)) &&
      (entry.activity === undefined ||
        entry.activity === null ||
        isActivitySnapshot(entry.activity)) &&
      (entry.actions === undefined ||
        (Array.isArray(entry.actions) && entry.actions.every(isActivityAction))) &&
      (entry.activityNotice === undefined ||
        isActivityAvailabilityNotice(entry.activityNotice)) &&
      (entry.activityEvent === undefined ||
        isActivityTurnEvent(entry.activityEvent)) &&
      (entry.activityTurnId === undefined ||
        (typeof entry.activityTurnId === "string" &&
          entry.activityTurnId.length > 0 &&
          entry.activityTurnId.length <= 120)),
  );
}

function isActivityTurnEvent(value: unknown): value is ActivityTurnEvent {
  return (
    isRecord(value) &&
    typeof value.activityId === "string" &&
    value.activityId.length > 0 &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    (value.actor === "learner" || value.actor === "platform") &&
    typeof value.type === "string" &&
    value.type.length > 0 &&
    typeof value.text === "string" &&
    isRecord(value.input)
  );
}

function isActivityAvailabilityNotice(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.activityId === "string" &&
    Array.isArray(value.toolNames) &&
    value.toolNames.every((name) => typeof name === "string")
  );
}
