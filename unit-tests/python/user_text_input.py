"""User text input feature for telehealth session messages."""


def process_user_text_input(raw_text: str) -> str:
    """
    Validate and normalize text entered by a student during a session.

    Raises:
        ValueError: If the input is empty or only whitespace.
    """
    if raw_text is None:
        raise ValueError("User text input cannot be None")

    normalized = raw_text.strip()
    if not normalized:
        raise ValueError("User text input cannot be empty")

    return normalized
