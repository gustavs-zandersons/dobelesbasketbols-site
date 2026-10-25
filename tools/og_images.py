"""Link-preview images (Facebook, WhatsApp, Messenger…), one per cup.

    python3 tools/og_images.py      -> assets/og/dobele.png, assets/og/jelgava.png

1200 × 630 px: the cup's colour, its logo, "Sezona 2026/27" and the cup's name in
the site's display font, the address on a white ridge at the bottom (like the
site's hero). The composition is centred, so square crops (WhatsApp) still show
the logo and the name. Run again when a cup name or the season changes; the
images are committed (the build doesn't draw them).

Fonts: Anton and Barlow Condensed (SIL Open Font License, design/fonts/).
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'design' / 'fonts'
W, H = 1200, 630
CUPS = {
    # cup -> (file, logo, background, accent for the name, colour of the season line)
    'dbck': ('dobele', 'dbck-logo.webp', (32, 78, 153), (225, 185, 66), (255, 255, 255)),
    'jssc': ('jelgava', 'jssc-logo.webp', (156, 33, 61), (255, 255, 255), (183, 202, 255)),
}


def ridge(seed, top):
    """Jagged edge like the site's hero (tools/build.py ridge), scaled to the image."""
    rng = random.Random(seed)
    x, pts = 0.0, [(0, top + 34)]
    while x < W:
        x += rng.uniform(28, 74) * W / 1440
        spike = rng.random() < 0.18
        y = top + 34 - (22 if spike else rng.uniform(-8, 12))
        pts.append((min(x, W), y))
    return [(0, H)] + pts + [(W, H)]


def two_lines(words, font, draw):
    """Split the name into two lines of about the same width."""
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        w = max(draw.textlength(a, font=font), draw.textlength(b, font=font))
        if best is None or w < best[0]:
            best = (w, [a, b])
    return best[1] if best else [' '.join(words)]


def spaced(draw, xy, text, font, fill, spacing):
    """Text with letter spacing, centred on xy[0]."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = xy[0] - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, xy[1]), ch, font=font, fill=fill)
        x += w + spacing


def make(cup, name, season):
    file, logo, bg, accent, eyebrow = CUPS[cup]
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im, 'RGBA')
    # a darker top, like light falling on the court
    for y in range(H):
        a = int(70 * (1 - y / H) ** 2)
        d.line([(0, y), (W, y)], fill=(0, 0, 0, a))
    # court lines (as in the site's hero pattern)
    for cx, cy, r in ((1040, 250, 210), (1040, 250, 60), (160, 250, 210), (160, 250, 60)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, 20), width=4)
    lg = Image.open(ROOT / 'assets' / logo).convert('RGBA').resize((210, 210), Image.LANCZOS)
    im.paste(lg, ((W - 210) // 2, 46), lg)
    title_font = ImageFont.truetype(str(FONTS / 'Anton-Regular.ttf'), 66)
    lines = two_lines(name.upper().split(), title_font, d)
    small = ImageFont.truetype(str(FONTS / 'BarlowCondensed-Bold.ttf'), 28)
    spaced(d, (W / 2, 272), 'SEZONA ' + season, small, eyebrow + (235,), 4)
    y = 318
    for line in lines:
        d.text((W / 2, y), line, font=title_font, fill=accent, anchor='ma')
        y += 82
    # the white ridge with the address
    d.polygon(ridge(7 if cup == 'dbck' else 11, 540), fill=(255, 255, 255))
    url = ImageFont.truetype(str(FONTS / 'BarlowCondensed-Bold.ttf'), 30)
    spaced(d, (W / 2, 588), 'DOBELESBASKETBOLS.LV', url, bg + (255,), 3)
    out = ROOT / 'assets' / 'og' / f'{file}.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    print(out.relative_to(ROOT), out.stat().st_size, 'bytes')


def main():
    sheet = json.loads((ROOT / 'src' / 'sheet.json').read_text())
    season = sheet['settings']['season']
    for cup in CUPS:
        make(cup, sheet['settings']['cups'][cup]['name'], season)


if __name__ == '__main__':
    main()
