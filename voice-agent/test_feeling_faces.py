"""Run with:  python -m unittest test_feeling_faces   (inside voice-agent/)"""
import re
import unittest
from pathlib import Path

from feeling_faces import MOOD_IDS, feeling_face_svg

ROOT = Path(__file__).resolve().parent.parent


class FeelingFacesTest(unittest.TestCase):
    def test_one_face_per_feelings_chart_option(self):
        source = (ROOT / "lib" / "mood" / "moodTypes.ts").read_text(encoding="utf8")
        chart_ids = re.findall(r'\{\s*id:\s*"([a-z]+)"', source)
        self.assertEqual(sorted(MOOD_IDS), sorted(chart_ids))

    def test_faces_use_only_palette_colors_and_allowed_shapes(self):
        palette = (ROOT / "lib" / "whiteboard" / "palette.ts").read_text(encoding="utf8")
        colors = {c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}", palette)}
        for mood in MOOD_IDS:
            svg = feeling_face_svg(mood)
            self.assertTrue(svg.startswith("<svg") and len(svg) < 12_000, mood)
            used = {c.lower() for c in re.findall(r'stroke="(#[0-9a-fA-F]{6})"', svg)}
            self.assertTrue(used and used <= colors, mood)
            tags = set(re.findall(r"<([a-z]+)", svg)) - {"svg"}
            self.assertTrue(tags <= {"g", "path", "circle"}, (mood, tags))


if __name__ == "__main__":
    unittest.main()
