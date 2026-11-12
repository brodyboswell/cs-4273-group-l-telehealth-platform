"use client";

/**
 * Realtime voice session with the virtual client, over LiveKit.
 *
 * Audio only (no video): the browser publishes the learner's microphone and
 * plays back the agent's spoken reply. Live captions come from the text
 * streams LiveKit Agents forwards on the "lk.transcription" topic — one
 * stream per spoken segment, updated as interim text arrives and finalized
 * once the turn is done. See voice-agent/agent.py for the server side,
 * which also appends every finished turn to the same transcript file
 * app/api/chat and ChatPanel use, so switching between text and voice mode
 * keeps one continuous session log.
 *
 * It also shares the on-screen activity with the agent: while a call is live,
 * the current ActivityBridge snapshot is sent on the "telehealth.activity"
 * topic whenever it changes (and again when the agent joins), so Jacob knows
 * what the learner is looking at and can react to feelings-chart selections.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TextStreamReader,
} from "livekit-client";
import { loadSessionId } from "@/lib/chat/clientSession";
import { useActivityBridge } from "@/components/session/ActivityBridge";

const TOPIC_TRANSCRIPTION = "lk.transcription";
const ATTR_SEGMENT_ID = "lk.segment_id";
const ATTR_FINAL = "lk.transcription_final";
// Must match ACTIVITY_TOPIC in voice-agent/agent.py.
const ACTIVITY_TOPIC = "telehealth.activity";
// How often to check the ActivityBridge for changes during a call. The bridge
// is read on demand (capture()), so polling avoids changing that shared
// interface that every activity component uses.
const ACTIVITY_POLL_MS = 500;

type CallStatus = "idle" | "connecting" | "connected" | "error";

interface CaptionLine {
  segmentId: string;
  speaker: "learner" | "virtual_client";
  text: string;
  final: boolean;
}

export function VoicePanel({
  personaName = "the virtual client",
  onEnded,
}: {
  personaName?: string;
  onEnded?: () => void;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const localIdentityRef = useRef<string | null>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  const activityBridge = useActivityBridge();
  const lastSentActivityRef = useRef<string | null>(null);

  useEffect(() => {
    captionsRef.current?.scrollTo({
      top: captionsRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [captions]);

  const shareActivity = useCallback(
    async (force = false) => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) return;
      const message = JSON.stringify({
        activity: activityBridge.capture().snapshot,
      });
      if (!force && message === lastSentActivityRef.current) return;
      lastSentActivityRef.current = message;
      try {
        await room.localParticipant.sendText(message, {
          topic: ACTIVITY_TOPIC,
        });
      } catch {
        // Retry on the next poll rather than interrupting the call.
        lastSentActivityRef.current = null;
      }
    },
    [activityBridge],
  );

  useEffect(() => {
    if (status !== "connected") return;
    void shareActivity(true);
    const timer = window.setInterval(() => {
      void shareActivity();
    }, ACTIVITY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [shareActivity, status]);

  const cleanup = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.unregisterTextStreamHandler(TOPIC_TRANSCRIPTION);
      room.disconnect();
    }
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = "";
  }, []);

  useEffect(() => cleanup, [cleanup]);

  async function start() {
    setStatus("connecting");
    setErrorMessage(null);
    setCaptions([]);

    try {
      const sessionId = loadSessionId();
      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error ?? "Could not start the voice session.",
        );
      }

      localIdentityRef.current = data.identity as string;
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          audioContainerRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        void shareActivity(true);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const el of track.detach()) el.remove();
      });
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setStatus((current) => (current === "error" ? current : "idle"));
        onEnded?.();
      });

      room.registerTextStreamHandler(
        TOPIC_TRANSCRIPTION,
        async (reader: TextStreamReader, participantInfo: { identity: string }) => {
          const senderIdentity = participantInfo.identity;
          const text = await reader.readAll();
          const attrs = reader.info.attributes ?? {};
          const segmentId = attrs[ATTR_SEGMENT_ID] ?? reader.info.id;
          const final = attrs[ATTR_FINAL] === "true";
          const speaker: CaptionLine["speaker"] =
            senderIdentity && senderIdentity === localIdentityRef.current
              ? "learner"
              : "virtual_client";

          setCaptions((prev) => {
            const idx = prev.findIndex((c) => c.segmentId === segmentId);
            const line: CaptionLine = { segmentId, speaker, text, final };
            if (idx === -1) return [...prev, line];
            const next = [...prev];
            next[idx] = line;
            return next;
          });
        },
      );

      await room.connect(data.url as string, data.token as string);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not start the voice session.",
      );
      cleanup();
    }
  }

  function stop() {
    cleanup();
    setStatus("idle");
    onEnded?.();
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  return (
    <div className="flex h-full flex-col bg-cream">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-charcoal/10 bg-white px-6 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal">
            Voice session with {personaName}
          </p>
          <p className="truncate text-xs text-charcoal/50">
            {status === "connected"
              ? "Live — speak naturally, replies are also recorded as text."
              : status === "connecting"
                ? "Connecting…"
                : status === "error"
                  ? "Could not connect."
                  : "Not connected."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {status === "connected" && (
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-panel border border-charcoal/20 px-3 py-1.5 text-charcoal hover:bg-cream"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          {status === "connected" || status === "connecting" ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-panel bg-charcoal px-3 py-1.5 text-white hover:opacity-90"
            >
              End voice session
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="rounded-panel bg-charcoal px-3 py-1.5 text-white hover:opacity-90"
            >
              Start voice session
            </button>
          )}
        </div>
      </div>

      <div
        ref={captionsRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-panel bg-terracotta/10 px-3 py-2 text-sm text-terracotta"
            >
              {errorMessage}
            </p>
          )}
          {status === "idle" && !errorMessage && (
            <p className="text-center text-sm text-charcoal/50">
              Press &ldquo;Start voice session&rdquo; and allow microphone
              access to talk with {personaName}.
            </p>
          )}
          {captions.map((line) => (
            <div
              key={line.segmentId}
              className={`flex flex-col ${line.speaker === "learner" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  line.speaker === "learner"
                    ? "rounded-br-sm bg-sage text-white"
                    : "rounded-bl-sm border border-charcoal/10 bg-white text-charcoal"
                } ${line.final ? "" : "opacity-60"}`}
              >
                {line.text || "…"}
              </div>
              <span className="mt-1 px-1 text-[11px] text-charcoal/45">
                {line.speaker === "learner" ? "You" : personaName}
                {!line.final && " · listening…"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Audio elements for subscribed remote tracks; captions are shown above instead. */}
      <div ref={audioContainerRef} className="hidden" aria-hidden />
    </div>
  );
}
