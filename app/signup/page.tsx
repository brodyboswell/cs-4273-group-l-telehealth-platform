import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Create account · Practice Room",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-panel border border-charcoal/15 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-charcoal">Create your account</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Sign up to start practicing. Use an email address you can access.
        </p>
        {(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ? (
          <p role="alert" className="mt-6 text-sm text-terracotta">
            Account creation is not configured yet. Add the Supabase project settings to .env.local and restart the app.
          </p>
        ) : <LoginForm mode="signup" />}
      </div>
    </main>
  );
}
