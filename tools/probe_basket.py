"""One-off probe #2 (not part of the site): open a basket.lv match page, record
the Sportradar embed API calls (full URL + request headers + JSON), then try the
same URLs directly without a browser."""
import json, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('probe2'); OUT.mkdir(exist_ok=True)
BASE = 'https://regionalie.basket.lv/dobeles-atklatais-cempionats/kalendars/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
fx = json.loads(Path('probe/kalendars_data_04.txt').read_text())['data']['fixtures']
calls = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(user_agent=UA, locale='lv-LV')
    def visit(url, name):
        page = ctx.new_page(); n = [0]
        def on_resp(resp):
            if 'embed-api' not in resp.url: return
            n[0] += 1
            e = {'page': name, 'url': resp.url, 'method': resp.request.method, 'status': resp.status,
                 'req_headers': resp.request.headers, 'post': resp.request.post_data}
            try:
                body = resp.body(); fn = f'{name}_{n[0]:02d}.json'; (OUT / fn).write_bytes(body); e['saved'] = fn; e['bytes'] = len(body)
            except Exception as ex:
                e['err'] = str(ex)
            calls.append(e)
        page.on('response', on_resp)
        page.goto(url, wait_until='networkidle', timeout=90000); page.wait_for_timeout(5000)
        page.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
        # the match page may have tabs (box score / play-by-play): click any that look like it
        for label in ('Statistika', 'Spēlētāju statistika', 'Box score', 'Boxscore', 'Komandu statistika', 'Spēles gaita'):
            try:
                loc = page.get_by_text(label, exact=True)
                if loc.count():
                    loc.first.click(); page.wait_for_timeout(3500)
                    page.screenshot(path=str(OUT / f'{name}_{label.replace(" ", "_")}.png'), full_page=True)
            except Exception:
                pass
        (OUT / f'{name}_rendered.html').write_text(page.content())
        page.close()
    visit(BASE, 'list')
    for i, f in enumerate(fx[:2]):
        visit(BASE + '?' + f['link'].lstrip('&'), f'match{i + 1}')
    b.close()

# The same API calls without a browser: plain, and with the page as Referer/Origin.
direct = []
for c in calls:
    for label, hdr in (('plain', {'User-Agent': UA}),
                       ('referer', {'User-Agent': UA, 'Referer': 'https://regionalie.basket.lv/', 'Origin': 'https://regionalie.basket.lv'}),
                       ('same-headers', {k: v for k, v in c['req_headers'].items() if not k.startswith(':')})):
        try:
            req = urllib.request.Request(c['url'], headers=hdr)
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read(); direct.append({'url': c['url'], 'try': label, 'status': r.status, 'bytes': len(body)})
        except Exception as ex:
            direct.append({'url': c['url'], 'try': label, 'error': str(ex)[:200]})
(OUT / 'calls.json').write_text(json.dumps(calls, ensure_ascii=False, indent=1))
(OUT / 'direct.json').write_text(json.dumps(direct, ensure_ascii=False, indent=1))
print(json.dumps({'calls': [(c['page'], c['url'][:160], c['status'], c.get('bytes')) for c in calls], 'direct': direct}, ensure_ascii=False, indent=1))
