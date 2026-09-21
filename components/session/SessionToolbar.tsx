"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function IconPerson() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconHangup() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.8 21 3 13.2 3 3.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1l-2.2 2.4z" transform="rotate(135 12 12)" />
    </svg>
  );
}

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
      className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function ToolbarItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-charcoal/15" aria-hidden="true" />;
}

function ClientControlToggle() {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70">
      <IconPerson />
      <span>Client control</span>
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
    <footer className="grid h-toolbar shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center overflow-hidden border-t border-charcoal/15 bg-white px-4">
      <div className="flex min-w-0 items-center justify-start gap-0.5 overflow-hidden">
        <ToolbarLink href="/practice/settings" icon={<IconSettings />} label="Settings" />
        <Divider />
        <ClientControlToggle />
        <Divider />
        <Link
          href="/practice"
          className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm text-charcoal hover:opacity-70"
        >
          <IconGrid />
          <span>Activities</span>
        </Link>
        <Divider />
        <ToolbarItem icon={<IconCamera />} label="Snapshot" />
      </div>

      <div className="px-3 text-center text-sm font-medium text-charcoal whitespace-nowrap">
        Building rapport · 08:42
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
        <ToolbarLink href="/practice/chat" icon={<IconChat />} label="Chat" />
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-panel bg-terracotta px-3 py-2 text-sm font-medium text-white"
        >
          <IconHangup />
          End session
        </button>
      </div>
    </footer>
  );
}
