"use client";

import { usePathname } from "next/navigation";
import { FaceCams } from "./FaceCams";
import { SessionHeader } from "./SessionHeader";
import { SessionToolbar } from "./SessionToolbar";

const DARK_RAIL_ROUTES = new Set([
  "/practice/feelings",
  "/practice/whiteboard",
  "/practice/chess",
]);

export function SessionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const darkRail = DARK_RAIL_ROUTES.has(pathname);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-cream">
      <SessionHeader />
      <div className="flex min-h-0 flex-1">
        <FaceCams darkRail={darkRail} />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <SessionToolbar />
    </div>
  );
}
