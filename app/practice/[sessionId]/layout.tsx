import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import {
  getOwnedTranscript,
  TranscriptAccessError,
} from "@/lib/chat/transcriptStore";
import { isValidSessionId } from "@/lib/chat/validation";
import { SessionShell } from "@/components/session/SessionShell";
import { usesBrowserSessions } from "@/lib/chat/storageMode";

export default async function ActivePracticeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const user = await auth.getUser();
  if (!user) redirect("/login");
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) redirect("/sessions/new");
  if (usesBrowserSessions())
    return (
      <SessionShell
        key={`${user.id}:${sessionId}`}
        sessionId={sessionId}
        userId={user.id}
        name="Practice session"
        browserSession
      >
        {children}
      </SessionShell>
    );
  const transcript = await getOwnedTranscript(sessionId, user.id).catch(
    (error: unknown) => {
      if (error instanceof TranscriptAccessError) redirect("/sessions/new");
      throw error;
    },
  );
  if (transcript.endedAt) redirect(`/sessions/${sessionId}`);
  return (
    <SessionShell
      key={`${user.id}:${sessionId}`}
      sessionId={sessionId}
      userId={user.id}
      name={transcript.name || `Practice with ${transcript.personaName}`}
      client={transcript.client}
    >
      {children}
    </SessionShell>
  );
}
