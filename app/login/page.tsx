import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in · Practice Room",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-panel border border-charcoal/15 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-charcoal">Practice Room</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Log in to start a practice session.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
