"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth/supabaseAuth";
import { Icon } from "@/components/ui/Icon";

export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (details.current) details.current.open = false;
    setError(null);
  }, [pathname]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!details.current?.contains(event.target as Node) && details.current)
        details.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { redirectTo } = await signOut();
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <details
      ref={details}
      className="relative text-left"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current) {
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-panel border border-charcoal/15 bg-white px-3 py-2 text-sm font-medium text-charcoal hover:bg-sage/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sage [&::-webkit-details-marker]:hidden">
        <Icon name="person" />
        <span>Account</span>
        <span aria-hidden="true" className="text-xs text-charcoal/60">
          ⌄
        </span>
      </summary>
      <nav
        aria-label="Account"
        className="absolute right-0 top-full z-50 mt-2 w-56 rounded-panel border border-charcoal/15 bg-white p-2 shadow-lg"
      >
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-charcoal/50">
          Your practice
        </p>
        <Link
          href="/sessions/new"
          className="block rounded-panel px-3 py-2.5 text-sm text-charcoal hover:bg-sage/15"
        >
          Start a session
        </Link>
        <Link
          href="/sessions"
          aria-current={pathname === "/sessions" ? "page" : undefined}
          className="block rounded-panel px-3 py-2.5 text-sm text-charcoal hover:bg-sage/15"
        >
          Session logs
        </Link>
        <div className="my-1 border-t border-charcoal/10" />
        <button
          type="button"
          disabled={pending}
          onClick={handleSignOut}
          className="w-full rounded-panel px-3 py-2.5 text-left text-sm font-medium text-charcoal hover:bg-terracotta/10 disabled:opacity-60"
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
        {error && (
          <p role="alert" className="px-3 py-2 text-sm text-charcoal">
            {error}
          </p>
        )}
      </nav>
    </details>
  );
}
