/**
 * Routes called by the Python voice agent rather than a logged-in browser.
 * middleware.ts skips the Supabase user check for these exact paths; each
 * route then requires the VOICE_AGENT_SECRET header (lib/voice/agentAuth.ts).
 * Kept free of Node imports so the Edge middleware can use it.
 */
export const VOICE_AGENT_ROUTES: readonly string[] = [
  "/api/voice/persona",
  "/api/voice/activity",
  "/api/voice/action",
];
