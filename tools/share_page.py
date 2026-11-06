"""One-file copy of a page to send to someone for checking before it goes live.

    python3 tools/build.py --preview-live
    python3 tools/share_page.py /par-mums/ share/par-mums.html

The file opens on its own (e-mail, messenger, downloaded) with no internet:
  * the page as it looks when opened is saved into the file, so it shows even
    where scripts do not run (e.g. some phone file previews);
  * where scripts run, the whole prototype works as usual (gallery, viewer,
    menu), with the pictures carried inside the file.
Posters, YouTube screens and the very largest photo copies are left out to
keep the file small.
"""
import base64
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'dist-preview-live'
SKIP = re.compile(r'^assets/(posters|youtube|og|fonts)/|-(2000|2560|1600)\.webp$')
TYPES = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml'}
ASSET_RE = re.compile(r'(?:\.?/)?assets/[A-Za-z0-9_\-/.]+?\.(?:webp|jpg|jpeg|png|svg)')

# Runs before the app: turns the carried pictures into blob: addresses and
# points every assets/... address the app writes at them (srcset lists keep
# only the copies that are in the file).
LOADER = r"""(function () {
  var D = window.ASSET_DATA || {}, M = {}, T = %s;
  Object.keys(D).forEach(function (k) {
    var b = atob(D[k]), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    M[k] = URL.createObjectURL(new Blob([u], { type: T[k.slice(k.lastIndexOf('.'))] || 'application/octet-stream' }));
  });
  window.ASSET_DATA = null;
  var RE = /(?:\.?\/)?assets\/[A-Za-z0-9_\-\/.]+?\.(?:webp|jpg|jpeg|png|svg)/g;
  function key(p) { return String(p).replace(/^\.?\//, ''); }
  function one(p) { return M[key(p)] || p; }
  function list(v) {
    return String(v).split(/,\s+/).filter(function (e) {
      var k = key(e.trim().split(/\s+/)[0]);
      return !/^assets\//.test(k) || M[k];
    }).map(function (e) { return e.replace(RE, one); }).join(', ');
  }
  function html(h) {
    return String(h).replace(/srcset="([^"]*)"/g, function (m, v) { return 'srcset="' + list(v) + '"'; }).replace(RE, one);
  }
  function wrap(proto, prop, fn) {
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { d.set.call(this, fn(v)); } });
  }
  wrap(Element.prototype, 'innerHTML', html);
  wrap(Element.prototype, 'outerHTML', html);
  wrap(HTMLImageElement.prototype, 'src', one);
  wrap(HTMLImageElement.prototype, 'srcset', list);
  wrap(HTMLSourceElement.prototype, 'srcset', list);
  var iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, h) { return iah.call(this, pos, html(h)); };
  var sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) {
    return sa.call(this, n, (n === 'src' || n === 'href') ? one(v) : n === 'srcset' ? list(v) : v);
  };
})();"""

# The page as it looks when opened, without the moving parts the app adds.
SNAPSHOT_JS = r"""() => {
  const b = document.body.cloneNode(true);
  b.querySelectorAll('script, #consent, #cookie-btn, #lb, [data-clone]').forEach(n => n.remove());
  b.querySelectorAll('.gal').forEach(g => g.classList.remove('is-sliding', 'is-dragging'));
  b.querySelectorAll('.gal-track').forEach(t => t.removeAttribute('style'));
  const h = document.documentElement;
  const attrs = {};
  for (const a of h.attributes) attrs[a.name] = a.value;
  attrs.class = (attrs.class || '').split(/\s+/).filter(c => c && c !== 'is-scrolled').join(' ');
  return { body: b.innerHTML, attrs, title: document.title };
}"""


def main(path, dest):
    page = (SRC / 'index.html').read_text()
    head_end = page.index('<header class="topbar">')
    scripts_at = page.index('<script id="season-data"')
    head, scripts = page[:head_end], page[scripts_at:]

    def serve(route):
        f = SRC / urlparse(route.request.url).path.lstrip('/')
        if not f.is_file():
            return route.fulfill(status=404, body='')
        ct = 'text/html; charset=utf-8' if f.suffix == '.html' else TYPES.get(f.suffix, 'application/octet-stream')
        route.fulfill(status=200, body=f.read_bytes(), headers={'content-type': ct})

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        ctx.route('**/*', lambda r: r.abort())
        ctx.route('http://share.local/**', serve)
        pg = ctx.new_page()
        pg.goto('http://share.local/index.html#' + path)
        pg.wait_for_timeout(1500)
        snap = pg.evaluate(SNAPSHOT_JS)
        browser.close()

    files = {}
    for f in sorted((SRC / 'assets').rglob('*')):
        k = f.relative_to(SRC).as_posix()
        if f.is_file() and f.suffix in TYPES and not SKIP.search(k):
            files[k] = f

    # Saved page: one picture per image (no srcset, no <source>), carried as data: addresses.
    body = re.sub(r'\s(?:srcset|sizes)="[^"]*"', '', snap['body'])
    body = re.sub(r'<source\b[^>]*>', '', body)

    def data_url(m):
        k = m.group(0).lstrip('./')
        f = SRC / k
        if not f.is_file():
            return m.group(0)
        return 'data:%s;base64,%s' % (TYPES[f.suffix], base64.b64encode(f.read_bytes()).decode())
    body = ASSET_RE.sub(data_url, body)

    data = {k: base64.b64encode(f.read_bytes()).decode() for k, f in files.items()}
    attrs = ' '.join('%s="%s"' % (k, v.replace('"', '&quot;')) if v else k for k, v in snap['attrs'].items())
    out = ('<!doctype html>\n<html %s>\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           '<meta name="robots" content="noindex">\n' % attrs
           + head.replace('<title>Dobeles basketbols</title>', '<title>%s</title>' % snap['title'], 1)
           + '<style>#consent, #cookie-btn { display: none !important; }</style>\n</head>\n<body>\n'
           + body
           + '\n<script>if (!/^#\\//.test(location.hash)) history.replaceState(null, "", "#%s");</script>\n' % path
           + '<script>window.ASSET_DATA = ' + json.dumps(data, separators=(',', ':')) + ';</script>\n'
           + '<script>' + LOADER % json.dumps(TYPES) + '</script>\n'
           + scripts + '\n</body>\n</html>\n')
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out)
    print('%s  %.1f MB  (%d pictures carried for the app)' % (dest, dest.stat().st_size / 1e6, len(files)))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
