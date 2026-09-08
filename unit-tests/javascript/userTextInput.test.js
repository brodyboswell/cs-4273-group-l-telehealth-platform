/**
 * Unit test for the user text input feature (JavaScript).
 * Run with: node --test userTextInput.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { processUserTextInput } = require("./userTextInput");

describe("processUserTextInput", () => {
  it("trims and accepts non-empty user text", () => {
    // Arrange
    const rawText = "  How are you feeling today?  ";
    const expected = "How are you feeling today?";

    // Act
    const result = processUserTextInput(rawText);

    // Assert
    assert.equal(result, expected);
  });
});
