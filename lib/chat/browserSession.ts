import type { Transcript } from "./types";
import { isTranscript } from "./validation";

function storageKey(sessionId: string) {
  return `telehealth.practice.${sessionId}`;
}

export function saveBrowserSession(transcript: Transcript) {
  try {
    window.sessionStorage.setItem(
      storageKey(transcript.sessionId),
      JSON.stringify(transcript),
    );
  } catch {
    throw new Error(
      "Browser storage is unavailable. Allow storage for this site to use practice sessions.",
    );
  }
}

export function loadBrowserSession(
  sessionId: string,
  ownerId: string,
): Transcript | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    const transcript: unknown = raw ? JSON.parse(raw) : null;
    return isTranscript(transcript) &&
      transcript.sessionId === sessionId &&
      transcript.ownerId === ownerId
      ? transcript
      : null;
  } catch {
    return null;
  }
}

export function clearBrowserSession(sessionId: string) {
  window.sessionStorage.removeItem(storageKey(sessionId));
}
