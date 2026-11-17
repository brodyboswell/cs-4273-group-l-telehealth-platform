import type { Metadata } from "next";
import { StartSessionForm } from "@/components/session/StartSessionForm";

export const metadata: Metadata = { title: "Start a session · Practice Room" };

export default function NewSessionPage() {
  return <StartSessionForm />;
}
