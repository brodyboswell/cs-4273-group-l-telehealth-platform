"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { usePracticeSession } from "./PracticeSession";
import {
  clearBrowserSession,
  loadBrowserSession,
} from "@/lib/chat/browserSession";
import { isRecord } from "@/lib/chat/validation";
import type { GradeReport } from "@/lib/grading/types";
import {
  isGradeReport,
  SessionFeedback,
  type FeedbackPhase,
} from "./SessionFeedback";

function ToolbarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  const pathname = usePathname();
  const isCurrentPage = pathname === href;

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={isCurrentPage ? "page" : undefined}
      title={label}
      className={`flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70 ${isCurrentPage ? "font-semibold" : ""}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function ToolbarItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function Divider() {
  return (
    <div className="mx-1 h-6 w-px shrink-0 bg-charcoal/15" aria-hidden="true" />
  );
}

function ClientControlToggle() {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70">
      <Icon name="person" />
      <span className="hidden sm:inline">Client control</span>
      <span className="relative inline-block h-5 w-9 shrink-0">
        <input
          type="checkbox"
          defaultChecked
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label="Client control"
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-charcoal/25 transition-colors peer-checked:bg-sage peer-focus-visible:ring-2 peer-focus-visible:ring-sage peer-focus-visible:ring-offset-1"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

export function SessionToolbar() {
  const router = useRouter();
  const { sessionId, practicePath, browserSession, userId } =
    usePracticeSession();

  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackPhase, setFeedbackPhase] = useState<FeedbackPhase | null>(
    null,
  );
  const [report, setReport] = useState<GradeReport | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  /** Asks for feedback before the session ends, because ending clears a hosted session. */
  async function requestFeedback() {
    setFeedbackPhase("grading");
    setFeedbackMessage(null);
    try {
      let body: string | undefined;
      if (browserSession) {
        const transcript = loadBrowserSession(sessionId, userId);
        // Nothing to grade; end the session without feedback.
        if (!transcript) {
          setFeedbackPhase(null);
          await handleEndSession();
          return;
        }
        body = JSON.stringify({ transcript });
      }
      const response = await fetch(`/api/sessions/${sessionId}/grade`, {
        method: "POST",
        ...(body ? { body } : {}),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(data) || !isGradeReport(data.report))
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "We couldn’t generate feedback for this session.",
        );
      setReport(data.report);
      setFeedbackPhase("feedback");
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "We couldn’t generate feedback for this session.",
      );
      setFeedbackPhase("failed");
    }
  }

  async function handleEndSession() {
    if (ending) return;
    setEnding(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/end`, {
        method: "POST",
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Could not end your session. Please try again.",
        );
      if (browserSession) clearBrowserSession(sessionId);
      router.replace("/sessions/new");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not end your session. Please try again.";
      setError(message);
      setFeedbackMessage(message);
      setEnding(false);
    }
  }

  return (
    <>
      <footer className="flex h-16 shrink-0 justify-between gap-4 items-center overflow-hidden border-t border-charcoal/15 bg-white px-4">
        <div className="flex min-w-0 items-center justify-start gap-0.5 overflow-hidden">
          <ToolbarLink
            href={`${practicePath}/settings`}
            icon={<Icon name="settings" />}
            label="Settings"
          />
          <Divider />
          <ClientControlToggle />
          <Divider />
          <Link
            href={practicePath}
            aria-label="Activities"
            title="Activities"
            className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70"
          >
            <Icon name="activities" />
            <span className="hidden sm:inline">Activities</span>
          </Link>
          <Divider />
          <ToolbarItem icon={<Icon name="camera" />} label="Snapshot" />
        </div>

        {error && (
          <p role="alert" className="text-sm text-terracotta">
            {error}
          </p>
        )}
        <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
          <ToolbarLink
            href={`${practicePath}/chat`}
            icon={<Icon name="chat" />}
            label="Chat"
          />
          <button
            type="button"
            onClick={requestFeedback}
            disabled={ending || feedbackPhase !== null}
            aria-busy={ending}
            aria-label="End session"
            title="End session"
            className="flex shrink-0 items-center gap-2 rounded-panel bg-terracotta px-3 py-2 text-sm font-medium text-white hover:bg-terracotta/90"
          >
            <Icon name="phone" />
            <span className="hidden sm:inline">
              {ending || feedbackPhase === "grading" ? "Ending…" : "End session"}
            </span>
          </button>
        </div>
      </footer>
      {feedbackPhase && (
        <SessionFeedback
          phase={feedbackPhase}
          report={report}
          message={feedbackMessage}
          finishing={ending}
          onFinish={handleEndSession}
          onRetry={requestFeedback}
        />
      )}
    </>
  );
}
