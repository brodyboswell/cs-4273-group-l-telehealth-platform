"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRecord,
  isTranscript,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat/validation";
import type {
  ChatRequestBody,
  Transcript,
  TranscriptEntry,
} from "@/lib/chat/types";
import {
  loadBrowserSession,
  saveBrowserSession,
} from "@/lib/chat/browserSession";
import { waitForMinimumThinkTime } from "@/lib/chat/thinkDelay";
import {
  useActivityBridge,
  type ActivityTurnDispatchRequest,
} from "@/components/session/ActivityBridge";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatPanel({
  compact = false,
  sessionId,
  userId,
  browserSession = false,
}: {
  compact?: boolean;
  sessionId: string;
  userId: string;
  browserSession?: boolean;
}) {
  const activityBridge = useActivityBridge();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [clientName, setClientName] = useState("Jacob");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  const loadingRef = useRef(loading);
  sessionIdRef.current = sessionId;
  loadingRef.current = loading;

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRequest = useRef<AbortController | null>(null);
  const activeSession = useRef<string | null>(null);
  const sendInFlight = useRef(false);
  const transcriptRef = useRef<Transcript | null>(null);

  const acceptTranscript = useCallback(
    (transcript: Transcript) => {
      if (browserSession) saveBrowserSession(transcript);
      transcriptRef.current = transcript;
      setEntries(transcript.entries);
      setClientName(transcript.personaName);
    },
    [browserSession],
  );

  const loadTranscript = useCallback(
    async (id: string): Promise<Transcript | null> => {
      transcriptRequest.current?.abort();
      const controller = new AbortController();
      transcriptRequest.current = controller;
      activeSession.current = id;

      setLoading(true);
      setError(null);

      try {
        if (browserSession) {
          const saved = loadBrowserSession(id, userId);
          if (!saved || saved.endedAt)
            throw new Error(
              "This session is unavailable in this tab. Start a new practice session.",
            );
          acceptTranscript(saved);
          return saved;
        }
        const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const data: unknown = await res.json();

        if (!res.ok)
          throw new Error(
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Could not load the session.",
          );

        if (!isTranscript(data) || data.sessionId !== id)
          throw new Error("The session returned an invalid transcript.");

        if (controller.signal.aborted) return null;
        acceptTranscript(data);
        return data;
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Could not load the session.",
          );
        return null;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [browserSession, userId, acceptTranscript],
  );

  useEffect(() => {
    void loadTranscript(sessionId);

    return () => {
      activeSession.current = null;
      transcriptRequest.current?.abort();
    };
  }, [loadTranscript, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || !sessionId || loading || sendInFlight.current) return;

    const activityCapture = activityBridge.capture();
    const activity = activityCapture.snapshot;
    sendInFlight.current = true;
    const lastSeq = entries.at(-1)?.seq ?? 0;

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
        body: JSON.stringify({
          sessionId,
          ...(browserSession
            ? { transcript: transcriptRef.current ?? undefined }
            : {}),
          message: text,
          ...(activity ? { activity } : {}),
        } satisfies ChatRequestBody),
      });

      const data: unknown = await res.json().catch(() => null);

      if (activeSession.current !== sessionId) return;

      if (!res.ok) {
        if (browserSession && isRecord(data) && isTranscript(data.transcript))
          acceptTranscript(data.transcript);
        // The server keeps the learner message in the transcript even on failure.
        await loadTranscript(sessionId);
        if (activeSession.current === sessionId)
          setError(
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "The virtual client could not respond. Try again.",
          );
        return;
      }

      if (
        !isRecord(data) ||
        !isTranscript(data.transcript) ||
        data.transcript.sessionId !== sessionId
      )
        throw new Error("Invalid chat response");

      acceptTranscript(data.transcript);
      const rejectedActivityAction = data.transcript.entries.some(
        (entry) =>
          entry.seq > lastSeq &&
          entry.speaker === "system" &&
          entry.text.startsWith("Rejected activity tool call"),
      );
      if (rejectedActivityAction)
        setError(
          "The client couldn't complete the activity action. Ask them to try again.",
        );

      const actions = data.transcript.entries
        .filter(
          (entry) => entry.seq > lastSeq && entry.speaker === "virtual_client",
        )
        .flatMap((entry) => entry.actions ?? []);
      activityCapture.dispatch(actions);
    } catch {
      if (activeSession.current !== sessionId) return;

      // A lost response does not mean the server failed to record the message.
      const transcript = await loadTranscript(sessionId);

      if (activeSession.current !== sessionId) return;

      const recorded = transcript?.entries.some(
        (entry) =>
          entry.seq > lastSeq &&
          entry.speaker === "learner" &&
          entry.text === text,
      );

      if (transcript && !recorded) setDraft((current) => current || text);

      setError(
        browserSession
          ? "Could not get a reply. Please try again."
          : recorded
          ? "Your message was recorded, but the reply could not be confirmed."
          : "Could not confirm whether your message was sent. Check the transcript before trying again.",
      );
    } finally {
      sendInFlight.current = false;

      if (activeSession.current === sessionId) {
        setSending(false);
        inputRef.current?.focus();
      }
    }
  }

  const requestActivityTurn = useCallback(
    async (request: ActivityTurnDispatchRequest) => {
      if (sendInFlight.current)
        throw new Error("The chat is busy; retry the chess move in a moment.");

      sendInFlight.current = true;
      setSending(true);
      let id: string | null = null;
      let reconciledTranscript: Transcript | null = null;
      const startedAt = performance.now();
      setError(null);

      try {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          id = sessionIdRef.current;
          if (id && !loadingRef.current) break;
          await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
        id = sessionIdRef.current;
        if (!id || loadingRef.current)
          throw new Error(
            "The session chat did not finish loading. Retry the chess move.",
          );

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: id,
            ...(browserSession
              ? { transcript: transcriptRef.current ?? undefined }
              : {}),
            activityTurn: {
              activity: request.snapshot,
              requestId: request.requestId,
              event: request.event,
            },
          } satisfies ChatRequestBody),
        });
        const data: unknown = await res.json().catch(() => null);
        if (activeSession.current !== id) return;

        if (
          res.ok &&
          isRecord(data) &&
          isTranscript(data.transcript) &&
          data.transcript.sessionId === id &&
          isRecord(data.reply) &&
          data.reply.speaker === "virtual_client" &&
          data.reply.activityTurnId === request.requestId
        ) {
          acceptTranscript(data.transcript);
          const replySequence = (data.reply as Record<string, unknown>).seq;
          const savedReply = data.transcript.entries.find(
            (entry) =>
              entry.speaker === "virtual_client" &&
              entry.seq === replySequence &&
              entry.activityTurnId === request.requestId,
          );
          if (!savedReply?.actions?.length)
            throw new Error(
              "The session returned an invalid chess turn reply.",
            );
          await waitForMinimumThinkTime(startedAt);
          request.dispatch(savedReply.actions ?? []);
          return;
        }

        if (browserSession && isRecord(data) && isTranscript(data.transcript))
          acceptTranscript(data.transcript);
        reconciledTranscript = await loadTranscript(id);
        const savedReply = reconciledTranscript?.entries.find(
          (entry) =>
            entry.speaker === "virtual_client" &&
            entry.activityTurnId === request.requestId &&
            (entry.actions?.length ?? 0) > 0,
        );
        if (savedReply) {
          await waitForMinimumThinkTime(startedAt);
          request.dispatch(savedReply.actions ?? []);
          return;
        }

        const errorMessage =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "The virtual client could not choose a chess move.";
        setError(errorMessage);
        throw new Error(errorMessage);
      } catch (requestError) {
        if (id && activeSession.current === id) {
          if (!reconciledTranscript)
            reconciledTranscript = await loadTranscript(id);
          const savedReply = reconciledTranscript?.entries.find(
            (entry) =>
              entry.speaker === "virtual_client" &&
              entry.activityTurnId === request.requestId &&
              (entry.actions?.length ?? 0) > 0,
          );
          if (savedReply) {
            await waitForMinimumThinkTime(startedAt);
            request.dispatch(savedReply.actions ?? []);
            return;
          }
        }
        throw requestError;
      } finally {
        sendInFlight.current = false;
        setSending(false);
      }
    },
    [loadTranscript, browserSession, acceptTranscript],
  );

  useEffect(
    () => activityBridge.registerTurnRequester(requestActivityTurn),
    [activityBridge, requestActivityTurn],
  );

  const visible = entries.filter(
    (entry) =>
      entry.speaker !== "system" &&
      (entry.speaker === "learner" || entry.text.trim().length > 0),
  );

  return (
    <div className="session-chat-panel flex h-full flex-col bg-cream">
      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-charcoal/10 bg-white py-3 ${compact ? "px-4" : "flex-wrap px-6"}`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal">
            Session with {clientName}
          </p>
          <p
            className="truncate text-xs text-charcoal/50"
            title={sessionId ?? undefined}
          >
            Saved session logs are coming soon
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto py-5 ${compact ? "px-4" : "px-6"}`}
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {loading && visible.length === 0 && (
            <p className="text-center text-sm text-charcoal/50">
              Connecting to the session…
            </p>
          )}

          {visible.map((e, i) => {
            const mine = e.speaker === "learner";
            const activityEvent = e.speaker === "activity";

            return (
              <div
                key={`${e.seq}-${i}`}
                className={`flex flex-col ${activityEvent ? "items-center" : mine ? "items-end" : "items-start"}`}
              >
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    activityEvent
                      ? "max-w-full rounded-panel border border-sage/30 bg-sage/10 text-center text-charcoal"
                      : mine
                        ? "rounded-br-sm bg-sage text-white"
                        : "rounded-bl-sm border border-charcoal/10 bg-white text-charcoal"
                  } ${compact ? "max-w-[92%]" : "max-w-[80%]"}`}
                >
                  {activityEvent && (
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-charcoal/50">
                      Chess activity
                    </span>
                  )}
                  {e.text}
                </div>

                <span className="mt-1 px-1 text-[11px] text-charcoal/45">
                  {activityEvent ? "Activity" : mine ? "You" : clientName} ·{" "}
                  {formatTime(e.timestamp)}
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

      <div
        className={`shrink-0 border-t border-charcoal/10 bg-white py-3 ${compact ? "px-4" : "px-6"}`}
      >
        <div className="mx-auto max-w-2xl">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-panel bg-terracotta/10 px-3 py-2 text-sm text-terracotta"
            >
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
                if (
                  ev.key === "Enter" &&
                  !ev.shiftKey &&
                  !ev.nativeEvent.isComposing
                ) {
                  ev.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Message ${clientName}…`}
              aria-label={`Message ${clientName}`}
              disabled={!sessionId || loading}
              className="min-h-[44px] flex-1 resize-none rounded-panel border border-charcoal/20 px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-1 focus:ring-sage disabled:bg-cream"
            />

            <button
              type="submit"
              disabled={!draft.trim() || loading || sending || !sessionId}
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
