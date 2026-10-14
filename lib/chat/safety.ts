/**
 * Safety net for "Watch a model counselor" mode, where the person typing plays the
 * client and might write about real self-harm or danger. A keyword match makes the
 * server answer with a fixed, reviewed message instead of the LLM, because an AI
 * practice counselor must never be the only response to a real crisis.
 *
 * This is deliberately broad (false positives are acceptable) and is not a risk
 * assessment. Shared by browser and server; keep it free of server imports.
 */

const SAFETY_PATTERNS: RegExp[] = [
  /\bsuicid/i,
  /\bkill(ing)?\s+my\s*self\b/i,
  /\bend(ing)?\s+(my|it\s+all|my\s+life)\b/i,
  /\b(want|wanna|going)\s+(to\s+)?die\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\b(want(ing)?\s+to|feel(ing)?\s+like)\s+disappear/i,
  /\bno\s+(reason|point)\s+(to|in)\s+liv/i,
  /\bself[\s-]?harm/i,
  /\b(hurt|hurting|cut|cutting|harm|harming)\s+my\s*self\b/i,
  /\boverdos/i,
  /\b(abus(e|ed|es|ing)|molest)/i,
  /\b(hits?|hitting|beats?|beating)\s+me\b/i,
  /\b(not|don'?t\s+feel)\s+safe\b/i,
  /\bin\s+danger\b/i,
];

export function detectSafetyConcern(text: string): boolean {
  return SAFETY_PATTERNS.some((pattern) => pattern.test(text));
}

/** Model label stored on the scripted reply so the UI and researchers can find it. */
export const SAFETY_RESPONSE_MODEL = "scripted:safety-response";

export const CRISIS_RESOURCES = [
  "Call or text 988 (Suicide & Crisis Lifeline, US, 24/7)",
  "Text HOME to 741741 (Crisis Text Line)",
  "Call 911 if you or someone else is in immediate danger",
  "Tell a trusted adult, teacher, or your school's counseling center",
];

export const SAFETY_RESPONSE = [
  "I'm going to pause our practice conversation, because what you just wrote is important and I want to take it seriously.",
  "I'm an AI practice counselor in a training simulation, not a real counselor or doctor, so I can't keep you safe. If any of this is real for you, please reach out to a person right now:",
  ...CRISIS_RESOURCES.map((resource) => `• ${resource}`),
  "If you were role-playing a client, that's okay. Let me know and we can continue the practice.",
].join("\n");
