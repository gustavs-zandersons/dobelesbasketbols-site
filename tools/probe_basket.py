"""One-off probe (not part of the site): how regionalie.basket.lv delivers its
schedule, results and box scores. Saves raw HTML, the rendered page, and every
data request the page makes, so the reader can be built against the real thing."""
import json, re, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('probe'); OUT.mkdir(exist_ok=True)
BASE = 'https://regionalie.basket.lv/dobeles-atklatais-cempionats/'
PAGES = ['kalendars/', 'tabula/', 'speletaju-statistika/']
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

def raw(url, name):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            (OUT / name).write_bytes(body)
            return r.status, len(body)
    except Exception as e:
        return str(e), 0

summary = {'raw': {}, 'pages': {}}
for p in PAGES:
    summary['raw'][p] = raw(BASE + p, 'raw_' + p.strip('/').replace('/', '_') + '.html')

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(user_agent=UA, locale='lv-LV')
    def visit(url, name, follow=0):
        page = ctx.new_page(); reqs = []; n = [0]
        def on_resp(resp):
            rt = resp.request.resource_type
            entry = {'url': resp.url, 'method': resp.request.method, 'type': rt, 'status': resp.status,
                     'ctype': resp.headers.get('content-type', ''), 'post': resp.request.post_data}
            if rt in ('xhr', 'fetch') or 'json' in entry['ctype']:
                try:
                    body = resp.body(); n[0] += 1
                    fn = f'{name}_data_{n[0]:02d}.txt'
                    (OUT / fn).write_bytes(body[:3_000_000]); entry['saved'] = fn; entry['bytes'] = len(body)
                except Exception as e:
                    entry['err'] = str(e)
            reqs.append(entry)
        page.on('response', on_resp)
        page.goto(url, wait_until='networkidle', timeout=90000); page.wait_for_timeout(4000)
        (OUT / f'{name}_rendered.html').write_text(page.content())
        page.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
        links = page.eval_on_selector_all('a[href]', 'as => as.map(a => [a.textContent.trim().slice(0, 80), a.href])')
        (OUT / f'{name}_links.json').write_text(json.dumps(links, ensure_ascii=False, indent=1))
        (OUT / f'{name}_requests.json').write_text(json.dumps(reqs, ensure_ascii=False, indent=1))
        summary['pages'][name] = {'url': url, 'requests': len(reqs), 'data': [r['url'] for r in reqs if r.get('saved')][:40], 'links': len(links)}
        page.close()
        return links
    links = visit(BASE + 'kalendars/', 'kalendars')
    visit(BASE + 'tabula/', 'tabula')
    visit(BASE + 'speletaju-statistika/', 'stats')
    game_links = [h for _, h in links if re.search(r'/(spele|speles|game|match|protokols)', h, re.I)]
    summary['game_links_sample'] = game_links[:10]
    for i, h in enumerate(dict.fromkeys(game_links).keys()):
        if i >= 2: break
        visit(h, f'game{i + 1}')
    b.close()

(OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))
print(json.dumps(summary, ensure_ascii=False, indent=1))
