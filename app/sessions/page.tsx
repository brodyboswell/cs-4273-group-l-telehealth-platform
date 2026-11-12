import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Session logs · Practice Room" };

export default function SessionLogsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal/60">
        Your practice
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Session logs</h1>
      <section className="mt-8 rounded-panel border border-charcoal/15 bg-white px-6 py-12 text-center sm:px-12">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/15">
          <Icon name="chat" className="h-6 w-6 text-charcoal" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-charcoal/60">
          Coming soon
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          A place to revisit your practice
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-charcoal/70">
          Saved session history and transcript downloads will be available here
          in a future update.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-charcoal/70">
          For now, you can start a session and practice with Jacob. Hosted
          conversations are kept in the current browser tab, so keep it open
          while you practice.
        </p>
        <Link
          href="/sessions/new"
          className="mt-7 inline-flex items-center gap-2 rounded-panel bg-charcoal px-5 py-3 text-sm font-semibold text-cream hover:bg-charcoal/90"
        >
          Start a practice session <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
