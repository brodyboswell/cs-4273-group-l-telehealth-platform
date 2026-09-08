"""Run all user text input unit tests (Python, JavaScript, TypeScript)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SUITES = [
    {
        "name": "Python",
        "cwd": ROOT / "python",
        "command": [sys.executable, "-m", "unittest", "test_user_text_input.py"],
    },
    {
        "name": "JavaScript",
        "cwd": ROOT / "javascript",
        "command": ["node", "--test", "userTextInput.test.js"],
    },
    {
        "name": "TypeScript",
        "cwd": ROOT / "typescript",
        "command": ["npm", "test"],
    },
]


def run_suite(name: str, cwd: Path, command: list[str]) -> bool:
    print(f"\n{'=' * 60}")
    print(f"Running {name} tests")
    print(f"{'=' * 60}")

    result = subprocess.run(command, cwd=cwd, shell=(sys.platform == "win32"))
    passed = result.returncode == 0
    status = "PASSED" if passed else "FAILED"
    print(f"\n{name}: {status}")
    return passed


def main() -> int:
    results: list[tuple[str, bool]] = []

    for suite in SUITES:
        passed = run_suite(suite["name"], suite["cwd"], suite["command"])
        results.append((suite["name"], passed))

    print(f"\n{'=' * 60}")
    print("Summary")
    print(f"{'=' * 60}")
    for name, passed in results:
        print(f"  {name}: {'PASSED' if passed else 'FAILED'}")

    all_passed = all(passed for _, passed in results)
    print(f"\nOverall: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
