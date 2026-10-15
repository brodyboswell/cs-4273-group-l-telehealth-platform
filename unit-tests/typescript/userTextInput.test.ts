/**
 * Unit test for the user text input feature (TypeScript).
 * Run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processUserTextInput } from "./userTextInput.js";

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
