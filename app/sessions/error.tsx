"use client";

export default function SessionsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Could not load your session</h1>
      <p role="alert" className="mt-3 text-sm text-charcoal/70">
        Your session logs are unavailable right now. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-panel bg-charcoal px-4 py-2 text-sm text-cream"
      >
        Try again
      </button>
    </main>
  );
}
