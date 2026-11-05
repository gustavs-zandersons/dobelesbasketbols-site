"""Prepare web copies of team and sponsor logos and poster photos.

    python3 tools/prepare_assets.py youtube
        design/teams/<id>.png  ->  assets/youtube/teams/<id>.webp  (large logos for YouTube thumbnails)
    python3 tools/prepare_assets.py teams [<id> ...]
        design/teams/<id>.png (or .jpg/.webp)  ->  assets/teams/<id>.webp
        Trimmed to the logo, fitted into a 256 px square (same as logos that
        come in through the sheet). No ids = every original in design/teams.

    python3 tools/prepare_assets.py sponsors
        design/sponsors/<id>.png  ->  assets/sponsors/<id>.webp  (sizes updated in src/sponsors.json)
        Which sponsors, their names and order come from the season sheet
        (tools/sheet_sync.py writes src/sponsors.json); a new sponsor's logo
        normally comes in through the sheet's "Logo (saite)" column.

    python3 tools/prepare_assets.py photos --for next|results <file> [<file> ...] [--focus 0.4]
        adds photos to a poster pool:  assets/posters/<name>.jpg  + src/poster-photos.json
        "next" = next-round posters (photo strip on top), "results" = results
        posters (full photo). The two pools are kept separate.

    python3 tools/prepare_assets.py fonts
        design/fonts/*.ttf  ->  assets/fonts/*.woff2  (+ their licences)
        The site serves its own fonts: one file per weight holding every
        Latvian letter, so accents sit exactly where the font draws them.
        Needs fontTools and brotli (pip install fonttools brotli).

Logo originals stay in design/teams and design/sponsors (not published). The web copies are
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


def teams(ids):
    sys.path.insert(0, str(ROOT / 'tools'))
    from sheet_sync import make_logo
    src_dir = ROOT / 'design' / 'teams'
    files = {f.stem: f for f in src_dir.iterdir() if f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')}
    for tid in ids or sorted(files):
        webp, w, h, transparent = make_logo(files[tid].read_bytes(), 'teams')
        dest = ROOT / 'assets' / 'teams' / f'{tid}.webp'
        dest.write_bytes(webp)
        print(f'{tid:12s} {w}x{h}  {len(webp) // 1024} KB' + ('' if transparent else '  (no transparent background)'))


def youtube_teams():
    """Large team logos for the YouTube thumbnails (assets/youtube/teams/<id>.webp,
    trimmed, 600 px on the long side) from the originals in design/teams. The site's
    own copies are small (some only 160 px), which looks soft on a 1920×1080 thumbnail."""
    out_dir = ROOT / 'assets' / 'youtube' / 'teams'
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in sorted((ROOT / 'design' / 'teams').iterdir()):
        if f.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        im = trim(ImageOps.exif_transpose(Image.open(f)).convert('RGBA'))
        im.thumbnail((600, 600), Image.LANCZOS)
        dest = out_dir / f'{f.stem}.webp'
        im.save(dest, 'WEBP', quality=92, method=6)
        print(f'{f.stem:12s} {im.width}x{im.height}  {dest.stat().st_size // 1024} KB')


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


# Web fonts: (original in design/fonts, file in assets/fonts). Weights as used in src/styles.css.
FONTS = [
    ('Anton-Regular.ttf', 'anton-400.woff2'),
    ('Barlow-Regular.ttf', 'barlow-400.woff2'),
    ('Barlow-Medium.ttf', 'barlow-500.woff2'),
    ('Barlow-SemiBold.ttf', 'barlow-600.woff2'),
    ('Barlow-Bold.ttf', 'barlow-700.woff2'),
    ('BarlowCondensed-SemiBold.ttf', 'barlow-condensed-600.woff2'),
    ('BarlowCondensed-Bold.ttf', 'barlow-condensed-700.woff2'),
]
FONT_LICENCES = ['OFL-Anton.txt', 'OFL-Barlow.txt']
# Latin, Latin-1, Latin Extended-A (all Latvian letters and their neighbours),
# spacing and combining accents, punctuation („ ” – — … ›), €, arrows, maths signs.
FONT_UNICODES = ('U+0000-00FF,U+0100-017F,U+0218-021B,U+02C6-02DD,U+0300-0328,U+2000-206F,'
                 'U+20AC,U+2122,U+2190-2195,U+2212,U+2248,U+2260,U+2264-2265')


def fonts():
    import shutil
    from fontTools import subset
    out_dir = ROOT / 'assets' / 'fonts'
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']          # kerning and accent placement (mark/mkmk) stay in
    opts.name_IDs = ['*']                 # copyright and licence notices stay in the file
    opts.name_languages = ['*']
    opts.notdef_outline = True
    unicodes = subset.parse_unicodes(FONT_UNICODES)
    for src, dest in FONTS:
        font = subset.load_font(str(ROOT / 'design' / 'fonts' / src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        subset.save_font(font, str(out_dir / dest), opts)
        print(f'{dest:28s} {(out_dir / dest).stat().st_size // 1024} KB')
    for lic in FONT_LICENCES:
        shutil.copy(ROOT / 'design' / 'fonts' / lic, out_dir / lic)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['youtube']:
        youtube_teams()
    elif args[:1] == ['teams']:
        teams(args[1:])
    elif args[:1] == ['sponsors']:
        sponsors()
    elif args[:1] == ['fonts']:
        fonts()
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
