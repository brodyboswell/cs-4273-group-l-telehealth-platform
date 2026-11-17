"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VirtualClient } from "@/lib/chat/clientProfile";

type PracticeSession = {
  sessionId: string;
  name: string;
  userId: string;
  browserSession: boolean;
  client: VirtualClient;
};
const PracticeSessionContext = createContext<PracticeSession | null>(null);

export function PracticeSessionProvider({
  session,
  children,
}: {
  session: PracticeSession;
  children: ReactNode;
}) {
  return (
    <PracticeSessionContext.Provider value={session}>
      {children}
    </PracticeSessionContext.Provider>
  );
}

export function usePracticeSession() {
  const session = useContext(PracticeSessionContext);
  if (!session) throw new Error("An active practice session is required.");
  return { ...session, practicePath: `/practice/${session.sessionId}` };
}
