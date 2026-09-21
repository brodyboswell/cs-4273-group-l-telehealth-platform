import { SessionShell } from "@/components/session/SessionShell";

export default function PracticeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionShell>{children}</SessionShell>;
}
