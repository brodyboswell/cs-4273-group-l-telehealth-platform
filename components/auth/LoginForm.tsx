"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth/supabaseAuth";

export function LoginForm({ mode = "login" }: { mode?: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  // Inputs are uncontrolled so credentials never enter React state; they are
  // read once on submit and the form is cleared before navigating away.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const credentials = {
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };
    if (isSignup && credentials.password !== String(data.get("confirmPassword") ?? "")) {
      setError("Your passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const result = isSignup
        ? await signUp(credentials, window.location.origin)
        : await signIn(credentials);
      form.reset();
      if (result.ok) {
        if ("redirectTo" in result) {
          router.replace(result.redirectTo);
          router.refresh();
        } else {
          setConfirmationRequired(true);
          setSubmitting(false);
        }
        return;
      }
      setError(result.message);
    } catch {
      setError("We couldn't reach the account service. Please try again.");
    }
    setSubmitting(false);
  }

  if (confirmationRequired) {
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="text-sm text-charcoal">
          Check your inbox for a confirmation link. Open it in this browser to
          finish creating your account. If you already have an account, you can log in.
        </p>
        <Link href="/login" className="inline-block text-sm font-semibold text-charcoal underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-charcoal">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-charcoal">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 8 : undefined}
          aria-describedby={isSignup ? "password-help" : undefined}
          required
          className="mt-1 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
        />
        {isSignup && <p id="password-help" className="mt-1 text-xs text-charcoal/60">Use at least 8 characters.</p>}
      </div>

      {isSignup && (
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-charcoal">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="mt-1 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-terracotta">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-panel bg-charcoal px-4 py-2 text-sm font-semibold text-cream transition hover:bg-charcoal/90 disabled:cursor-wait disabled:opacity-70"
      >
        {submitting ? (isSignup ? "Creating account…" : "Logging in…") : (isSignup ? "Create account" : "Log in")}
      </button>
      <p className="text-center text-sm text-charcoal/60">
        {isSignup ? "Already have an account? " : "New to Practice Room? "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-charcoal underline">
          {isSignup ? "Log in" : "Create account"}
        </Link>
      </p>
    </form>
  );
}
