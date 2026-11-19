"""
feeling_faces.py

Ready-made whiteboard faces for the 12 feelings on the feelings chart, so the
voice client's "draw how I feel" drawing always matches the feeling it names.
The LLM only picks the feeling (draw_feeling_face tool); it does not write SVG
for these faces, because models often curve the mouth the wrong way (SVG's y
axis points down). The SVG is still sent through /api/voice/action, so the
server's whiteboard sanitizer checks it like any other client drawing.

Keep MOOD_IDS in sync with MOOD_OPTIONS in lib/mood/moodTypes.ts. Colors must
come from WHITEBOARD_DOODLE_COLORS in lib/whiteboard/palette.ts. The drawing
uses a 500 x 350 viewBox, outlines only, like the other client doodles.
"""
from __future__ import annotations

FOREST = "#293c35"
SAGE = "#88a294"
APRICOT = "#c97c63"
BUTTER = "#e6ca79"
LILAC = "#a990b9"

# Face circle: center (250, 175), radius 115. Eyes near y=150, mouth near y=225.
_EYES_DOTS = '<circle cx="208" cy="150" r="9"/><circle cx="292" cy="150" r="9"/>'
_EYES_CLOSED_HAPPY = '<path d="M193 155 Q208 138 223 155"/><path d="M277 155 Q292 138 307 155"/>'
_EYES_SLEEPY = '<path d="M193 150 Q208 160 223 150"/><path d="M277 150 Q292 160 307 150"/>'
_EYES_WIDE = '<circle cx="208" cy="150" r="13"/><circle cx="292" cy="150" r="13"/>'

# Inner brow ends low = angry; inner ends high = sad or worried.
_BROWS_ANGRY = '<path d="M185 115 L230 132"/><path d="M315 115 L270 132"/>'
_BROWS_SAD = '<path d="M185 130 L228 115"/><path d="M315 130 L272 115"/>'
_BROWS_UNSURE = '<path d="M188 122 L228 122"/><path d="M272 112 Q292 100 312 112"/>'

# In SVG, a control point BELOW the ends (bigger y) makes a smile.
_MOUTH_SMILE = '<path d="M195 210 Q250 258 305 210"/>'
_MOUTH_SMALL_SMILE = '<path d="M215 218 Q250 240 285 218"/>'
_MOUTH_OPEN_SMILE = '<path d="M190 205 Q250 275 310 205 Z"/>'
_MOUTH_FROWN = '<path d="M200 245 Q250 200 300 245"/>'
_MOUTH_TIGHT_FROWN = '<path d="M210 240 Q250 215 290 240"/>'
_MOUTH_FLAT = '<path d="M212 230 L288 230"/>'
_MOUTH_WAVY = '<path d="M200 230 Q216 216 233 230 Q250 244 267 230 Q284 216 300 230"/>'
_MOUTH_SIDE = '<path d="M215 232 Q250 232 285 220"/>'

_TEAR = '<path d="M206 170 Q198 188 206 196 Q214 188 206 170"/>'
_SPARKS = (
    '<path d="M110 70 L125 85"/><path d="M390 70 L375 85"/>'
    '<path d="M95 175 L118 175"/><path d="M405 175 L382 175"/>'
)
_SWEAT = '<path d="M352 110 Q344 128 352 136 Q360 128 352 110"/>'
_SUN_RAYS = '<path d="M250 35 L250 15"/><path d="M345 70 L362 55"/><path d="M155 70 L138 55"/>'

# moodId -> (color, inner shapes)
_FACES: dict[str, tuple[str, str]] = {
    "calm": (SAGE, _EYES_CLOSED_HAPPY + _MOUTH_SMALL_SMILE),
    "happy": (BUTTER, _EYES_DOTS + _MOUTH_SMILE),
    "excited": (APRICOT, _EYES_WIDE + _MOUTH_OPEN_SMILE + _SPARKS),
    "proud": (LILAC, _EYES_CLOSED_HAPPY + _MOUTH_SMILE),
    "worried": (SAGE, _BROWS_SAD + _EYES_DOTS + _MOUTH_WAVY + _SWEAT),
    "sad": (FOREST, _BROWS_SAD + _EYES_DOTS + _MOUTH_FROWN + _TEAR),
    "angry": (APRICOT, _BROWS_ANGRY + _EYES_DOTS + _MOUTH_TIGHT_FROWN),
    "frustrated": (APRICOT, _BROWS_ANGRY + _EYES_DOTS + _MOUTH_WAVY),
    "tired": (LILAC, _EYES_SLEEPY + _MOUTH_FLAT),
    "lonely": (FOREST, _BROWS_SAD + _EYES_DOTS + _MOUTH_TIGHT_FROWN),
    "hopeful": (BUTTER, _EYES_DOTS + _MOUTH_SMALL_SMILE + _SUN_RAYS),
    "unsure": (LILAC, _BROWS_UNSURE + _EYES_DOTS + _MOUTH_SIDE),
}

MOOD_IDS: tuple[str, ...] = tuple(_FACES)


def feeling_face_svg(mood_id: str) -> str:
    """A complete, static SVG doodle of a face showing mood_id."""
    color, shapes = _FACES[mood_id]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">'
        f'<g fill="none" stroke="{color}" stroke-width="6" '
        'stroke-linecap="round" stroke-linejoin="round">'
        '<circle cx="250" cy="175" r="115"/>'
        f"{shapes}"
        "</g></svg>"
    )
