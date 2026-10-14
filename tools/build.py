"""Build the site.

    python3 tools/build.py            -> dist/          full standalone site (GitHub Pages)
    python3 tools/build.py --preview  -> dist-preview/  page fragment for Claude previews

The page is a single HTML file with styles, scripts and season data inlined,
plus the assets/ folder next to it.
"""
import argparse
import json
import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'

# Mock "today" for the test deployment: Dobele K group after round 1, next
# round = K group round 2 + the first Hope Cup semifinal; Challenge Cup after
# the first leg of the 1/8 finals, next round = second leg. Remove once real
# data syncs.
MOCK_TODAY = '2027-01-05'

NOTICE = ('<div class="test-note" role="note">Testa versija — rezultāti, spēlētāji un statistika ir izdomāti. '
          'Reālie dati parādīsies, kad sāksies sezona.</div>')

HEAD = """<!doctype html>
<html lang="lv"{today_attr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#112C5B">
<link rel="icon" type="image/webp" href="assets/dbck-mark.webp">
"""


def ridge(seed, base=34, amp=22):
    """Jagged 'mountain' edge like the tournament posters (viewBox 0 0 1440 60)."""
    rng = random.Random(seed)
    x, pts = 0.0, [(0, base)]
    while x < 1440:
        x += rng.uniform(28, 74)
        spike = rng.random() < 0.18
        y = base - (amp if spike else rng.uniform(-8, amp * 0.55))
        pts.append((min(x, 1440), max(2, min(58, y))))
    pts[-1] = (1440, pts[-1][1])
    return 'M0,60 ' + ' '.join(f'L{px:.0f},{py:.0f}' for px, py in pts) + ' L1440,60 Z'


def as_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def logo_size(s, area=5000, max_w=150, max_h=64):
    """Footer size for a logo so every sponsor gets about the same visual area."""
    r = s['w'] / s['h']
    h = (area / r) ** 0.5 * s.get('scale', 1)
    w = h * r
    if h > max_h:
        h, w = max_h, max_h * r
    if w > max_w:
        w, h = max_w, max_w / r
    return round(w), round(h)


def sponsors_html(sponsors):
    rows = []
    for s in sponsors:
        w, h = logo_size(s)
        rows.append(f'      <img src="{s["src"]}" alt="{s["name"]}" width="{w}" height="{h}" '
                    f'style="--w:{w};--h:{h}" loading="lazy">')
    return '\n'.join(rows)


def render(preview):
    tpl = (SRC / 'template.html').read_text()
    data = json.loads((SRC / 'sample-data.json').read_text())
    sponsors = json.loads((SRC / 'sponsors.json').read_text())
    photos = json.loads((SRC / 'poster-photos.json').read_text())
    page = (tpl
            .replace('{{STYLE}}', (SRC / 'styles.css').read_text())
            .replace('{{ENGINE}}', (SRC / 'engine.js').read_text())
            .replace('{{POSTER}}', (SRC / 'poster.js').read_text())
            .replace('{{APP}}', (SRC / 'app.js').read_text())
            .replace('{{DATA}}', as_json(data))
            .replace('{{POSTER_DATA}}', as_json({'sponsors': sponsors, 'photos': photos}))
            .replace('{{SPONSORS_HTML}}', sponsors_html(sponsors))
            .replace('{{RIDGE_A}}', ridge(7))
            .replace('{{RIDGE_B}}', ridge(11, base=36, amp=24))
            .replace('{{NOTICE}}', '' if preview else NOTICE))
    head, body = page.split('<!--BODY-->', 1)
    if preview:
        return head + body
    return (HEAD.format(today_attr=f' data-today="{MOCK_TODAY}"' if MOCK_TODAY else '')
            + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='build the fragment used for Claude previews')
    args = ap.parse_args()
    out = ROOT / ('dist-preview' if args.preview else 'dist')
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    (out / 'index.html').write_text(render(args.preview))
    shutil.copytree(ROOT / 'assets', out / 'assets')
    if not args.preview:
        (out / '.nojekyll').write_text('')
    print('built', out.relative_to(ROOT), (out / 'index.html').stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
