/**
 * User text input feature for telehealth session messages.
 * Validates and normalizes text entered by a student during a session.
 */
export function processUserTextInput(rawText: string): string {
  if (rawText == null) {
    throw new Error("User text input cannot be null or undefined");
  }

  const normalized = rawText.trim();
  if (!normalized) {
    throw new Error("User text input cannot be empty");
  }

  return normalized;
}
