"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth/mockAuth";

export function LoginForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inputs are uncontrolled so credentials never enter React state; they are
  // read once on submit and the form is cleared before navigating away.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn({
        username: String(data.get("username") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      form.reset();
      if (result.ok) {
        router.push(result.redirectTo);
        return;
      }
      setError(result.message);
    } catch {
      setError("We couldn't reach the sign-in service. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-charcoal">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
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
          autoComplete="current-password"
          className="mt-1 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
        />
      </div>

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
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
