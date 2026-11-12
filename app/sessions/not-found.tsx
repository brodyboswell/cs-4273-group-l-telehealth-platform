import Link from "next/link";

export default function SessionNotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Session not found</h1>
      <p className="mt-3 text-sm text-charcoal/70">
        This session is unavailable for your account.
      </p>
      <Link
        href="/sessions"
        className="mt-6 inline-block rounded-panel bg-charcoal px-4 py-2 text-sm text-cream"
      >
        Back to session logs
      </Link>
    </main>
  );
}
