import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in · Practice Room",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { confirmation } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-panel border border-charcoal/15 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-charcoal">Practice Room</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Log in to start a practice session.
        </p>
        {confirmation === "failed" && (
          <p role="alert" className="mt-4 text-sm text-terracotta">
            We couldn&apos;t finish signing you in from that confirmation link.
            Try logging in below if your email was confirmed. Otherwise, create
            an account again to request a new link and open it in the same browser.
          </p>
        )}
        {(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ? (
          <p role="alert" className="mt-6 text-sm text-terracotta">
            Sign-in is not configured yet. Add the Supabase project settings to .env.local and restart the app.
          </p>
        ) : <LoginForm />}
      </div>
    </main>
  );
}
