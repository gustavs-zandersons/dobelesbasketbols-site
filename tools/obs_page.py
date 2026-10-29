"""The OBS operator's page: dist/obs/index.html (called by tools/prerender.py).

Also the half-time screens, one per cup (dist/obs/partraukums-<cup>.png), always
listed at the bottom of the page.

Not in the menu, the sitemap or search results — the organisers share the link
(https://dobelesbasketbols.lv/obs/) with whoever runs OBS. It lists the coming
game day's pre-game overlays (dist/obs/<game id>.png, drawn by
Poster.renderOverlay) with a download button each and one ZIP per game day
(dist/obs/<date>.zip). The page picks the coming game day itself, by the
visitor's date, so it stays right between site updates; "Rādīt visas" shows
every game whose teams are known.
"""
import json
import re
import unicodedata
import zipfile
from datetime import date
from html import escape
from pathlib import Path

WEEKDAYS = ['Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena', 'Svētdiena']
CUPS = {'dbck': 'Dobeles basketbola čempionu kauss', 'jssc': 'JSSC Izaicinājuma kauss'}


def slug(text):
    t = unicodedata.normalize('NFD', str(text)).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def file_name(g):
    """What the operator's download is called: 2026-11-01_11-00_lietus-spriditis.png"""
    return f'{g["date"]}_{g["time"].replace(":", "-")}_{slug(g["homeShort"])}-{slug(g["awayShort"])}.png'


def day_label(d):
    y, m, dd = (int(x) for x in d.split('-'))
    return f'{WEEKDAYS[date(y, m, dd).weekday()]}, {dd:02d}.{m:02d}.{y}'


CSS = """
@font-face { font-family: 'Barlow'; font-weight: 500; font-display: swap; src: url(/assets/fonts/barlow-500.woff2) format('woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 700; font-display: swap; src: url(/assets/fonts/barlow-700.woff2) format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; font-display: swap; src: url(/assets/fonts/barlow-condensed-700.woff2) format('woff2'); }
:root { --bg: #121212; --card: #1E1E1E; --line: #333; --text: #F2F2F2; --muted: #A8A8A8; --accent: #E9B716; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 500 16px/1.5 'Barlow', system-ui, sans-serif; }
main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font: 700 34px/1.1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 0 0 8px; }
.lead { color: var(--muted); margin: 0 0 24px; max-width: 760px; }
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 32px 0 16px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
h2 { font: 700 26px/1.2 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 0; }
h2 small { display: block; font: 500 15px/1.4 'Barlow', sans-serif; text-transform: none; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.shot { aspect-ratio: 16 / 9; background: #555 url(/assets/posters/plakats-03.jpg) center / cover; }
.shot img { width: 100%; height: 100%; display: block; }
.info { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.teams { font: 700 22px/1.2 'Barlow Condensed', sans-serif; text-transform: uppercase; }
.teams b { color: var(--accent); margin-right: 8px; }
.stage { color: var(--muted); font-size: 14px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 8px;
       background: var(--accent); color: #111; font: 700 16px/1 'Barlow', sans-serif; text-decoration: none; margin-top: auto; }
.btn.ghost { background: transparent; color: var(--text); border: 1px solid #555; }
.btn:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.empty { color: var(--muted); padding: 24px 0; }
.foot { margin-top: 40px; display: flex; justify-content: center; }
[hidden] { display: none !important; }
"""

JS = """
(function () {
  var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Riga' });
  var days = Array.prototype.slice.call(document.querySelectorAll('section[data-date]'));
  var coming = days.filter(function (s) { return s.dataset.date >= today; });
  var first = coming[0];
  var limit = first ? new Date(Date.parse(first.dataset.date) + 6 * 864e5).toISOString().slice(0, 10) : '';
  var shown = 0;
  days.forEach(function (s) {
    var on = !!first && s.dataset.date >= first.dataset.date && s.dataset.date <= limit;
    s.hidden = !on; if (on) shown++;
  });
  document.getElementById('empty').hidden = shown > 0;
  var all = document.getElementById('all');
  all.hidden = coming.length <= shown;
  all.addEventListener('click', function (e) {
    e.preventDefault();
    coming.forEach(function (s) { s.hidden = false; });
    all.hidden = true;
  });
})();
"""


BREAKS = {'dbck': ('dobele', 'Dobeles basketbola čempionu kauss'), 'jssc': ('jelgava', 'JSSC Izaicinājuma kauss')}


def build(out, games, made, breaks=None):
    """games: the feed's games; made: {game id: PNG bytes}; breaks: {cup: PNG bytes}
    (half-time screens). Writes the page, the PNGs and one ZIP per game day."""
    d = Path(out) / 'obs'
    d.mkdir(parents=True, exist_ok=True)
    listed = [g for g in games if g['id'] in made]
    by_day = {}
    for g in listed:
        (d / f'{g["id"]}.png').write_bytes(made[g['id']])
        by_day.setdefault(g['date'], []).append(g)
    sections = []
    for day in sorted(by_day):
        day_games = sorted(by_day[day], key=lambda g: g['time'])
        with zipfile.ZipFile(d / f'{day}.zip', 'w', zipfile.ZIP_STORED) as z:   # PNGs are compressed already
            for g in day_games:
                z.writestr(file_name(g), made[g['id']])
        halls = ', '.join(dict.fromkeys(g.get('venue') or '' for g in day_games if g.get('venue')))
        cards = []
        for g in day_games:
            name = file_name(g)
            alt = f'{g["homeShort"]} pret {g["awayShort"]}, {g["time"]}'
            cards.append(
                '<article class="card">'
                f'<div class="shot"><img src="/obs/{g["id"]}.png" alt="{escape(alt)}" loading="lazy" width="1920" height="1080"></div>'
                '<div class="info">'
                f'<div class="teams"><b>{escape(g["time"])}</b>{escape(g["homeShort"])} – {escape(g["awayShort"])}</div>'
                f'<div class="stage">{escape(CUPS.get(g["comp"], ""))} · {escape(g.get("stage") or "")}</div>'
                f'<a class="btn" href="/obs/{g["id"]}.png" download="{escape(name)}">Lejupielādēt PNG</a>'
                '</div></article>')
        sections.append(
            f'<section data-date="{day}">'
            '<div class="bar">'
            f'<h2>{escape(day_label(day))}<small>{escape(halls)} · {len(day_games)} spēles</small></h2>'
            f'<a class="btn ghost" href="/obs/{day}.zip" download="obs-{day}.zip">Lejupielādēt visas (ZIP)</a>'
            '</div>'
            '<div class="grid">' + ''.join(cards) + '</div></section>')
    half = []
    for cup, png in (breaks or {}).items():
        key, name = BREAKS[cup]
        (d / f'partraukums-{key}.png').write_bytes(png)
        half.append(
            '<article class="card">'
            f'<div class="shot"><img src="/obs/partraukums-{key}.png" alt="Pārtraukums — {escape(name)}" loading="lazy" width="1920" height="1080"></div>'
            '<div class="info">'
            f'<div class="teams">{escape(name)}</div>'
            '<div class="stage">Pārtraukuma ekrāns — visām šī kausa spēlēm</div>'
            f'<a class="btn" href="/obs/partraukums-{key}.png" download="partraukums-{key}.png">Lejupielādēt PNG</a>'
            '</div></article>')
    half_html = ('<section class="always">'
                 '<div class="bar"><h2>Pārtraukums<small>Viens ekrāns katram kausam, visām spēlēm — nemainās</small></h2></div>'
                 '<div class="grid">' + ''.join(half) + '</div></section>') if half else ''
    html = (
        '<!doctype html>\n<html lang="lv">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        '<title>OBS pirmsspēles ekrāni — Dobeles basketbols</title>\n'
        '<link rel="icon" type="image/webp" href="/assets/dbck-mark.webp">\n'
        f'<style>{CSS}</style>\n</head>\n<body>\n<main>\n'
        '<h1>OBS pirmsspēles ekrāni</h1>\n'
        '<p class="lead">Ekrāns, ko rāda no tiešraides sākuma līdz spēles sākumam: komandas un sponsori. '
        'Lejupielādē attēlu un pievieno OBS kā attēla avotu (Image) virs kameras — tā fons ir daļēji caurspīdīgs. '
        'Laiku līdz spēles sākumam rāda OBS taimeris zem uzraksta „Spēle sāksies pēc:”. '
        'Pārtraukuma ekrāni abiem kausiem — lapas apakšā.</p>\n'
        + '\n'.join(sections) +
        '\n<p class="empty" id="empty" hidden>Tuvākajā laikā nav spēļu, kurām abas komandas jau zināmas.</p>\n'
        '<div class="foot"><a class="btn ghost" id="all" href="#" hidden>Rādīt visas nākamās spēles</a></div>\n'
        + half_html +
        f'\n</main>\n<script>{JS}</script>\n</body>\n</html>\n')
    (d / 'index.html').write_text(html)
    return len(listed), len(by_day)
