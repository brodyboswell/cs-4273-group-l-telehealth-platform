/**
 * Server-to-server authentication for the Python voice agent (voice-agent/).
 *
 * The agent has no Supabase login, so the routes it calls (/api/voice/persona,
 * /api/voice/activity, /api/voice/action) are skipped by the user check in
 * middleware.ts and instead require the shared VOICE_AGENT_SECRET in the
 * x-voice-agent-secret header. Set the same value in .env.local and
 * voice-agent/.env. Without it configured, every agent request is refused.
 */
// Server-only module: never import this from a "use client" component.
import { createHash, timingSafeEqual } from "node:crypto";

export const VOICE_AGENT_SECRET_HEADER = "x-voice-agent-secret";

const MIN_SECRET_LENGTH = 16;

export function isVoiceAgentRequest(request: Request): boolean {
  const expected = process.env.VOICE_AGENT_SECRET ?? "";
  const provided = request.headers.get(VOICE_AGENT_SECRET_HEADER) ?? "";
  if (expected.length < MIN_SECRET_LENGTH || !provided) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
