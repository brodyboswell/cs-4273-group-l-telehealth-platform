"""Unit test for the user text input feature (Python)."""

import unittest

from user_text_input import process_user_text_input


class TestUserTextInput(unittest.TestCase):
    def test_process_user_text_input_trims_and_accepts_nonempty_text(self):
        # Arrange
        raw_text = "  How are you feeling today?  "
        expected = "How are you feeling today?"

        # Act
        result = process_user_text_input(raw_text)

        # Assert
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
