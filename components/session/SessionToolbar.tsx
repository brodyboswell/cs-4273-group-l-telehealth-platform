"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

function ToolbarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function ToolbarItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function Divider() {
  return (
    <div className="mx-1 h-6 w-px shrink-0 bg-charcoal/15" aria-hidden="true" />
  );
}

function ClientControlToggle() {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70">
      <Icon name="person" />
      <span className="hidden sm:inline">Client control</span>
      <span className="relative inline-block h-5 w-9 shrink-0">
        <input
          type="checkbox"
          defaultChecked
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label="Client control"
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-charcoal/25 transition-colors peer-checked:bg-sage peer-focus-visible:ring-2 peer-focus-visible:ring-sage peer-focus-visible:ring-offset-1"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

export function SessionToolbar() {
  return (
    <footer className="flex h-16 shrink-0 justify-between gap-4 items-center overflow-hidden border-t border-charcoal/15 bg-white px-4">
      <div className="flex min-w-0 items-center justify-start gap-0.5 overflow-hidden">
        <ToolbarLink
          href="/practice/settings"
          icon={<Icon name="settings" />}
          label="Settings"
        />
        <Divider />
        <ClientControlToggle />
        <Divider />
        <Link
          href="/practice"
          aria-label="Activities"
          title="Activities"
          className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70"
        >
          <Icon name="activities" />
          <span className="hidden sm:inline">Activities</span>
        </Link>
        <Divider />
        <ToolbarItem icon={<Icon name="camera" />} label="Snapshot" />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
        <ToolbarLink
          href="/practice/chat"
          icon={<Icon name="chat" />}
          label="Chat"
        />
        <button
          type="button"
          aria-label="End session"
          title="End session"
          className="flex shrink-0 items-center gap-2 rounded-panel bg-terracotta px-3 py-2 text-sm font-medium text-white"
        >
          <Icon name="phone" />
          <span className="hidden sm:inline">End session</span>
        </button>
      </div>
    </footer>
  );
}
