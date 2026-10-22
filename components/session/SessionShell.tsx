"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ActivityBridgeProvider } from "./ActivityBridge";
import { FaceCams } from "./FaceCams";
import { SessionHeader } from "./SessionHeader";
import { SessionToolbar } from "./SessionToolbar";
import { RoomStateProvider } from "./RoomState";

const ACTIVITY_ROUTES = new Set([
  "/practice/feelings",
  "/practice/whiteboard",
  "/practice/chess",
]);

export function SessionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activityPage = ACTIVITY_ROUTES.has(pathname);
  const chatPage = pathname === "/practice/chat";
  const sideChatPage = pathname === "/practice" || activityPage;
  const [expandedChatPath, setExpandedChatPath] = useState<string | null>(null);
  const mobileChatExpanded = sideChatPage && expandedChatPath === pathname;
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const closeChatRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setExpandedChatPath(null);
  }, [pathname]);

  function closeMobileChat() {
    setExpandedChatPath(null);
    requestAnimationFrame(() => chatTabRef.current?.focus());
  }

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
    return () => controller.abort();
  }, [router]);

  const activityPaneClassName = chatPage
    ? "hidden"
    : "session-activity-pane min-w-0 flex-1 overflow-hidden";
  const chatSidebarClassName = chatPage
    ? "min-h-0 min-w-0 flex-1"
    : sideChatPage
      ? `session-chat-sidebar min-h-0 min-w-0 border-l border-charcoal/10 ${mobileChatExpanded ? "mobile-chat-open" : ""}`
      : "hidden";
  const chatTabClassName = sideChatPage ? "session-chat-tab" : "hidden";

  return (
    <ActivityBridgeProvider>
      <RoomStateProvider>
        <div className="relative flex h-dvh flex-col overflow-hidden bg-cream">
          <SessionHeader />
          <div className="session-room-body relative flex min-h-0 flex-1">
            <FaceCams darkRail={activityPage} />
            <main className={activityPaneClassName}>{children}</main>
            <aside
              className={chatSidebarClassName}
              aria-label="Session chat"
              onKeyDown={(event) => {
                if (mobileChatExpanded && event.key === "Escape") {
                  closeMobileChat();
                }
              }}
            >
              <button
                ref={chatTabRef}
                type="button"
                className={chatTabClassName}
                aria-label="Open session chat"
                aria-controls="session-chat-content"
                aria-expanded={mobileChatExpanded}
                onClick={() => {
                  setExpandedChatPath(pathname);
                  requestAnimationFrame(() => closeChatRef.current?.focus());
                }}
              >
                Chat
              </button>
              <div id="session-chat-content" className="session-chat-content">
                <div className="session-chat-mobile-header">
                  <span>Session chat</span>
                  <button
                    ref={closeChatRef}
                    type="button"
                    onClick={closeMobileChat}
                    aria-label="Close session chat"
                  >
                    Close
                  </button>
                </div>
                <ChatPanel compact={sideChatPage} />
              </div>
            </aside>
          </div>
          <SessionToolbar />
        </div>
      </RoomStateProvider>
    </ActivityBridgeProvider>
  );
}
