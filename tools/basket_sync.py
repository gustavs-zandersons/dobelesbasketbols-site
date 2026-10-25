"""Read the cups' games from basket.lv (regionalie.basket.lv).

    python3 tools/basket_sync.py                      # links + season from src/sheet.json
    python3 tools/basket_sync.py --link dbck=<url> --season 2025/26
    add --check to only report (nothing is written)

How basket.lv delivers the data (see the project doc BASKET_LV_READER.md): each
competition page embeds a Sportradar / Atrium widget
(<script data-synergy … data-website-id="233">) that loads plain JSON from
embed-api.eui.connect.sportradar.com. No browser and no key are needed.

Per cup and update:
  1. the page link (sheet: Iestatījumi → "DBČK/JSSC basket.lv saite") → website id
  2. the season named like the sheet's "Sezona" (2026/27 → "…2026/2027"); a page
     made for one season lists no seasons, and then its own season is used
  3. both of the season's game lists — "Kalendārs" (games still to play) and
     "Rezultāti" (played games): a game moves from the first to the second once
     it is played. Per game: date, time, hall, stage, group, round, teams, score,
     status
  4. the box score of every final game (status CONFIRMED) that is not saved yet;
     games from the last few days are read again in case a result was corrected

  5. the season's registered players per team (names only)

Writes src/basket/<cup>/fixtures.json (the list), src/basket/<cup>/roster.json
(teams and players) and src/basket/<cup>/games/<fixture id>.json (one per final
game). Only game data is kept: names and stat lines — no photos, no personal
details.

If basket.lv cannot be reached, the saved data stays as it is and the report
says so; the rest of the update carries on.
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = SRC / 'basket'
API = 'https://embed-api.eui.connect.sportradar.com/v1/embed/{wid}/{page}'
UA = 'dobelesbasketbols.lv data reader (+https://dobelesbasketbols.lv)'
CUPS = ('dbck', 'jssc')
CUP_NAMES = {'dbck': 'Čempionu kauss', 'jssc': 'Izaicinājuma kauss'}
PAUSE = 0.4            # seconds between requests: a light, polite load
RECHECK_DAYS = 7       # final games this recent are read again (late corrections)
FINAL = 'CONFIRMED'

# Box score row, the same order the site uses (minus the player index, which the
# site adds when it builds the rosters):
# seconds, pts, 2pm, 2pa, 3pm, 3pa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf, eff, +/-
STAT_KEYS = ('points', 'pointsTwoMade', 'pointsTwoAttempted', 'pointsThreeMade', 'pointsThreeAttempted',
             'freeThrowsMade', 'freeThrowsAttempted', 'reboundsOffensive', 'reboundsDefensive',
             'assists', 'steals', 'blocks', 'turnovers', 'foulsTotal', 'efficiency', 'plusMinus')


class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes = [], [], []

    def err(self, cup, msg):
        self.errors.append((cup, msg))

    def warn(self, cup, msg):
        self.warnings.append((cup, msg))

    def note(self, cup, msg):
        self.notes.append((cup, msg))

    def markdown(self):
        rows = lambda items: ['| Kauss | |', '|---|---|'] + [f'| {CUP_NAMES.get(c, c)} | {m} |' for c, m in items]
        out = ['## basket.lv']
        if self.errors:
            out += [f'\n### Kļūdas ({len(self.errors)})\n'] + rows(self.errors)
        if self.notes:
            out += ['\n**Kas nolasīts:**\n'] + [f'- {CUP_NAMES.get(c, c)}: {m}' for c, m in self.notes]
        if self.warnings:
            out += [f'\n### Brīdinājumi ({len(self.warnings)})\n'] + rows(self.warnings)
        return '\n'.join(out) + '\n'


# ---------------------------------------------------------------- helpers

def token(obj):
    """The widget's state parameter: base64url(zlib(JSON))."""
    raw = zlib.compress(json.dumps(obj).encode())
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def seconds(iso):
    """'PT30M23S' -> 1823; None -> None."""
    if not iso:
        return None
    m = re.match(r'^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$', iso)
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h or 0) * 3600 + int(mi or 0) * 60 + round(float(s or 0))


def season_years(label):
    """'2026/27' -> (2026, 2027)."""
    m = re.match(r'^(\d{4})\s*/\s*(\d{2}|\d{4})$', str(label).strip())
    if not m:
        return None
    y1 = int(m.group(1))
    y2 = int(m.group(2)) if len(m.group(2)) == 4 else (y1 // 100) * 100 + int(m.group(2))
    return y1, y2


class Client:
    def __init__(self, offline=None):
        self.offline = Path(offline) if offline else None
        self.requests = 0

    def get(self, url, what, as_json=True):
        if self.offline:                      # tests: saved responses, keyed by URL
            index = json.loads((self.offline / 'index.json').read_text())
            body = (self.offline / index[url]).read_bytes()
        else:
            if self.requests:
                time.sleep(PAUSE)
            self.requests += 1
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'lv-LV',
                                                       'Referer': 'https://regionalie.basket.lv/'})
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    body = r.read()
            except urllib.error.HTTPError as e:
                raise ValueError(f'{what}: basket.lv atbildēja ar kļūdu {e.code}')
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                raise ValueError(f'{what}: neizdevās sasniegt basket.lv ({getattr(e, "reason", e)})')
        if not as_json:
            return body.decode('utf-8', 'replace')
        try:
            data = json.loads(body)
        except ValueError:
            raise ValueError(f'{what}: atbilde nav dati (JSON)')
        if not isinstance(data, dict) or 'data' not in data:
            raise ValueError(f'{what}: negaidīts datu formāts')
        return data['data']


# ---------------------------------------------------------------- reading

def website_id(client, link):
    html = client.get(link, 'Kausa lapa', as_json=False)
    m = re.search(r'data-website-id="(\d+)"', html)
    if not m:
        raise ValueError('kausa lapā neatradu basket.lv spēļu sarakstu (data-website-id). Vai saite ir uz kausa kalendāra lapu?')
    return m.group(1)


def pick_season(listing, years):
    seasons = ((listing.get('seasons') or {}).get('seasons')) or []
    y1, y2 = years
    for s in seasons:
        name = s.get('nameLocal') or ''
        if s.get('year') == y2 or re.search(rf'{y1}\.?\s*/\s*{y2}', name):
            return s
    return None


def norm_fixture(f, stages=None):
    comp = {('home' if c.get('isHome') else 'away'): c for c in f.get('competitors') or []}
    side = lambda c: {'name': (c.get('name') or '').strip(), 'code': c.get('code'), 'entity': c.get('entityId'),
                      'score': int(c['score']) if str(c.get('score') or '').isdigit() else None}
    return {
        'id': f['fixtureId'],
        'start': (f.get('startTimeLocal') or '')[:16],
        'utc': (f.get('startTimeUTC') or '')[:16],
        'venue': (f.get('venue') or '').strip(),
        'venueId': f.get('venueId'),
        'stage': (stages or {}).get(f.get('stageCode')) or f.get('stageCode'),
        'pool': (f.get('pool') or '').strip() or None,
        'round': f.get('round'),
        'type': f.get('fixtureType'),
        'status': (f.get('status') or {}).get('value'),
        'home': side(comp.get('home', {})),
        'away': side(comp.get('away', {})),
    }


def norm_game(detail, fx):
    """Box score of one final game in the site's shape (names, no photos)."""
    base = (((detail.get('statistics') or {}).get('data') or {}).get('base')) or {}
    fixture = detail.get('fixture') or {}
    ent = {('home' if c.get('isHome') else 'away'): c.get('entityId') for c in fixture.get('competitors') or []}
    quarters, ot = [], 0
    for p in sorted(detail.get('periodData') or [], key=lambda p: p.get('periodId') or 0):
        ts = p.get('teamScore') or {}
        if not p.get('started') and not ts:
            continue
        quarters.append([ts.get(ent.get('home'), 0), ts.get(ent.get('away'), 0)])
        if p.get('isOvertime'):
            ot += 1
    out = {'id': fx['id'], 'updated': fixture.get('updated'), 'quarters': quarters, 'ot': ot}
    for side in ('home', 'away'):
        b = base.get(side) or {}
        rows = []
        for grp in b.get('persons') or []:
            rows += grp.get('rows') or []
        players, dnp = [], []
        for r in rows:
            who = {'pid': r.get('personId'), 'name': (r.get('personName') or '').strip(), 'no': r.get('bib')}
            st = r.get('statistics') or {}
            if r.get('participated') and st:
                vals = [seconds(st.get('minutes')) or 0] + [st.get(k) if st.get(k) is not None else (None if k == 'plusMinus' else 0) for k in STAT_KEYS]
                players.append(dict(who, starter=bool(r.get('starter')), s=vals))
            else:
                dnp.append(dict(who, reason=r.get('didNotPlayReason')))
        extra = b.get('extra') or {}
        out[side] = {'entity': ent.get(side), 'players': players, 'dnp': dnp,
                     'teamReb': [extra.get('reboundsOffensive') or 0, extra.get('reboundsDefensive') or 0]}
    return out


def check_game(g, fx, rep, cup):
    """Box score adds up: players' points and quarter scores = the final score."""
    label = f'{fx["start"][:10]} {fx["home"]["name"]} – {fx["away"]["name"]}'
    for i, side in enumerate(('home', 'away')):
        score = fx[side]['score']
        pts = sum(p['s'][1] for p in g[side]['players'])
        if score is not None and pts != score:
            rep.warn(cup, f'{label}: spēlētāju punkti ({pts}) nesakrīt ar rezultātu ({score}).')
        if g['quarters'] and score is not None and sum(q[i] for q in g['quarters']) != score:
            rep.warn(cup, f'{label}: ceturtdaļu summa nesakrīt ar rezultātu.')
        if not g[side]['players']:
            rep.warn(cup, f'{label}: basket.lv vēl nav spēlētāju statistikas.')


def read_cup(client, cup, link, years, rep, check_only, today):
    wid = website_id(client, link)
    listing = client.get(API.format(wid=wid, page='fixtures'), 'Spēļu saraksts')
    season = pick_season(listing, years)
    listed = (listing.get('seasons') or {}).get('seasons') or []
    if not season and listed:
        names = ', '.join(s.get('nameLocal', '?') for s in listed)
        rep.warn(cup, f'basket.lv vēl nav sezonas {years[0]}/{years[1]} (ir: {names}). Kad to izveidos, spēles parādīsies.')
        return None
    if not season:
        # A page made for one season lists no seasons: the season it shows is its own.
        season = {'seasonId': listing.get('seasonId'), 'nameLocal': f'{years[0]}/{years[1]}'}
    # The season's two lists: games still to play and played games. A game moves
    # from the first to the second once it is played, so both are read.
    by_id, stages = {}, {}
    for sub, label in (('FIXTURES', 'Kalendārs'), ('RESULTS', 'Rezultāti')):
        part = client.get(API.format(wid=wid, page='fixtures') + '?state=' +
                          token({'s': season['seasonId'], 'l': 'lv-LV', 'z': sub}), f'Spēļu saraksts ({label})')
        for o in ((part.get('stageTabs') or {}).get('options')) or []:
            if o.get('value') not in (None, 'All'):
                stages[o['value']] = o.get('label')
        for f in part.get('fixtures') or []:
            by_id[f['fixtureId']] = f              # a played game: the Rezultāti copy wins
    fixtures = [norm_fixture(f, stages) for f in by_id.values()]
    fixtures.sort(key=lambda f: (f['start'], f['id']))
    if not listed:
        lo, hi = f'{years[0]}-08-01', f'{years[1]}-07-31'
        odd = [f for f in fixtures if f['start'] and not lo <= f['start'][:10] <= hi]
        if odd:
            rep.warn(cup, f'basket.lv lapā ir spēles ārpus sezonas {years[0]}/{years[1]} (piem., {odd[0]["start"][:10]}). '
                          'Vai saite ir uz šīs sezonas kausa lapu? Mājaslapā paliek iepriekš nolasītie dati.')
            return None
    gdir = OUT / cup / 'games'
    saved = {p.stem for p in gdir.glob('*.json')} if gdir.exists() else set()
    recent = (today - timedelta(days=RECHECK_DAYS)).isoformat()
    games, fetched = {}, 0
    for fx in fixtures:
        if fx['status'] != FINAL:
            continue
        if fx['id'] in saved and fx['start'][:10] < recent:
            continue                                   # saved once, never read again
        detail = client.get(API.format(wid=wid, page='fixture_detail') + '?state=' +
                            token({'s': season['seasonId'], 'l': 'lv-LV', 'f': fx['id']}), f'Spēle {fx["start"][:10]}')
        g = norm_game(detail, fx)
        check_game(g, fx, rep, cup)
        games[fx['id']] = g
        fetched += 1
    roster = read_roster(client, wid, season['seasonId'], rep, cup)
    final = sum(1 for f in fixtures if f['status'] == FINAL)
    rep.note(cup, f'sezona „{season.get("nameLocal")}”: {len(fixtures)} spēles, {final} ar galīgo rezultātu; '
                  f'nolasītas {fetched} spēļu statistikas'
                  + (f'; {len(roster["players"])} spēlētāji {len(roster["teams"])} komandās' if roster else '')
                  + f' ({client.requests} pieprasījumi).')
    if not check_only:
        (OUT / cup).mkdir(parents=True, exist_ok=True)
        gdir.mkdir(exist_ok=True)
        meta = {'cup': cup, 'link': link, 'websiteId': wid, 'season': {'id': season['seasonId'], 'name': season.get('nameLocal')}}
        write_json(OUT / cup / 'fixtures.json', dict(meta, fixtures=fixtures))
        if roster:
            write_json(OUT / cup / 'roster.json', roster)
        for gid, g in games.items():
            write_json(gdir / f'{gid}.json', g)
    return fixtures


def read_roster(client, wid, season_id, rep, cup):
    """The season's registered players (the cup's "Spēlētāji" page): person id, name
    and team only. basket.lv also lists birth dates, height, weight, nationality and
    photos — none of that is kept."""
    tok = token({'s': season_id, 'l': 'lv-LV'})
    try:
        ents = client.get(API.format(wid=wid, page='entities') + '?state=' + tok, 'Komandas')
        ppl = client.get(API.format(wid=wid, page='persons') + '?state=' + tok, 'Spēlētāji')
    except ValueError as e:
        rep.warn(cup, f'{e}. Spēlētāju saraksts paliek iepriekšējais.')
        return None
    teams = [{'entity': t.get('entityId'), 'name': (t.get('name') or '').strip()}
             for t in (ents.get('teams') or []) if t.get('entityId')]
    rows = ((ppl.get('persons') or {}).get('rows')) or []
    seen, players = set(), []
    for r in rows:
        pid, name = r.get('id'), (r.get('name') or '').strip()
        if not pid or not name or pid in seen:
            continue
        seen.add(pid)
        players.append({'pid': pid, 'name': name, 'entity': r.get('entityId'), 'team': (r.get('teamName') or '').strip()})
    players.sort(key=lambda p: (p['team'], p['name']))
    teams.sort(key=lambda t: t['name'])
    return {'teams': teams, 'players': players}


def write_json(path, obj):
    text = json.dumps(obj, ensure_ascii=False, indent=1) + '\n'
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--link', action='append', default=[], help='cup=URL (overrides the sheet), e.g. dbck=https://regionalie.basket.lv/…/kalendars/')
    ap.add_argument('--season', help='e.g. 2026/27 (overrides the sheet)')
    ap.add_argument('--check', action='store_true', help='only report, write nothing')
    ap.add_argument('--offline', help='folder with saved responses (tests)')
    ap.add_argument('--today', help='YYYY-MM-DD (tests)')
    args = ap.parse_args()

    sheet = json.loads((SRC / 'sheet.json').read_text())
    links = {cup: (sheet['settings']['cups'].get(cup, {}).get('basket') or '').strip() for cup in CUPS}
    for item in args.link:
        cup, _, url = item.partition('=')
        links[cup.strip()] = url.strip()
    years = season_years(args.season or sheet['settings'].get('season', ''))
    today = date.fromisoformat(args.today) if args.today else date.today()
    rep, client = Report(), Client(args.offline)
    if not years:
        rep.err('', f'nesaprotu sezonu „{args.season or sheet["settings"].get("season")}” (vajag, piem., 2026/27).')
    else:
        for cup in CUPS:
            if not links.get(cup):
                rep.note(cup, 'saite uz basket.lv nav norādīta (Iestatījumi) — izlaists.')
                continue
            try:
                read_cup(client, cup, links[cup], years, rep, args.check, today)
            except ValueError as e:
                rep.warn(cup, f'{e}. Mājaslapā paliek iepriekš nolasītie dati.')
    md = rep.markdown()
    print(md)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(md)
    return 1 if rep.errors else 0


if __name__ == '__main__':
    sys.exit(main())
