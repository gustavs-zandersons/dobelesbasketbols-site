"""The live scoreboard (called by tools/prerender.py after the OBS screens):

    dist/live/admin/index.html     the operator's controls, on a phone or tablet
    dist/live/overlay/index.html   the OBS browser source (1920×1080, transparent)
    dist/live/*.js, *.css          from src/live/ (ES modules, versioned by content)

Not in the menu, the sitemap or search results, like /obs/. Both pages carry the
season's teams and games (with logos and the /obs/ pre-game and break screens)
as JSON, so they need nothing else from the site. The game state itself lives in
Firebase (src/live/config.js, src/live/sync.js); the admin writes it, the overlay
reads it.
"""
import hashlib
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'live'

CUPS = {
    'dbck': {'name': 'Dobeles Basketbola Čempionu kauss', 'label': 'Dobeles Čempionu kauss · 2026/27',
             'logo': '/assets/dbck-mark.webp',
             'c1': '#E1B942', 'c2': '#204E99', 'ink': '#14284D', 'accent': '#E1B942', 'muted': '#C6D3EC'},
    'jssc': {'name': 'Jelgavas Sporta servisa centra Izaicinājuma kauss', 'label': 'JSSC Izaicinājuma kauss · 2026/27',
             'logo': '/assets/jssc-logo.webp',
             'c1': '#9C213D', 'c2': '#1E47B5', 'ink': '#5E1224', 'accent': '#B7CAFF', 'muted': '#F2CDD6'},
}
BREAKS = {'dbck': '/obs/partraukums-dobele.png', 'jssc': '/obs/partraukums-jelgava.png'}

ADMIN_BODY = """
<header class="top">
  <span class="brand">Scoreboard</span>
  <span class="status" id="status">Connecting</span>
  <h1 class="game-title" id="gameTitle"></h1>
  <div class="game-meta" id="gameMeta"></div>
</header>

<main class="wrap">
  <p class="banner" id="banner" role="alert" hidden></p>

  <section class="card signin" id="signin" hidden aria-labelledby="hSignin">
    <h1 id="hSignin">Sign in to run the scoreboard</h1>
    <p>Use the Google account the organisers added. You stay signed in on this device.</p>
    <button class="btn primary" type="button" id="signinBtn">Sign in with Google</button>
    <p class="err" id="signinErr" hidden></p>
  </section>

  <div class="cols" id="app" hidden>
    <div class="col col-a">
      <section class="card card-preview" aria-labelledby="hPreview">
        <div class="card-head">
          <h2 id="hPreview">Stream preview</h2>
          <button class="link-btn" id="togglePreview" type="button" aria-controls="preview" aria-expanded="true">Hide</button>
        </div>
        <div class="preview" id="preview"><div class="stage" id="stage"></div></div>
      </section>

      <section class="card card-screen" aria-labelledby="hScreen">
        <h2 id="hScreen">On screen</h2>
        <div class="scenes" role="group" aria-labelledby="hScreen">
          <button class="scene-btn" type="button" data-scene="pregame" aria-pressed="false">Pre-game</button>
          <button class="scene-btn" type="button" data-scene="live" aria-pressed="false">Scorebug</button>
          <button class="scene-btn" type="button" data-scene="break" aria-pressed="false">Break</button>
          <button class="scene-btn" type="button" data-scene="off" aria-pressed="false">Nothing</button>
        </div>

        <div class="panel" id="panelPregame">
          <div class="countdown"><span>Game starts in</span><strong id="countRead">0:00</strong></div>
          <div class="chips">
            <button class="btn" type="button" id="cdSchedule">At 11:00</button>
            <button class="btn" type="button" data-cd-in="5">5 min</button>
            <button class="btn" type="button" data-cd-in="10">10 min</button>
            <button class="btn" type="button" data-cd-in="15">15 min</button>
            <button class="btn" type="button" data-cd-in="30">30 min</button>
          </div>
          <div class="two">
            <button class="btn" type="button" data-cd-nudge="-1">−1 min</button>
            <button class="btn" type="button" data-cd-nudge="1">+1 min</button>
          </div>
          <p class="note" id="pregameNote"></p>
        </div>

        <div class="panel" id="panelLive" hidden>
          <div class="setting">
            <span id="lblLayout">Layout</span>
            <div class="seg" role="group" aria-labelledby="lblLayout">
              <button type="button" id="layoutCorner" aria-pressed="true">Corner</button>
              <button type="button" id="layoutBottom" aria-pressed="false">Bottom bar</button>
            </div>
          </div>
          <p class="note">Starting the clock switches to the scorebug by itself.</p>
        </div>

        <div class="panel" id="panelBreak" hidden>
          <p class="note" id="breakNote"></p>
        </div>
      </section>
    </div>

    <div class="col col-b">
      <section class="card card-score" aria-labelledby="hScore">
        <h2 id="hScore">Score</h2>
        <div class="teams">
          <div class="team-col" style="--tc: var(--c1); --tt: var(--c1-text)">
            <div class="team-head"><img id="logo0" alt=""><span class="nm" id="name0"></span><span class="sc" id="score0">0</span></div>
            <button class="pt" type="button" data-team="0" data-pts="1">+1</button>
            <button class="pt" type="button" data-team="0" data-pts="2">+2</button>
            <button class="pt" type="button" data-team="0" data-pts="3">+3</button>
            <button class="fix" type="button" data-team="0" data-pts="-1" id="fix0">−1 fix</button>
          </div>
          <div class="team-col" style="--tc: var(--c2); --tt: var(--c2-text)">
            <div class="team-head"><img id="logo1" alt=""><span class="nm" id="name1"></span><span class="sc" id="score1">0</span></div>
            <button class="pt" type="button" data-team="1" data-pts="1">+1</button>
            <button class="pt" type="button" data-team="1" data-pts="2">+2</button>
            <button class="pt" type="button" data-team="1" data-pts="3">+3</button>
            <button class="fix" type="button" data-team="1" data-pts="-1" id="fix1">−1 fix</button>
          </div>
        </div>
        <p class="qline" id="qline"></p>
        <button class="btn undo" id="undoBtn" type="button" disabled>Nothing to undo</button>
      </section>

      <section class="card card-clock" aria-labelledby="hClock">
        <h2 id="hClock">Clock and quarter</h2>
        <div class="row3">
          <button class="btn" type="button" id="minus1">−1 s</button>
          <button class="btn" type="button" id="plus1">+1 s</button>
          <button class="btn" type="button" id="setTimeBtn" aria-expanded="false" aria-controls="setTimeBox">Set time</button>
        </div>
        <form class="set-time" id="setTimeBox" hidden>
          <label class="sr" for="timeInput">Time left</label>
          <input id="timeInput" type="text" inputmode="decimal" autocomplete="off" placeholder="4:37">
          <button class="btn" type="submit">Set</button>
        </form>
        <p class="err" id="timeErr" hidden>Type the time left as minutes:seconds, for example 4:37 or 0:48.3.</p>
        <div class="quarter">
          <button class="btn" type="button" id="prevQ" aria-label="Previous quarter">◀</button>
          <div class="now" id="periodNow">Q1</div>
          <button class="btn" type="button" id="nextQ">Next: Q2</button>
        </div>
        <p class="hint" id="hint" hidden></p>
      </section>

      <section class="card card-setup" aria-labelledby="hSetup">
        <details id="setupDetails">
          <summary><h2 id="hSetup">Game setup</h2></summary>
          <div class="setup-body">
            <p class="note" id="testNote" hidden>Test mode: the scoreboard is not connected to Firebase yet, so changes stay on this device and OBS does not see them.</p>
            <div class="field">
              <label for="gameSelect">Game from the schedule</label>
              <select id="gameSelect"></select>
            </div>
            <button class="btn" type="button" id="loadGame">Load this game</button>
            <p class="note">Loading a game sets the teams, cup and countdown, shows the pre-game screen, and resets the score and clock.</p>
            <div class="setting">
              <span id="lblCup">Cup</span>
              <div class="seg" role="group" aria-labelledby="lblCup">
                <button type="button" id="cupDbck" aria-pressed="true">Dobele</button>
                <button type="button" id="cupJssc" aria-pressed="false">Jelgava</button>
              </div>
            </div>
            <div class="two">
              <div class="field">
                <label for="homeSel">Top / left team</label>
                <select id="homeSel"></select>
              </div>
              <div class="field">
                <label for="awaySel">Bottom / right team</label>
                <select id="awaySel"></select>
              </div>
            </div>
            <button class="btn" type="button" id="swapBtn">Swap sides</button>
            <button class="btn" type="button" id="newGameBtn">New game: reset score and clock</button>
            <div class="field">
              <span class="lbl">OBS: Browser source, 1920 × 1080</span>
              <div class="copy-row"><code id="obsUrl"></code><button class="btn" type="button" id="copyObs">Copy</button></div>
            </div>
            <div class="account" id="account" hidden>
              <span id="who"></span>
              <button class="btn" type="button" id="signoutBtn">Sign out</button>
            </div>
          </div>
        </details>
      </section>
    </div>
  </div>
</main>

<footer class="clockbar" id="clockbar" hidden>
  <div class="clockbar-in">
    <div class="clock-read"><span class="p" id="barPeriod">Q1</span><span class="t" id="barTime">10:00</span></div>
    <button id="clockBtn" type="button">Start clock</button>
  </div>
</footer>
"""

OVERLAY_STYLE = """
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.note { position: fixed; right: 16px; bottom: 16px; max-width: 420px; padding: 12px 14px; border-radius: 10px;
        background: rgba(10, 18, 32, 0.92); color: #EEF2F8; font: 500 15px/1.4 'Barlow', system-ui, sans-serif; }
[hidden] { display: none !important; }
"""


def data_json(season, made):
    teams = {t['id']: {'short': t['short'], 'name': t['name'], 'logo': '/' + t['logo'].lstrip('/')}
             for t in season['teams']}
    games = [{k: g.get(k) for k in ('id', 'comp', 'date', 'time', 'venue', 'home', 'away', 'round')}
             for g in season['games'] if g.get('home') in teams and g.get('away') in teams and g.get('comp') in CUPS]
    games.sort(key=lambda g: (g['date'], g['time'] or ''))
    data = {
        'teams': teams, 'cups': CUPS, 'games': games,
        'venues': {v['id']: v['name'] for v in season.get('venues', [])},
        'pregame': {g['id']: f'/obs/{g["id"]}.png' for g in games if g['id'] in made},
        'breakImg': BREAKS,
    }
    return json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def head(title, css, version, extra=''):
    links = ''.join(f'<link rel="stylesheet" href="/live/{c}?v={version}">' for c in css)
    return ('<!doctype html>\n<html lang="lv">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="robots" content="noindex, nofollow">\n'
            f'<title>{escape(title)}</title>\n'
            '<link rel="icon" type="image/webp" href="/assets/dbck-mark.webp">\n'
            f'{links}{extra}\n</head>\n')


def build(out, season, made):
    """season: the site's season data (teams, games, venues); made: ids of games
    with a pre-game screen in dist/obs/. Returns the number of games listed."""
    d = Path(out) / 'live'
    d.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir() if p.suffix in ('.js', '.css'))
    version = hashlib.sha256(b''.join(p.read_bytes() for p in files)).hexdigest()[:10]
    for p in files:
        text = p.read_text()
        if p.suffix == '.js':   # imports carry the version too, so a new release is never mixed with a cached one
            text = re.sub(r"""(from\s+['"]\./[\w-]+\.js)(['"])""", rf'\1?v={version}\2', text)
        (d / p.name).write_text(text)
    data = data_json(season, made)
    data_tag = f'<script type="application/json" id="live-data">{data}</script>\n'

    admin = (head('Scoreboard — Dobeles basketbols', ['live.css', 'admin.css'], version,
                  '<meta name="theme-color" content="#0A1220">')
             + '<body>\n' + ADMIN_BODY + data_tag
             + f'<script type="module" src="/live/admin.js?v={version}"></script>\n</body>\n</html>\n')
    (d / 'admin').mkdir(exist_ok=True)
    (d / 'admin' / 'index.html').write_text(admin)

    overlay = (head('Stream overlay — Dobeles basketbols', ['live.css'], version, f'<style>{OVERLAY_STYLE}</style>')
               + '<body>\n<div class="stage" id="stage"></div>\n<p class="note" id="note" hidden></p>\n' + data_tag
               + f'<script type="module" src="/live/screen.js?v={version}"></script>\n</body>\n</html>\n')
    (d / 'overlay').mkdir(exist_ok=True)
    (d / 'overlay' / 'index.html').write_text(overlay)
    return len(json.loads(data)['games'])
