"""Pre-render every page of the live site (called by tools/build.py).

The site is one app (src/app.js) that renders each address in the browser. Search
engines and link previews (Facebook, WhatsApp) need each address to be a real page
with its content, title and description in the HTML. So the build opens the app in
a headless browser (Playwright / Chromium), visits every address the way a visitor
would, and saves what it shows:

    dist/index.html                                  /
    dist/jelgava/index.html                          /jelgava/
    dist/dobele/komandas/valauto/index.html          /dobele/komandas/valauto/
    dist/speles/2026-27/dbck-gr-01/index.html        /speles/2026-27/dbck-gr-01/   (games with a result)
    …
    dist/404.html, dist/sitemap.xml, dist/robots.txt

Each page loads the shared styles, data and scripts, so in the browser the app
takes over at once (and keeps moving between pages without reloads).

The browser: Playwright's own Chromium, or the system Chrome when
PRERENDER_CHANNEL=chrome (GitHub's runners have it, so CI only needs the
playwright package).
"""
import json
import os
import time
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

# Every address of the site, from the season data (runs in the page).
LIST_JS = r"""() => {
  const D = window.SITE_DATA.season;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Riga' });
  const ctx = window.Engine.create(D, today);
  const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const out = ['/', '/jelgava/', '/kalendars/'];
  for (const c of ['dobele', 'jelgava']) {
    for (const s of ['kopvertejums', 'komandas', 'lideri', 'statistika', 'statistika/komandas', 'sponsori']) out.push('/' + c + '/' + s + '/');
    for (const t of D.teams) {
      out.push('/' + c + '/komandas/' + t.id + '/');
      t.players.forEach(p => out.push('/' + c + '/speletaji/' + t.id + '/' + (p.key || slug(p.name)) + '/'));
    }
  }
  const season = String(D.settings.season || D.season).replace('/', '-');
  ctx.games().filter(g => g.final).forEach(g => out.push('/speles/' + season + '/' + g.id + '/'));
  return out;
}"""

# Visit one address and return what the page shows (views that aren't shown are emptied).
VISIT_JS = r"""(path) => {
  window.__pageMeta = null;
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
  const body = document.body.cloneNode(true);
  body.querySelectorAll('main[hidden]:not(#main)').forEach(e => { e.innerHTML = ''; });
  const main = body.querySelector('#main');
  if (main && main.hasAttribute('hidden')) main.querySelectorAll('section').forEach(e => { e.innerHTML = ''; });
  body.querySelectorAll('#main section[hidden], #sheet').forEach(e => { e.innerHTML = ''; });
  // The home page's banner, when not shown: keep its frame (the app fills it on the home page), drop the text.
  const hero = body.querySelector('.hero');
  if (hero && hero.hasAttribute('hidden')) ['#hero-title', '#season-bar'].forEach(sel => { const e = hero.querySelector(sel); if (e) e.innerHTML = ''; });
  body.querySelectorAll('script').forEach(e => e.remove());
  const attrs = {};
  for (const a of document.documentElement.attributes) attrs[a.name] = a.value;
  return { at: location.pathname, meta: window.__pageMeta, body: body.innerHTML, attrs };
}"""

OG_W, OG_H = 1200, 630


def attr(v):
    return escape(str(v), quote=True)


def shell(body, fonts, urls):
    """The page the browser starts from (content comes from the app)."""
    return ('<!doctype html><html lang="lv" data-paths><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1"><base href="/">'
            f'<link rel="stylesheet" href="{urls["css"]}"></head><body>' + body +
            ''.join(f'<script src="{urls[k]}"></script>' for k in ('data', 'engine', 'poster', 'app')) +
            '</body></html>')


def page(site, meta, attrs, body, fonts, urls, path=None):
    """One finished page."""
    attrs = dict(attrs)
    attrs.setdefault('lang', 'lv')
    attrs['data-paths'] = ''
    html_attrs = ''.join(f' {k}="{attr(v)}"' if v != '' else f' {k}' for k, v in attrs.items())
    canon = site + meta['path'] if meta.get('path') else None
    url = canon or (site + path if path else site + '/')
    head = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<base href="/">',
        f'<title>{escape(meta["title"])}</title>',
        f'<meta name="description" content="{attr(meta["desc"])}">',
        f'<meta name="robots" content="{"index, follow" if meta.get("index") else "noindex, follow"}">',
    ]
    if canon:
        head.append(f'<link rel="canonical" href="{attr(canon)}">')
    head += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Dobeles basketbols">',
        '<meta property="og:locale" content="lv_LV">',
        f'<meta property="og:title" content="{attr(meta["title"])}">',
        f'<meta property="og:description" content="{attr(meta["desc"])}">',
        f'<meta property="og:url" content="{attr(url)}">',
        f'<meta property="og:image" content="{attr(meta["image"])}">',
        f'<meta property="og:image:width" content="{OG_W}">',
        f'<meta property="og:image:height" content="{OG_H}">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="#112C5B">',
        '<link rel="icon" type="image/webp" href="/assets/dbck-mark.webp">',
    ] + fonts + [f'<link rel="stylesheet" href="{urls["css"]}">']
    if meta.get('ld'):
        ld = json.dumps({k: v for k, v in meta['ld'].items() if v is not None}, ensure_ascii=False).replace('<', '\\u003c')
        head.append(f'<script type="application/ld+json">{ld}</script>')
    scripts = ''.join(f'<script src="{urls[k]}"></script>' for k in ('data', 'engine', 'poster', 'app'))
    return (f'<!doctype html>\n<html{html_attrs}>\n<head>\n' + '\n'.join(head) + '\n</head>\n<body>\n' +
            body.strip() + '\n' + scripts + '\n</body>\n</html>\n')


def prerender(out, site, body, fonts, urls):
    out = Path(out)
    start = time.time()
    html = shell(body, fonts, urls)
    errors = []
    written, indexed = 0, []
    with sync_playwright() as p:
        channel = os.environ.get('PRERENDER_CHANNEL') or None
        try:
            browser = p.chromium.launch(channel=channel)
        except Exception as e:             # e.g. no system Chrome: use Playwright's own Chromium
            if not channel:
                raise
            print(f'prerender: browser "{channel}" not available ({str(e).splitlines()[0]}); using Playwright Chromium')
            browser = p.chromium.launch()
        pg = browser.new_page(viewport={'width': 1280, 'height': 900}, locale='lv-LV', timezone_id='Europe/Riga')
        pg.add_init_script('window.__PRERENDER = true;')
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)

        def handle(route):
            u = urlparse(route.request.url)
            if route.request.url.startswith(site) and u.path.startswith('/assets/'):
                f = out / u.path.lstrip('/')
                if f.is_file():
                    ctype = {'.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png',
                             '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'}.get(f.suffix, 'application/octet-stream')
                    return route.fulfill(status=200, body=f.read_bytes(), headers={'content-type': ctype})
                return route.fulfill(status=404, body='')
            if route.request.url.startswith(site):
                return route.fulfill(status=200, body=html, headers={'content-type': 'text/html; charset=utf-8'})
            return route.abort()           # fonts and anything else outside the site
        pg.route('**/*', handle)
        pg.goto(site + '/')
        pg.wait_for_function('window.__pageMeta && window.__pageMeta.title')
        paths = pg.evaluate(LIST_JS)
        for path in paths:
            r = pg.evaluate(VISIT_JS, path)
            if r['at'] != path or not r['meta']:
                continue                   # the app sent this address elsewhere (e.g. a game without a result)
            f = out / path.lstrip('/') / 'index.html'
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(page(site, r['meta'], r['attrs'], r['body'], fonts, urls, path))
            written += 1
            if r['meta'].get('index') and r['meta'].get('path') == path:
                indexed.append(path)
        # Not found: GitHub Pages serves 404.html for any unknown address.
        r = pg.evaluate(VISIT_JS, '/lapa-nav-atrasta/')
        r['meta']['index'] = False
        r['meta']['path'] = None
        (out / '404.html').write_text(page(site, r['meta'], r['attrs'], r['body'], fonts, urls))
        browser.close()
    # /dobele/ is the same as the front page
    d = out / 'dobele' / 'index.html'
    d.parent.mkdir(parents=True, exist_ok=True)
    d.write_text('<!doctype html>\n<html lang="lv"><head><meta charset="utf-8"><title>Dobeles basketbols</title>'
                 f'<link rel="canonical" href="{site}/"><meta name="robots" content="noindex">'
                 '<meta http-equiv="refresh" content="0; url=/"></head>'
                 '<body><a href="/">Dobeles Basketbola čempionu kauss</a></body></html>\n')
    (out / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        ''.join(f'  <url><loc>{escape(site + p)}</loc></url>\n' for p in indexed) + '</urlset>\n')
    (out / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {site}/sitemap.xml\n')
    if errors:
        raise SystemExit('Pre-rendering found script errors:\n' + '\n'.join(sorted(set(errors))[:20]))
    print(f'prerender: {written} pages ({len(indexed)} in the sitemap) in {time.time() - start:.1f} s')
    return written
