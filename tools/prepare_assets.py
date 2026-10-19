"""Prepare web copies of sponsor logos and poster photos.

    python3 tools/prepare_assets.py sponsors
        design/sponsors/<id>.png  ->  assets/sponsors/<id>.webp  (sizes updated in src/sponsors.json)
        Which sponsors, their names and order come from the season sheet
        (tools/sheet_sync.py writes src/sponsors.json); a new sponsor's logo
        normally comes in through the sheet's "Logo (saite)" column.

    python3 tools/prepare_assets.py photos --for next|results <file> [<file> ...] [--focus 0.4]
        adds photos to a poster pool:  assets/posters/<name>.jpg  + src/poster-photos.json
        "next" = next-round posters (photo strip on top), "results" = results
        posters (full photo). The two pools are kept separate.

Sponsor originals stay in design/sponsors (not published). The web copies are
trimmed to the logo itself, so the site can size every logo to the same visual
weight. Photos are resized to 2000 px on the long side; the originals are not kept.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent

LOGO_BOX = (400, 200)      # max size of a web copy (enough for 2x screens and the posters)
PHOTO_W, PHOTO_MAX_H = 2000, 2000   # long side 2000 px: enough for full-photo 1080×1920 posters


def trim(im, pad=0.02):
    """Crop to the visible logo (alpha > 8), keeping a small even margin."""
    alpha = im.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    box = alpha.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    p = round(max(x1 - x0, y1 - y0) * pad)
    return im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))


def sponsors():
    """Re-make the web copies from the originals in design/sponsors. The list,
    names, order and `scale` (a nudge for logos whose drawing is lighter or
    heavier than their box suggests) stay as they are in src/sponsors.json."""
    out_dir = ROOT / 'assets' / 'sponsors'
    mpath = ROOT / 'src' / 'sponsors.json'
    manifest = json.loads(mpath.read_text())
    for m in manifest:
        orig = ROOT / 'design' / 'sponsors' / f'{m["id"]}.png'
        if not orig.exists():
            print(f'{m["id"]:22s} no original in design/sponsors, kept as is')
            continue
        im = trim(Image.open(orig).convert('RGBA'))
        im.thumbnail(LOGO_BOX, Image.LANCZOS)
        dest = out_dir / f'{m["id"]}.webp'
        im.save(dest, 'WEBP', quality=86, method=6)
        m['w'], m['h'] = im.width, im.height
        print(f'{m["id"]:22s} {im.width}x{im.height}  {dest.stat().st_size // 1024} KB')
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')


def photos(files, focus, use):
    out_dir = ROOT / 'assets' / 'posters'
    out_dir.mkdir(parents=True, exist_ok=True)
    mpath = ROOT / 'src' / 'poster-photos.json'
    manifest = json.loads(mpath.read_text()) if mpath.exists() else []
    known = {m['src'] for m in manifest}
    for f in files:
        im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
        im.thumbnail((PHOTO_W, PHOTO_MAX_H), Image.LANCZOS)
        stem = re.sub(r'[^a-z0-9]+', '-', Path(f).stem.lower()).strip('-') or 'foto'
        dest = out_dir / f'{stem}.jpg'
        im.save(dest, 'JPEG', quality=82, optimize=True, progressive=True)
        src = f'assets/posters/{dest.name}'
        entry = {'src': src, 'w': im.width, 'h': im.height, 'focus': focus, 'use': [use]}
        manifest = [m for m in manifest if m['src'] != src] + [entry]
        print(('updated ' if src in known else 'added   ') + src, f'{im.width}x{im.height}', dest.stat().st_size // 1024, 'KB')
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['sponsors']:
        sponsors()
    elif args[:1] == ['photos']:
        focus, use = 0.4, None
        if '--focus' in args:
            i = args.index('--focus')
            focus = float(args[i + 1])
            args = args[:i] + args[i + 2:]
        if '--for' in args:
            i = args.index('--for')
            use = args[i + 1]
            args = args[:i] + args[i + 2:]
        if use not in ('next', 'results'):
            print('Say which pool: --for next  or  --for results')
            sys.exit(1)
        photos(args[1:], focus, use)
    else:
        print(__doc__)
        sys.exit(1)
