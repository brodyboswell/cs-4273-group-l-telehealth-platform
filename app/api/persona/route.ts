/**
 * GET /api/persona returns the active virtual-client persona as JSON.
 *
 * The Next.js server already owns the persona text (lib/chat/persona.ts) as
 * the single source of truth for the text-chat pipeline (app/api/chat).
 * The Python voice agent (voice-agent/) fetches it from here at session
 * start instead of duplicating the (large, frequently-edited) system prompt
 * in a second language, so persona edits never need to be kept in sync by
 * hand across TypeScript and Python.
 *
 * No secrets live in a Persona — safe to expose unauthenticated, consistent
 * with the rest of the API surface, which has no auth yet (see AGENTS.md).
 */
import { DEFAULT_PERSONA } from "@/lib/chat/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      id: DEFAULT_PERSONA.id,
      name: DEFAULT_PERSONA.name,
      openingLine: DEFAULT_PERSONA.openingLine,
      systemPrompt: DEFAULT_PERSONA.systemPrompt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
