"use client";

/**
 * Shared client-side session identity, used by both the text chat
 * (ChatPanel) and the realtime voice session (VoicePanel) so switching
 * between them keeps the same transcript/session.
 */
import { isValidSessionId } from "./validation";

export const SESSION_STORAGE_KEY = "telehealth.practiceSessionId";

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps the same session while the learner moves between activities in one tab. */
export function loadSessionId(): string {
  try {
    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (isValidSessionId(saved)) return saved;

    const created = newSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return newSessionId();
  }
}

export function saveSessionId(id: string) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // Storage can be blocked (private mode); the session still works for this page view.
  }
}
