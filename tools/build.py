"""Build the site.

    python3 tools/build.py                 -> dist/               the live site (GitHub Pages)
    python3 tools/build.py --preview       -> dist-preview/       page fragment for Claude previews (demo season)
    python3 tools/build.py --preview-live  -> dist-preview-live/  page fragment with the real season

The live site uses the real season (src/season.json, built by tools/real-season.js
from the sheet and basket.lv) and today's date. It is one HTML page per address
(/, /jelgava/, /kalendars/, /dobele/komandas/valauto/, /speles/dbck-gr-01/ …), each
with its content already rendered (tools/prerender.py, a headless browser), its own
title, description, canonical address and link-preview tags, plus sitemap.xml,
robots.txt and 404.html. Styles, scripts and data are shared files under assets/.
In the browser the same app takes over and moves between pages without reloading.

Previews are a single file with everything inlined and the addresses after "#"
(#/dobele/komandas/valauto/). Without src/season.json the live build falls back to
the demo season as a single page with a fixed test date and the test notice.
"""
import argparse
import hashlib
import json
import random
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
import sys  # noqa: E402
sys.path.insert(0, str(ROOT / 'tools'))

# Fallback only (no src/season.json): mock "today" for the demo season.
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


LEVELS = ('Ģenerālsponsors', 'Atbalstītājs')


def sponsor_page(info, logos):
    """Sponsors page data: the sheet's "Sponsori" tab (src/sheet.json: level,
    order, description, links) joined with the web logos by id."""
    by_id = {s['id']: s for s in logos}
    out = []
    for r in sorted(info, key=lambda r: (LEVELS.index(r['level']), r.get('order') or 999)):
        logo = by_id[r['id']]
        out.append({'id': r['id'], 'name': r.get('name') or logo['name'], 'level': r['level'],
                    'description': r.get('description', '').strip(),
                    'links': {k: r[k].strip() for k in ('website', 'facebook', 'instagram', 'tiktok') if r.get(k, '').strip()},
                    'src': logo['src'], 'w': logo['w'], 'h': logo['h'], 'scale': logo.get('scale', 1)})
    return out


SOCIAL_ICONS = {
    'facebook': ('Facebook', 'M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z'),
    'instagram': ('Instagram', 'M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM16.8 3H7.2A4.2 4.2 0 0 0 3 7.2v9.6A4.2 4.2 0 0 0 7.2 21h9.6a4.2 4.2 0 0 0 4.2-4.2V7.2A4.2 4.2 0 0 0 16.8 3zm2.5 13.8a2.5 2.5 0 0 1-2.5 2.5H7.2a2.5 2.5 0 0 1-2.5-2.5V7.2a2.5 2.5 0 0 1 2.5-2.5h9.6a2.5 2.5 0 0 1 2.5 2.5v9.6z'),
    'youtube': ('YouTube', 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z'),
    'tiktok': ('TikTok', 'M16.6 3c.3 2.2 1.6 3.6 3.7 3.8v3.1a6.7 6.7 0 0 1-3.6-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7l.9.1v3.2a2.6 2.6 0 1 0 1.7 2.4V3h3z'),
}


def esc(text):
    return (text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


def socials_html(links):
    """Footer icons for the tournament's own pages (sheet: Iestatījumi). Empty = no icon."""
    rows = []
    for key, (label, path) in SOCIAL_ICONS.items():
        url = links.get(key, '')
        if url:
            rows.append(f'        <a class="social" href="{esc(url)}" target="_blank" rel="noopener" aria-label="{label}">\n'
                        f'          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="{path}"/></svg>\n        </a>')
    return ('      <div class="socials">\n' + '\n'.join(rows) + '\n      </div>') if rows else ''


def mvp_sponsor(name, by_name):
    """Round / monthly MVP sponsor for the dark strip above the MVP card: the
    logo version made for dark backgrounds (assets/sponsors/mvp-<id>-white.webp,
    or mvp-<id>.webp for a colour logo that already reads on dark), else the name."""
    if not name:
        return None
    sid, logo = by_name.get(name.casefold()), ''
    for fn in (f'mvp-{sid}-white.webp', f'mvp-{sid}.webp') if sid else ():
        if (ROOT / 'assets' / 'sponsors' / fn).exists():
            logo = f'assets/sponsors/{fn}'
            break
    return {'name': name, 'logo': logo}


def site_settings(sheet, sponsors):
    """Settings for the page script (sheet: Iestatījumi)."""
    st = sheet['settings']
    by_name = {s['name'].casefold(): s['id'] for s in sheet['sponsors']}
    cups = {}
    for cup in ('dbck', 'jssc'):
        c = st['cups'][cup]
        cups[cup] = {'name': c['name'], 'mvpSponsor': mvp_sponsor(c.get('mvpSponsor', ''), by_name),
                     'monthMvpSponsor': mvp_sponsor(c.get('monthMvpSponsor', ''), by_name)}
    return {'season': st['season'], 'cups': cups, 'sponsorsText': st.get('sponsorsText', '')}


def season_data(real):
    """The real season if it has been built, else the demo season. -> (data, is_real)"""
    path = SRC / 'season.json'
    if real and path.exists():
        return json.loads(path.read_text()), True
    return json.loads((SRC / 'sample-data.json').read_text()), False


SITE_URL = 'https://dobelesbasketbols.lv'
PAGE_LINKS = {'HOME': '/', 'JELGAVA': '/jelgava/', 'CAL': '/kalendars/', 'STD': '/dobele/kopvertejums/',
              'TM': '/dobele/komandas/', 'LD': '/dobele/lideri/', 'STS': '/dobele/statistika/', 'SP': '/dobele/sponsori/',
              'AB': '/par-mums/'}


def fill_links(page, paths):
    """Menu and header links: real paths on the live site, "#/path" in previews."""
    for key, path in PAGE_LINKS.items():
        page = page.replace('{{HREF_' + key + '}}', path if paths else '#' + path)
    return page


def inline_fonts(css):
    """Previews are a single file: the fonts go into the styles as data URLs."""
    import base64

    def data_url(m):
        raw = (ROOT / 'assets' / 'fonts' / m.group(1)).read_bytes()
        return 'url(data:font/woff2;base64,' + base64.b64encode(raw).decode() + ')'
    return re.sub(r'url\(/assets/fonts/([\w.-]+\.woff2)\)', data_url, css)


def render(preview, real):
    tpl = fill_links((SRC / 'template.html').read_text(), paths=False)
    if preview:   # no font preloads in a single-file preview (the fonts are inlined)
        tpl = '\n'.join(line for line in tpl.split('\n') if 'rel="preload"' not in line)
    css = (SRC / 'styles.css').read_text()
    data, real = season_data(real)
    sheet = json.loads((SRC / 'sheet.json').read_text())
    sponsors = json.loads((SRC / 'sponsors.json').read_text())
    photos = json.loads((SRC / 'poster-photos.json').read_text())
    data['settings'] = site_settings(sheet, sponsors)
    footer = sheet['settings'].get('footer', {})
    names = data['settings']['cups']
    page = (tpl
            .replace('{{STYLE}}', inline_fonts(css) if preview else css)
            .replace('{{ENGINE}}', (SRC / 'engine.js').read_text())
            .replace('{{POSTER}}', (SRC / 'poster.js').read_text())
            .replace('{{APP}}', (SRC / 'app.js').read_text())
            .replace('{{DATA}}', as_json(data))
            .replace('{{POSTER_DATA}}', as_json({'sponsors': sponsors, 'photos': photos}))
            .replace('{{SPONSOR_DATA}}', as_json(sponsor_page(sheet['sponsors'], sponsors)))
            .replace('{{SEASON}}', esc(data['settings']['season']))
            .replace('{{DBCK_NAME}}', esc(names['dbck']['name']))
            .replace('{{JSSC_NAME}}', esc(names['jssc']['name']))
            .replace('{{FOOTER_TEXT}}', f'<p>{esc(footer["text"])}</p>' if footer.get('text') else '')
            .replace('{{SOCIALS}}', socials_html(footer.get('links', {})))
            .replace('{{SPONSORS_HTML}}', sponsors_html(sponsors))
            .replace('{{RIDGE_A}}', ridge(7))
            .replace('{{RIDGE_B}}', ridge(11, base=36, amp=24))
            .replace('{{NOTICE}}', '' if preview or real else NOTICE))
    head, body = page.split('<!--BODY-->', 1)
    if preview:
        return head + body
    return (HEAD.format(today_attr='' if real else f' data-today="{MOCK_TODAY}"')
            + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')


def site_parts():
    """Everything the live pages share: the template with settings filled in, styles,
    scripts and the data file."""
    data, real = season_data(True)
    sheet = json.loads((SRC / 'sheet.json').read_text())
    sponsors = json.loads((SRC / 'sponsors.json').read_text())
    photos = json.loads((SRC / 'poster-photos.json').read_text())
    data['settings'] = site_settings(sheet, sponsors)
    footer = sheet['settings'].get('footer', {})
    names = data['settings']['cups']
    tpl = fill_links((SRC / 'template.html').read_text(), paths=True)
    tpl = (tpl.replace('{{SEASON}}', esc(data['settings']['season']))
           .replace('{{DBCK_NAME}}', esc(names['dbck']['name']))
           .replace('{{JSSC_NAME}}', esc(names['jssc']['name']))
           .replace('{{FOOTER_TEXT}}', f'<p>{esc(footer["text"])}</p>' if footer.get('text') else '')
           .replace('{{SOCIALS}}', socials_html(footer.get('links', {})))
           .replace('{{SPONSORS_HTML}}', sponsors_html(sponsors))
           .replace('{{RIDGE_A}}', ridge(7))
           .replace('{{RIDGE_B}}', ridge(11, base=36, amp=24))
           .replace('{{NOTICE}}', ''))
    head, body = tpl.split('<!--BODY-->', 1)
    body = body[:body.index('<script id="season-data"')].rstrip() + '\n'
    fonts = [line.strip() for line in head.splitlines() if '/assets/fonts/' in line]   # font preloads
    site_data = {'season': data, 'poster': {'sponsors': sponsors, 'photos': photos},
                 'sponsors': sponsor_page(sheet['sponsors'], sponsors)}
    files = {
        'css': ('site', 'css', (SRC / 'styles.css').read_text()),
        'data': ('js/data', 'js', 'window.SITE_DATA = ' + as_json(site_data) + ';\n'),
        'engine': ('js/engine', 'js', (SRC / 'engine.js').read_text()),
        'poster': ('js/poster', 'js', (SRC / 'poster.js').read_text()),
        'app': ('js/app', 'js', (SRC / 'app.js').read_text()),
    }
    return real, body, fonts, files


def build_pages(out):
    """The live site: shared files under assets/ and one pre-rendered page per address."""
    real, body, fonts, files = site_parts()
    if not real:
        return False
    urls = {}
    for key, (name, ext, text) in files.items():
        h = hashlib.sha256(text.encode()).hexdigest()[:10]
        rel = f'assets/{name}.{h}.{ext}'
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        (out / rel).write_text(text)
        urls[key] = '/' + rel
    import prerender                       # tools/prerender.py (Playwright)
    n = prerender.prerender(out, SITE_URL, body, fonts, urls)
    print('pre-rendered', n, 'pages')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='build the fragment used for Claude previews (demo season)')
    ap.add_argument('--preview-live', action='store_true', help='build a preview fragment with the real season')
    args = ap.parse_args()
    out = ROOT / ('dist-preview-live' if args.preview_live else 'dist-preview' if args.preview else 'dist')
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    shutil.copytree(ROOT / 'assets', out / 'assets')
    live = not (args.preview or args.preview_live)
    if live:
        (out / '.nojekyll').write_text('')
        if build_pages(out):
            size = sum(f.stat().st_size for f in out.rglob('*.html'))
            print('built', out.relative_to(ROOT), len(list(out.rglob('*.html'))), 'pages,', size, 'bytes of HTML')
            return
    (out / 'index.html').write_text(render(not live, real=not args.preview))
    print('built', out.relative_to(ROOT), (out / 'index.html').stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
