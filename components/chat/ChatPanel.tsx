"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponseBody, Transcript, TranscriptEntry } from "@/lib/chat/types";

const SESSION_STORAGE_KEY = "telehealth.practiceSessionId";
const MAX_MESSAGE_LENGTH = 2000;

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps the same session while the learner moves between activities in one tab. */
function loadSessionId(): string {
  try {
    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const created = newSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return newSessionId();
  }
}

function saveSessionId(id: string) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // Storage can be blocked (private mode); the session still works for this page view.
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [clientName, setClientName] = useState("Alex");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadTranscript = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load the session.");
      const t = data as Transcript;
      setEntries(t.entries);
      setClientName(t.personaName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = loadSessionId();
    setSessionId(id);
    void loadTranscript(id);
  }, [loadTranscript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || !sessionId || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    // Show the learner's message right away; the server response replaces it.
    const optimistic: TranscriptEntry = {
      seq: -1,
      speaker: "learner",
      text,
      timestamp: new Date().toISOString(),
    };
    setEntries((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The server keeps the learner message in the transcript even on failure.
        await loadTranscript(sessionId);
        setError(data?.error ?? "The virtual client could not respond. Try again.");
        return;
      }
      setEntries((data as ChatResponseBody).transcript.entries);
    } catch {
      setEntries((prev) => prev.filter((e) => e !== optimistic));
      setDraft(text);
      setError("Network error — your message was not sent.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function startNewSession() {
    const id = newSessionId();
    saveSessionId(id);
    setSessionId(id);
    setEntries([]);
    void loadTranscript(id);
  }

  const visible = entries.filter((e) => e.speaker !== "system");
  const transcriptUrl = sessionId ? `/api/transcripts/${encodeURIComponent(sessionId)}` : "#";

  return (
    <div className="flex h-full flex-col bg-cream">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-charcoal/10 bg-white px-6 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal">Session with {clientName}</p>
          <p className="truncate text-xs text-charcoal/50" title={sessionId ?? undefined}>
            Every message is recorded in the session transcript
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a
            href={`${transcriptUrl}?format=txt&download=1`}
            className="rounded-panel border border-charcoal/20 px-3 py-1.5 text-charcoal hover:bg-cream"
          >
            Transcript (.txt)
          </a>
          <a
            href={`${transcriptUrl}?download=1`}
            className="rounded-panel border border-charcoal/20 px-3 py-1.5 text-charcoal hover:bg-cream"
          >
            JSON
          </a>
          <button
            type="button"
            onClick={startNewSession}
            disabled={sending}
            className="rounded-panel px-3 py-1.5 text-charcoal/70 hover:bg-cream disabled:opacity-40"
          >
            New session
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5" aria-live="polite">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {loading && visible.length === 0 && (
            <p className="text-center text-sm text-charcoal/50">Connecting to the session…</p>
          )}
          {visible.map((e, i) => {
            const mine = e.speaker === "learner";
            return (
              <div key={`${e.seq}-${i}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    mine
                      ? "rounded-br-sm bg-sage text-white"
                      : "rounded-bl-sm border border-charcoal/10 bg-white text-charcoal"
                  }`}
                >
                  {e.text}
                </div>
                <span className="mt-1 px-1 text-[11px] text-charcoal/45">
                  {mine ? "You" : clientName} · {formatTime(e.timestamp)}
                </span>
              </div>
            );
          })}
          {sending && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-bl-sm border border-charcoal/10 bg-white px-4 py-2 text-sm italic text-charcoal/50">
                {clientName} is typing…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-charcoal/10 bg-white px-6 py-3">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p role="alert" className="mb-2 rounded-panel bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
              {error}
            </p>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                  ev.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Message ${clientName}… (Enter to send, Shift+Enter for a new line)`}
              aria-label={`Message ${clientName}`}
              disabled={!sessionId || loading}
              className="min-h-[44px] flex-1 resize-none rounded-panel border border-charcoal/20 px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-1 focus:ring-sage disabled:bg-cream"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending || !sessionId}
              className="h-[44px] rounded-panel bg-charcoal px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
