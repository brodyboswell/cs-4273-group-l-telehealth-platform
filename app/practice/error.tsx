"use client";

import Link from "next/link";
import { AccountHeader } from "@/components/account/AccountHeader";

export default function PracticeError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-dvh bg-cream text-charcoal">
      <AccountHeader />
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold">
          Could not load your practice session
        </h1>
        <p role="alert" className="mt-3 text-sm text-charcoal/70">
          Your session data is unavailable right now. Please try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-panel bg-charcoal px-4 py-2 text-sm text-cream"
          >
            Try again
          </button>
          <Link
            href="/sessions"
            className="rounded-panel border border-charcoal/20 px-4 py-2 text-sm"
          >
            Session logs
          </Link>
        </div>
      </main>
    </div>
  );
}
