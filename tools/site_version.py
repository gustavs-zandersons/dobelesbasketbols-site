"""Should this run publish the site? Compares the site's inputs with the live site.

    python3 tools/site_version.py            # decide; on "yes" also write dist/version.json
    python3 tools/site_version.py --force    # publish anyway (still writes version.json)
    python3 tools/site_version.py --show     # print this build's fingerprint only

Used by "Atjaunot datus no tabulas" (.github/workflows/sync.yml) after the build.
Prints the decision; in GitHub Actions also sets the step output publish=true|false
and adds a line to the job summary.

"Changed" means the site's inputs changed: src/ (the sheet's and basket.lv's data),
assets/ (logos, pictures) and tools/ (the code that builds the pages). Not the built
pages: they show today's date and time-stamps, so they differ every day even when
nothing else did. The fingerprint is published with the site as /version.json, and
the next run compares with it (SITE_URL, default https://dobelesbasketbols.lv).
If the live site has no version.json or can't be read, the run publishes.
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
INPUTS = ('src', 'assets', 'tools')
SITE_URL = os.environ.get('SITE_URL', 'https://dobelesbasketbols.lv').rstrip('/')


def fingerprint():
    """One SHA-256 over the site's inputs (paths and contents, in a fixed order)."""
    h = hashlib.sha256()
    for top in INPUTS:
        base = ROOT / top
        if not base.exists():
            continue
        for p in sorted(base.rglob('*')):
            if not p.is_file() or '__pycache__' in p.parts or p.suffix == '.pyc':
                continue
            h.update(p.relative_to(ROOT).as_posix().encode() + b'\0')
            h.update(hashlib.sha256(p.read_bytes()).digest())
    return h.hexdigest()


def live_version():
    """→ (dict or None, note)"""
    url = f'{SITE_URL}/version.json?t={int(time.time())}'
    req = urllib.request.Request(url, headers={'User-Agent': 'dobelesbasketbols.lv update'})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read()), ''
        except urllib.error.HTTPError as e:
            return None, f'mājaslapā nav version.json, HTTP {e.code}'
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
            if attempt == 2:
                return None, f'mājaslapas versiju neizdevās nolasīt: {e}'
            time.sleep(3)


def output(publish, line):
    print(line)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'publish={"true" if publish else "false"}\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(f'\n**Publicēšana:** {line}\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--force', action='store_true', help='publish even if nothing changed')
    ap.add_argument('--show', action='store_true', help='print the fingerprint and stop')
    args = ap.parse_args()

    version = fingerprint()
    if args.show:
        print(version)
        return
    if not (DIST / 'index.html').exists():
        sys.exit('No dist/index.html: build the site first (python3 tools/build.py).')

    live, note = live_version()
    if args.force:
        publish, line = True, 'publicēts pēc pieprasījuma (force).'
    elif live is None:
        publish, line = True, f'publicēts ({note}).'
    elif live.get('version') == version:
        publish, line = False, f'nav izmaiņu kopš {live.get("published", "?")} — nepublicē.'
    else:
        publish, line = True, 'publicēts: dati vai kods ir mainījušies.'

    if publish:
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        by = os.environ.get('GITHUB_EVENT_NAME', 'manual')
        (DIST / 'version.json').write_text(json.dumps({'version': version, 'published': now, 'by': by}) + '\n')
    output(publish, f'{line} (versija {version[:12]})')


if __name__ == '__main__':
    main()
