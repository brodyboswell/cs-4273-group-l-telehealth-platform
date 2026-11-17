"use client";

import { AccountMenu } from "@/components/account/AccountMenu";
import { usePracticeSession } from "./PracticeSession";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TITLES: Record<string, { label: string; back?: boolean }> = {
  "/practice": { label: "Welcome room" },
  "/practice/feelings": { label: "Feelings check-in", back: true },
  "/practice/whiteboard": { label: "Whiteboard", back: true },
  "/practice/chess": { label: "Chess", back: true },
  "/practice/settings": { label: "Settings", back: true },
  "/practice/chat": { label: "Chat", back: true },
};

export function SessionHeader() {
  const pathname = usePathname();
  const { practicePath, name } = usePracticeSession();
  const title = TITLES[pathname.replace(practicePath, "/practice")] ?? {
    label: "Welcome room",
  };

  return (
    <header className="flex h-header shrink-0 items-center gap-3 border-b border-charcoal/10 bg-cream px-3 sm:px-6">
      <div className="w-auto sm:w-48 shrink-0 text-base font-semibold text-charcoal">
        Practice Room
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-end sm:items-center">
        {title.back ? (
          <Link
            href={practicePath}
            aria-label={`Return to welcome room from ${title.label}`}
            title="Return to welcome room"
            className="truncate text-base font-medium text-charcoal hover:opacity-70"
          >
            ← {title.label}
          </Link>
        ) : (
          <span className="truncate text-base font-medium text-charcoal">
            {title.label}
          </span>
        )}
        <span
          className="hidden max-w-full truncate text-xs text-charcoal/60 md:block"
          title={name}
        >
          {name}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm text-charcoal/60">
        <span className="hidden lg:inline">Simulation</span>
        <AccountMenu />
      </div>
    </header>
  );
}
