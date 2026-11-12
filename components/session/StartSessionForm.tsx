"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { saveBrowserSession } from "@/lib/chat/browserSession";
import { Icon } from "@/components/ui/Icon";
import {
  isRecord,
  isTranscript,
  isValidSessionId,
  MAX_SESSION_NAME_LENGTH,
} from "@/lib/chat/validation";

export function StartSessionForm() {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, requestId: requestId.current }),
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Could not start your session. Please try again.",
        );
      if (!isRecord(data) || !isValidSessionId(data.sessionId))
        throw new Error("Could not start your session. Please try again.");
      if (data.transcript !== undefined) {
        if (
          !isTranscript(data.transcript) ||
          data.transcript.sessionId !== data.sessionId
        )
          throw new Error("Could not start your session. Please try again.");
        saveBrowserSession(data.transcript);
      }
      router.push(`/practice/${data.sessionId}`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not start your session. Please try again.",
      );
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-10 sm:px-8 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <section className="min-w-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-charcoal/60">
          Your practice space
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Start a practice session
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-charcoal/70">
          Practice interviewing with a virtual client, at your own pace.
        </p>
        <div className="relative mt-7 hidden aspect-[4/3] overflow-hidden rounded-panel border border-charcoal/10 bg-[#eae5da] lg:block">
          <Image
            src="/room-background.png"
            alt="The illustrated practice room with a sofa, bookshelf, and sunlit window"
            fill
            sizes="420px"
            className="object-cover"
            priority
          />
        </div>
        <Link
          href="/sessions"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal"
        >
          Session logs · Coming soon <span aria-hidden="true">→</span>
        </Link>
      </section>

      <form
        method="post"
        onSubmit={startSession}
        aria-busy={pending}
        className="min-w-0 overflow-hidden rounded-panel border border-charcoal/15 bg-white shadow-sm"
      >
        <div className="flex items-center gap-4 border-b border-charcoal/10 bg-sage/15 px-6 py-6 sm:px-8">
          <Image
            src="/avatar-alex.svg"
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full border border-charcoal/15 bg-cream"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/60">
              Virtual client
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Jacob</h2>
            <p className="mt-1 text-sm text-charcoal/70">
              Age 12 · Adjusting to middle school
            </p>
          </div>
        </div>
        <div className="space-y-6 p-6 sm:p-8">
          <div>
            <label
              htmlFor="session-name"
              className="block text-sm font-semibold"
            >
              Session name{" "}
              <span className="font-normal text-charcoal/60">(optional)</span>
            </label>
            <input
              id="session-name"
              name="name"
              maxLength={MAX_SESSION_NAME_LENGTH}
              disabled={pending}
              placeholder="e.g., Rapport-building practice"
              aria-describedby="session-name-help"
              className="mt-2 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-3 text-sm outline-none placeholder:text-charcoal/45 focus:border-sage focus:ring-2 focus:ring-sage/30 disabled:opacity-60"
            />
            <p
              id="session-name-help"
              className="mt-2 text-xs leading-relaxed text-charcoal/65"
            >
              Give this practice session a name, or leave it blank.
            </p>
          </div>
          <div className="flex gap-3 rounded-panel bg-cream p-4 text-sm leading-relaxed text-charcoal/80">
            <Icon name="chat" className="mt-0.5 shrink-0 text-charcoal/60" />
            <p>
              Start practicing with Jacob now. Saved session logs are coming
              soon.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-panel border border-terracotta/40 bg-terracotta/10 p-3 text-sm"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-panel bg-charcoal px-4 py-3 text-sm font-semibold text-cream transition hover:bg-charcoal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? "Starting session…" : "Start practice session"}
            {!pending && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </form>
    </main>
  );
}
