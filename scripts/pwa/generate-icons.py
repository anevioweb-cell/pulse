"""Generates the PWA icons in public/icons/ from one glyph definition.

Run: python3 -I scripts/pwa/generate-icons.py   (needs Pillow; no npm dependency)

The glyph is a heartbeat line on the brand accent (#066868, tokens.css --brand-700), white
stroke. "any" icons use a rounded square; the maskable icon fills the whole canvas and keeps the
glyph inside the central 80 % safe zone (W3C manifest spec: maskable icons may be cropped to a
circle of 80 % diameter). Drawn 4x larger and downsampled for anti-aliasing.
"""

from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = (6, 104, 104, 255)  # --brand-700
FOREGROUND = (255, 255, 255, 255)
SUPERSAMPLE = 4
CORNER_RADIUS = 0.22  # of the icon size, for "any" icons
STROKE = 0.075  # of the glyph box
# Heartbeat polyline in a unit box (x, y), y down.
GLYPH = [(0.08, 0.55), (0.32, 0.55), (0.41, 0.30), (0.52, 0.78), (0.61, 0.22), (0.70, 0.55), (0.92, 0.55)]
ANY_GLYPH_SCALE = 0.72  # glyph box relative to the icon
MASKABLE_GLYPH_SCALE = 0.56  # fits inside the 80 % safe circle with margin

OUT = Path(__file__).resolve().parents[2] / "public" / "icons"


def draw(size: int, maskable: bool) -> Image.Image:
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas = ImageDraw.Draw(image)
    if maskable:
        canvas.rectangle((0, 0, big, big), fill=BACKGROUND)
    else:
        canvas.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * CORNER_RADIUS), fill=BACKGROUND)
    box = big * (MASKABLE_GLYPH_SCALE if maskable else ANY_GLYPH_SCALE)
    offset = (big - box) / 2
    points = [(offset + x * box, offset + y * box) for x, y in GLYPH]
    width = max(1, int(box * STROKE))
    canvas.line(points, fill=FOREGROUND, width=width, joint="curve")
    radius = width / 2
    for x, y in (points[0], points[-1]):
        canvas.ellipse((x - radius, y - radius, x + radius, y + radius), fill=FOREGROUND)
    return image.resize((size, size), Image.LANCZOS)


def svg() -> str:
    path = " ".join(f"{'M' if i == 0 else 'L'}{x * 48:.2f} {y * 48:.2f}" for i, (x, y) in enumerate(GLYPH))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
        f'<rect width="48" height="48" rx="{48 * CORNER_RADIUS:.1f}" fill="#066868"/>'
        f'<path d="{path}" transform="translate({48 * (1 - ANY_GLYPH_SCALE) / 2:.2f} {48 * (1 - ANY_GLYPH_SCALE) / 2:.2f}) scale({ANY_GLYPH_SCALE})" '
        f'fill="none" stroke="#fff" stroke-width="{48 * STROKE:.2f}" stroke-linecap="round" stroke-linejoin="round"/>'
        "</svg>\n"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, maskable, opaque in [
        ("icon-192.png", 192, False, False),
        ("icon-512.png", 512, False, False),
        ("icon-maskable-512.png", 512, True, False),
        # iOS ignores transparency (shows black): the touch icon is the full-bleed variant.
        ("apple-touch-icon-180.png", 180, True, True),
    ]:
        image = draw(size, maskable)
        if opaque:
            image = image.convert("RGB")
        image.save(OUT / name, optimize=True)
    (OUT.parent / "favicon.svg").write_text(svg())


if __name__ == "__main__":
    main()
