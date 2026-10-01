"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FaceCams } from "./FaceCams";
import { SessionHeader } from "./SessionHeader";
import { SessionToolbar } from "./SessionToolbar";
import { RoomStateProvider } from "./RoomState";

const DARK_RAIL_ROUTES = new Set([
  "/practice/feelings",
  "/practice/whiteboard",
  "/practice/chess",
]);

export function SessionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const darkRail = DARK_RAIL_ROUTES.has(pathname);

  useEffect(() => {
    const controller = new AbortController();
    const routes = [
      "/practice",
      "/practice/whiteboard",
      "/practice/feelings",
      "/practice/chess",
      "/practice/chat",
      "/practice/settings",
    ];
    for (const route of routes) {
      router.prefetch(route);
      // Automatic prefetch is disabled in Next development mode. Warm local
      // compilation too, instead of making the first click pay its cost.
      if (process.env.NODE_ENV === "development") {
        void fetch(route, { signal: controller.signal }).catch(() => {});
      }
    }
    // Route prefetch alone does not load the client-only drawing editor.
    // These imports do not mount activities or send chat messages.
    void import("@/components/activities/WhiteboardCanvas")
      .then((module) => module.preloadWhiteboardEditor())
      .catch(() => {});
    void import("@/components/activities/ChessBoard").catch(() => {});
    void import("@/components/activities/FeelingsCheckIn").catch(() => {});
    void import("@/components/chat/ChatPanel").catch(() => {});
    return () => controller.abort();
  }, [router]);

  return (
    <RoomStateProvider>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-cream">
        <SessionHeader />
        <div className="flex min-h-0 flex-1">
          <FaceCams darkRail={darkRail} />
          <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        </div>
        <SessionToolbar />
      </div>
    </RoomStateProvider>
  );
}
