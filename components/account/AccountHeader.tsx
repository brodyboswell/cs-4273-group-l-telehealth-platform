import Link from "next/link";
import { AccountMenu } from "./AccountMenu";

export function AccountHeader() {
  return (
    <header className="flex h-header shrink-0 items-center justify-between gap-3 border-b border-charcoal/10 bg-cream px-4 sm:px-6">
      <Link
        href="/sessions/new"
        className="text-base font-semibold text-charcoal"
      >
        Practice Room
      </Link>
      <div className="flex items-center gap-5">
        <span className="hidden text-sm text-charcoal/60 sm:inline">
          Simulation
        </span>
        <AccountMenu />
      </div>
    </header>
  );
}
