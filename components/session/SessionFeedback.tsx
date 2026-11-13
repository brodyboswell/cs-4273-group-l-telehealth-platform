"use client";

import type { GradeReport } from "@/lib/grading/types";

export type FeedbackPhase = "grading" | "feedback" | "failed";

export function isGradeReport(value: unknown): value is GradeReport {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ((value as { status: unknown }).status === "graded" ||
      (value as { status: unknown }).status === "insufficient_evidence")
  );
}

function Overlay({
  labelledBy,
  children,
}: {
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-panel bg-cream shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function ReportBody({ report }: { report: GradeReport }) {
  if (report.status === "insufficient_evidence")
    return (
      <p className="text-sm leading-relaxed text-charcoal/80">
        {report.message}
      </p>
    );

  return (
    <div className="space-y-6">
      {report.model === "mock:offline" && (
        <p className="rounded-panel border border-terracotta/40 bg-white px-3 py-2 text-sm text-charcoal">
          These scores are placeholders because no AI provider is configured.
        </p>
      )}
      <p className="text-3xl font-semibold">
        {report.totalScore}
        <span className="text-lg font-normal text-charcoal/60">
          {" "}
          / {report.maxScore}
        </span>
      </p>

      {report.strengths.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-charcoal/60">
            What went well
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.strengths.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {report.nextSteps.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-charcoal/60">
            Try next time
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.nextSteps.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-charcoal/60">
          By skill
        </h3>
        <ul className="mt-2 space-y-4">
          {report.criteria.map((criterion) => (
            <li
              key={criterion.criterionId}
              className="rounded-panel border border-charcoal/15 bg-white p-3"
            >
              <p className="flex justify-between gap-3 text-sm font-semibold">
                <span>{criterion.name}</span>
                <span>{criterion.score} / 3</span>
              </p>
              <p className="mt-1 text-sm text-charcoal/80">
                {criterion.rationale}
              </p>
              {criterion.evidence.map((item) => (
                <blockquote
                  key={`${item.seq}-${item.quote}`}
                  className="mt-2 border-l-2 border-sage pl-3 text-sm italic text-charcoal/70"
                >
                  “{item.quote}”
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function SessionFeedback({
  phase,
  report,
  message,
  finishing,
  onFinish,
  onRetry,
}: {
  phase: FeedbackPhase;
  report: GradeReport | null;
  message: string | null;
  finishing: boolean;
  onFinish: () => void;
  onRetry: () => void;
}) {
  if (phase === "grading")
    return (
      <Overlay labelledBy="feedback-title">
        <div className="px-6 py-10 text-center" aria-busy="true">
          <h2 id="feedback-title" className="text-lg font-semibold">
            Preparing your feedback…
          </h2>
          <p className="mt-2 text-sm text-charcoal/70">This can take a few seconds.</p>
        </div>
      </Overlay>
    );

  if (phase === "failed")
    return (
      <Overlay labelledBy="feedback-title">
        <div className="px-6 py-8">
          <h2 id="feedback-title" className="text-lg font-semibold">
            Feedback isn’t available
          </h2>
          <p role="alert" className="mt-2 text-sm text-charcoal/80">
            {message ?? "We couldn’t generate feedback for this session."}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onRetry}
              disabled={finishing}
              className="rounded-panel border border-charcoal/30 px-4 py-2 text-sm font-medium hover:bg-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onFinish}
              disabled={finishing}
              className="rounded-panel bg-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-terracotta/90"
            >
              {finishing ? "Ending…" : "End session without feedback"}
            </button>
          </div>
        </div>
      </Overlay>
    );

  return (
    <Overlay labelledBy="feedback-title">
      <div className="overflow-y-auto px-6 py-6">
        <h2 id="feedback-title" className="mb-4 text-xl font-semibold">
          Your session feedback
        </h2>
        {report && <ReportBody report={report} />}
      </div>
      <div className="flex items-center justify-end gap-4 border-t border-charcoal/15 bg-white px-6 py-4">
        {message && (
          <p role="alert" className="text-sm text-terracotta">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          className="rounded-panel bg-charcoal px-4 py-2 text-sm font-medium text-cream hover:bg-charcoal/90"
        >
          {finishing ? "Ending…" : "Finish and end session"}
        </button>
      </div>
    </Overlay>
  );
}
