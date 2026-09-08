/**
 * User text input feature for telehealth session messages.
 * Validates and normalizes text entered by a student during a session.
 *
 * @param {string} rawText
 * @returns {string} Trimmed, non-empty message text
 * @throws {Error} If the input is empty or only whitespace
 */
function processUserTextInput(rawText) {
  if (rawText == null) {
    throw new Error("User text input cannot be null or undefined");
  }

  const normalized = String(rawText).trim();
  if (!normalized) {
    throw new Error("User text input cannot be empty");
  }

  return normalized;
}

module.exports = { processUserTextInput };
