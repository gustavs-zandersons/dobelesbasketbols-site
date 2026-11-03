// The scoreboard admin (/live/admin/). Every tap changes one small game state;
// it is saved on this device and sent to Firebase, and the OBS overlay
// (/live/overlay/) redraws from it. Without Firebase settings (config.js) the
// page runs in test mode: everything works on this device, nothing is sent.
import { connect } from './sync.js';
import * as R from './render.js';

const D = JSON.parse(document.getElementById('live-data').textContent);
const LS_KEY = 'dbck-live-admin-v1';
const LS_PREVIEW = 'dbck-live-preview';
const CUP_NAMES = { dbck: 'Dobele Cup', jssc: 'Jelgava Cup' };
const { periodLen, periodLabel, fmtClock, fmtCountdown, isLight } = R;

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p || 12); } catch (e) { /* not supported */ } }

let sync = null;          // the Firebase link; null in test mode
let user = null;          // the signed-in Google account
let mode = 'loading';     // 'test' | 'signin' | 'checking' (signed in, access not confirmed yet) | 'live'
let online = false;
let remoteLoaded = false, lastRemote = null;
let checkId = 0;          // the latest access check (see checkAccess)
const now = () => (sync ? sync.now() : Date.now());
const remaining = (c) => R.remaining(c, now());

/* ---------- Schedule ---------- */
const games = D.games;
const gameById = (id) => games.find((g) => g.id === id) || null;
function dayLabel(g) { return new Date(R.gameStart(g)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function roundText(g) { const m = /^R(\d+)$/.exec(g.round || ''); return m ? 'Round ' + m[1] : ''; }
function gameMeta(g) {
  return [CUP_NAMES[g.comp], roundText(g), D.venues[g.venue] || '', dayLabel(g) + ' ' + g.time].filter(Boolean).join(' · ');
}

/* ---------- State ---------- */
// A game loaded from the schedule always starts on the pre-game screen with the
// bottom bar as its scorebug; "New game" keeps the teams and the layout.
function freshState(g, keep) {
  const base = keep || {};
  return {
    v: 2, gameId: g ? g.id : (base.gameId || null),
    cup: g ? g.comp : base.cup, home: g ? g.home : base.home, away: g ? g.away : base.away,
    score: [0, 0], byPeriod: [[0, 0]], period: 1,
    clock: { running: false, remainMs: R.QMS, startedAt: 0 },
    layout: g ? 'bottom' : (base.layout || 'bottom'),
    scene: 'pregame',
    startAt: g ? R.gameStart(g) : (base.startAt || now() + 15 * 60000),
    flash: null, back: null,
    meta: g ? gameMeta(g) : (base.meta || CUP_NAMES[base.cup])
  };
}
// Fill the optional fields the database leaves out.
const normal = (s) => Object.assign({ gameId: null, flash: null, back: null, meta: '', layout: 'bottom', startAt: 0 }, s);

let S = null;
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved && R.validState(saved.state, D)) S = normal(saved.state);
  }
} catch (e) { /* storage blocked */ }
if (!S) {
  const g = R.nextGame(D, Date.now());
  S = g ? freshState(g) : freshState(null, { cup: 'dbck', home: Object.keys(D.teams)[0], away: Object.keys(D.teams)[1] });
}

const subscribers = [];
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify({ state: S })); } catch (e) { /* ignore */ } }
function notify() { subscribers.forEach((f) => f(S)); }
function push() {
  if (mode !== 'live') return;
  sync.write(clone(S)).then(() => { $('banner').hidden = true; }).catch(writeFailed);
}
function writeFailed(e) {
  const denied = /permission/i.test(String(e && (e.code || e.message)));
  if (denied) {                      // taken off the list of operators while signed in
    if (lastRemote) { S = normal(lastRemote); saveLocal(); notify(); }
    if (user) reject(user);
    return;
  }
  const b = $('banner');
  b.textContent = 'Could not send the change: ' + ((e && e.message) || e) + '. It will be sent again with the next tap.';
  b.hidden = false;
}
function commit(next) {
  S = next;
  saveLocal();
  notify();
  push();
}
function act(fn) { const n = clone(S); fn(n); commit(n); }
function ensurePeriods(n) { while (n.byPeriod.length < n.period) n.byPeriod.push([0, 0]); }
function inProgress() { return S.score[0] + S.score[1] > 0 || S.period > 1 || remaining(S.clock) < periodLen(S.period); }
// Manual team changes that no longer match the loaded game drop it (its pre-game screen shows other teams).
function checkGame(n) {
  const g = gameById(n.gameId);
  if (!g) return;
  const same = (g.home === n.home && g.away === n.away) || (g.home === n.away && g.away === n.home);
  if (!same) { n.gameId = null; n.meta = CUP_NAMES[n.cup]; }
}
// Another device (or a reload) changed the game: take the database's version.
function onRemote(v) {
  remoteLoaded = true;
  if (!R.validState(v, D)) { lastRemote = null; if (v === null) push(); return; }
  lastRemote = v;
  const next = normal(v);
  if (JSON.stringify(next) === JSON.stringify(S)) return;
  S = next;
  saveLocal();
  notify();
}

/* ---------- Actions ---------- */
function addPoints(i, pts) {
  act((n) => {
    ensurePeriods(n);
    n.score[i] += pts;
    n.byPeriod[n.period - 1][i] += pts;
    n.flash = { team: i, pts: pts, id: now() };
  });
  buzz();
}
// −1 fix: takes the point from the latest quarter in which this team scored.
function minusOne(i) {
  if (S.score[i] <= 0) return;
  let p = S.period;
  while (p > 1 && (!S.byPeriod[p - 1] || S.byPeriod[p - 1][i] <= 0)) p--;
  act((n) => {
    ensurePeriods(n);
    n.score[i] -= 1;
    n.byPeriod[p - 1][i] = Math.max(0, n.byPeriod[p - 1][i] - 1);
    n.flash = null;
  });
  buzz();
}
function toggleClock() {
  const r = remaining(S.clock);
  act((n) => {
    if (n.clock.running) n.clock = { running: false, remainMs: r, startedAt: 0 };
    else if (n.clock.remainMs > 0) {
      n.clock = { running: true, remainMs: n.clock.remainMs, startedAt: now() };
      n.back = null;                                                        // play is on in this quarter
      if (n.scene === 'pregame' || n.scene === 'break') n.scene = 'live';   // show the scorebug
    }
  });
  buzz(20);
}
function setRemaining(ms) {
  const v = Math.max(0, Math.min(periodLen(S.period), Math.round(ms)));
  act((n) => {
    n.clock = (n.clock.running && v > 0)
      ? { running: true, remainMs: v, startedAt: now() }
      : { running: false, remainMs: v, startedAt: 0 };
  });
}
// Next quarter remembers where the clock was, so ◀ straight after it puts
// everything back (an accidental tap); once the new quarter's clock starts, ◀
// just steps back a quarter.
function nextPeriod() {
  const back = { period: S.period, clock: clone(S.clock), scene: S.scene };
  act((n) => {
    n.period += 1;
    ensurePeriods(n);
    n.clock = { running: false, remainMs: periodLen(n.period), startedAt: 0 };
    if (n.scene === 'break') n.scene = 'live';
    n.flash = null;
    n.back = back;
  });
  buzz();
}
function prevPeriod() {
  if (S.period <= 1) return;
  const b = S.back;
  const r = remaining(S.clock);
  act((n) => {
    if (b && b.period === n.period - 1 && !n.clock.running) {
      n.period = b.period; n.clock = b.clock; n.scene = b.scene;
    } else {
      n.period -= 1;
      n.clock = { running: false, remainMs: Math.min(r, periodLen(n.period)), startedAt: 0 };
    }
    n.back = null;
    n.flash = null;
  });
  buzz();
}
function loadGame(g) { commit(freshState(g)); }
function newGame() { commit(freshState(null, S)); }

/* ---------- Preview ---------- */
const stage = $('stage');
const preview = $('preview');
const overlay = R.createOverlay(stage, D, now, { backdrop: true });
function fitStage() { stage.style.transform = 'scale(' + (preview.clientWidth / 1920) + ')'; }
if (window.ResizeObserver) new ResizeObserver(fitStage).observe(preview);
window.addEventListener('resize', fitStage);
function setPreview(open) {
  preview.hidden = !open;
  $('togglePreview').textContent = open ? 'Hide' : 'Show';
  $('togglePreview').setAttribute('aria-expanded', String(open));
  if (open) { fitStage(); overlay.update(S); }
}
let previewOpen = true;
try { previewOpen = localStorage.getItem(LS_PREVIEW) !== 'closed'; } catch (e) { /* ignore */ }
setPreview(previewOpen);
$('togglePreview').addEventListener('click', () => {
  previewOpen = preview.hidden;
  setPreview(previewOpen);
  try { localStorage.setItem(LS_PREVIEW, previewOpen ? 'open' : 'closed'); } catch (e) { /* ignore */ }
});

/* ---------- Rendering ---------- */
// Two taps for actions that lose information.
function confirmTap(btn, armedText, run) {
  if (btn.dataset.armed === '1') {
    clearTimeout(btn._t); btn.dataset.armed = ''; btn.classList.remove('armed');
    run(); render(S); return;
  }
  btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = armedText;
  btn._t = setTimeout(() => { btn.dataset.armed = ''; btn.classList.remove('armed'); render(S); }, 3500);
}

Object.keys(D.teams).forEach((tid) => {
  ['homeSel', 'awaySel'].forEach((id) => {
    const o = document.createElement('option');
    o.value = tid; o.textContent = D.teams[tid].name;
    $(id).appendChild(o);
  });
});
// Game setup lists this week's games (Monday to Sunday, by this device's date) and
// the ones after it; worked out again each time the pop-up opens.
function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fillGames() {
  const sel = $('gameSelect');
  sel.textContent = '';
  const from = weekStart(Date.now());
  const list = games.filter((g) => g.date >= from);
  if (!list.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No games this week or later';
    sel.appendChild(o);
    sel.disabled = true;
    $('loadGame').disabled = true;
    return;
  }
  sel.disabled = false;
  $('loadGame').disabled = false;
  const byDay = new Map();
  list.forEach((g) => { if (!byDay.has(g.date)) byDay.set(g.date, []); byDay.get(g.date).push(g); });
  byDay.forEach((list) => {
    const og = document.createElement('optgroup');
    og.label = dayLabel(list[0]) + ' · ' + (D.venues[list[0].venue] || '');
    list.forEach((g) => {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.time + '  ' + D.teams[g.home].short + ' – ' + D.teams[g.away].short;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  const loaded = list.find((g) => g.id === S.gameId);
  const pick = loaded || list.find((g) => R.gameStart(g) >= new Date().setHours(0, 0, 0, 0)) || list[0];
  sel.value = pick.id;
}
fillGames();

function render(s) {
  const cup = D.cups[s.cup];
  const r = document.documentElement.style;
  r.setProperty('--accent', cup.accent);
  r.setProperty('--on-accent', isLight(cup.accent) ? cup.ink : '#FFFFFF');
  r.setProperty('--c1', cup.c1); r.setProperty('--c1-text', isLight(cup.c1) ? cup.ink : '#FFFFFF');
  r.setProperty('--c2', cup.c2); r.setProperty('--c2-text', isLight(cup.c2) ? cup.ink : '#FFFFFF');

  const teams = [D.teams[s.home], D.teams[s.away]];
  $('gameTitle').textContent = teams[0].short + ' – ' + teams[1].short;
  $('gameMeta').textContent = s.meta || CUP_NAMES[s.cup];
  [cup.c1, cup.c2].forEach((c, i) => {
    $('col' + i).style.setProperty('--sc-tint', isLight(c) ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.28)');   // as on the scorebug
    $('logo' + i).src = teams[i].logo;
    $('name' + i).textContent = teams[i].short;
    $('score' + i).textContent = s.score[i];
    $('fix' + i).disabled = s.score[i] <= 0;
  });

  $('periodNow').textContent = periodLabel(s.period);
  $('barPeriod').textContent = periodLabel(s.period);
  $('prevQ').disabled = s.period <= 1;
  const keep = (id, text) => { const b = $(id); if (b.dataset.armed !== '1') b.textContent = text; };
  keep('prevQ', s.period > 1 ? 'Previous: ' + periodLabel(s.period - 1) : 'Previous');
  keep('nextQ', 'Next: ' + periodLabel(s.period + 1));
  keep('newGameBtn', 'New game: reset score and clock');
  keep('loadGame', 'Load this game');

  // on screen
  const rem = remaining(s.clock);
  const over = !s.clock.running && rem <= 0;
  document.querySelectorAll('[data-scene]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.scene === s.scene));
    b.classList.toggle('nudge', b.dataset.scene === 'break' && over && s.scene !== 'break');
  });
  $('panelPregame').hidden = s.scene !== 'pregame';
  $('panelLive').hidden = s.scene !== 'live';
  $('panelBreak').hidden = s.scene !== 'break';
  const g = gameById(s.gameId);
  $('cdSchedule').hidden = !g;
  if (g) $('cdSchedule').textContent = 'At ' + g.time + ' (schedule)';
  $('pregameNote').textContent = g && D.pregame[g.id]
    ? 'The countdown shows under “Spēle sāksies pēc:”.'
    : (g ? 'This game has no pre-game screen yet: the site makes them for coming games once both teams are known.'
         : 'The pre-game screen needs a game loaded from the schedule (Game setup).');
  $('breakNote').textContent = 'The PĀRTRAUKUMS screen with the score by quarter: ' +
    (s.period <= 1 ? 'Q1' : 'Q1–' + periodLabel(s.period)) + '. Next quarter or Start clock returns to the scorebug.';
  $('layoutBottom').setAttribute('aria-pressed', String(s.layout !== 'corner'));
  $('layoutCorner').setAttribute('aria-pressed', String(s.layout === 'corner'));

  // setup
  $('homeSel').value = s.home;
  $('awaySel').value = s.away;

  // what to do next
  let msg = '';
  if (over && s.period === 2 && s.scene !== 'break') msg = 'Q2 is over. Show the break screen with the halftime score?';
  else if (over && s.period >= 4 && s.score[0] === s.score[1]) msg = 'Tied at the end of ' + periodLabel(s.period) + '. Next: ' + periodLabel(s.period + 1) + ' starts a 5:00 overtime.';
  else if (over && s.period >= 4) msg = 'Game over: ' + teams[s.score[0] > s.score[1] ? 0 : 1].short + ' win ' + Math.max(s.score[0], s.score[1]) + '–' + Math.min(s.score[0], s.score[1]) + '.';
  else if (over && s.scene !== 'break') msg = periodLabel(s.period) + ' is over. Show the break screen, or tap Next: ' + periodLabel(s.period + 1) + ' when the teams are ready.';
  else if (over) msg = 'Break screen is on. Tap Next: ' + periodLabel(s.period + 1) + ' when the teams are ready.';
  $('hint').textContent = msg;
  $('hint').hidden = !msg;

  const cb = $('clockBtn');
  cb.classList.toggle('running', !!s.clock.running);
  cb.disabled = over;
  $('clockTxt').textContent = s.clock.running ? 'Stop clock' : (over ? periodLabel(s.period) + ' over' : 'Start clock');
}

subscribers.push(render, overlay.update);
render(S);
overlay.update(S);

/* ---------- Clock loop ---------- */
let lastBar = '', lastCount = '';
function loop() {
  const r = remaining(S.clock);
  if (S.clock.running && r <= 0 && (mode === 'live' || mode === 'test')) {
    act((n) => { n.clock = { running: false, remainMs: 0, startedAt: 0 }; });
    buzz([90, 60, 90]);
  }
  const txt = fmtClock(r);
  if (txt !== lastBar) { lastBar = txt; $('barTime').textContent = txt; }
  const cd = (S.startAt || 0) - now();
  const ct = fmtCountdown(cd);
  if (ct !== lastCount) { lastCount = ct; $('countRead').textContent = ct; }
  overlay.tick(r, cd);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Keep the phone awake while the page is open ---------- */
let wake = null;
async function keepAwake() {
  try {
    if (!wake && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch (e) { /* not allowed here */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', keepAwake, { passive: true });

/* ---------- Controls ---------- */
document.querySelectorAll('[data-pts]').forEach((b) => {
  b.addEventListener('click', () => {
    const i = Number(b.dataset.team), p = Number(b.dataset.pts);
    if (p < 0) minusOne(i); else addPoints(i, p);
  });
});
$('clockBtn').addEventListener('click', toggleClock);
// −1/−5/−15 s and +1/+5/+15 s: between 0 and the quarter's length; a running clock keeps running.
document.querySelectorAll('[data-nudge]').forEach((b) => {
  b.addEventListener('click', () => { setRemaining(remaining(S.clock) + Number(b.dataset.nudge) * 1000); buzz(); });
});

// Space starts and stops the clock (a computer or a tablet with a keyboard).
// Not while typing a time or with Game setup open; and Space never presses the
// last tapped button (a +2 again), the browser's default for a focused button.
function spaceKey(e) {
  if (e.code !== 'Space' && e.key !== ' ') return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return false;
  if (setup.open || $('app').hidden) return false;
  return true;
}
document.addEventListener('keydown', (e) => {
  if (!spaceKey(e)) return;
  e.preventDefault();
  if (e.repeat) return;                         // held down: one press
  const cb = $('clockBtn');
  if (cb.disabled) return;
  toggleClock();
  cb.classList.add('pressed');
  setTimeout(() => cb.classList.remove('pressed'), 160);
});
document.addEventListener('keyup', (e) => { if (spaceKey(e)) e.preventDefault(); });

function parseTime(str) {
  const t = String(str).trim().replace(',', '.');
  let m;
  if ((m = /^(\d{1,2}):(\d{1,2})(?:\.(\d))?$/.exec(t))) {
    if (Number(m[2]) > 59) return null;
    return (Number(m[1]) * 60 + Number(m[2])) * 1000 + (m[3] ? Number(m[3]) * 100 : 0);
  }
  if ((m = /^(\d{1,2})\.(\d)$/.exec(t))) return Number(m[1]) * 1000 + Number(m[2]) * 100;
  if (/^\d{3,4}$/.test(t)) {
    const mm = Number(t.slice(0, -2)), ss = Number(t.slice(-2));
    return ss > 59 ? null : (mm * 60 + ss) * 1000;
  }
  if (/^\d{1,2}$/.test(t)) return Number(t) * 1000;
  return null;
}
$('setTimeBtn').addEventListener('click', () => {
  const box = $('setTimeBox');
  const open = box.hidden;
  box.hidden = !open;
  $('setTimeBtn').setAttribute('aria-expanded', String(open));
  $('timeErr').hidden = true;
  if (open) { $('timeInput').value = fmtClock(remaining(S.clock)); $('timeInput').focus(); $('timeInput').select(); }
});
$('setTimeBox').addEventListener('submit', (e) => {
  e.preventDefault();
  const ms = parseTime($('timeInput').value);
  if (ms === null || ms > periodLen(S.period)) { $('timeErr').hidden = false; return; }
  $('timeErr').hidden = true;
  setRemaining(ms);
  $('setTimeBox').hidden = true;
  $('setTimeBtn').setAttribute('aria-expanded', 'false');
  buzz();
});

// Previous asks for a second tap, except straight after Next (then it just puts
// everything back, see nextPeriod).
$('prevQ').addEventListener('click', (e) => {
  const b = S.back;
  if (b && b.period === S.period - 1 && !S.clock.running) prevPeriod();
  else confirmTap(e.currentTarget, 'Back to ' + periodLabel(S.period - 1) + '? Tap again', prevPeriod);
});
$('nextQ').addEventListener('click', (e) => {
  const r = remaining(S.clock);
  if (S.clock.running || r > 0) confirmTap(e.currentTarget, (S.clock.running ? 'Clock running. ' : fmtClock(r) + ' left. ') + 'Tap again', nextPeriod);
  else nextPeriod();
});

document.querySelectorAll('[data-scene]').forEach((b) => {
  b.addEventListener('click', () => { act((n) => { n.scene = b.dataset.scene; }); buzz(); });
});
$('layoutBottom').addEventListener('click', () => act((n) => { n.layout = 'bottom'; }));
$('layoutCorner').addEventListener('click', () => act((n) => { n.layout = 'corner'; }));
$('cdSchedule').addEventListener('click', () => {
  const g = gameById(S.gameId);
  if (g) { act((n) => { n.startAt = R.gameStart(g); }); buzz(); }
});
document.querySelectorAll('[data-cd-in]').forEach((b) => {
  b.addEventListener('click', () => { const m = Number(b.dataset.cdIn); act((n) => { n.startAt = now() + m * 60000; }); buzz(); });
});
document.querySelectorAll('[data-cd-nudge]').forEach((b) => {
  b.addEventListener('click', () => {
    const m = Number(b.dataset.cdNudge);
    act((n) => { n.startAt = Math.max(now(), n.startAt || 0) + m * 60000; });
    buzz();
  });
});

/* ---------- Game setup pop-up ---------- */
const setup = $('setup');
function openSetup() {
  fillGames();
  if (setup.showModal) setup.showModal(); else setup.setAttribute('open', '');
}
function closeSetup() { if (setup.close) setup.close(); else setup.removeAttribute('open'); }
$('setupBtn').addEventListener('click', openSetup);
$('setupClose').addEventListener('click', closeSetup);
setup.addEventListener('click', (e) => { if (e.target === setup) closeSetup(); });   // a tap outside the window

$('homeSel').addEventListener('change', (e) => act((n) => { n.home = e.target.value; checkGame(n); }));
$('awaySel').addEventListener('change', (e) => act((n) => { n.away = e.target.value; checkGame(n); }));
$('swapBtn').addEventListener('click', () => {
  act((n) => {
    const h = n.home; n.home = n.away; n.away = h;
    n.score.reverse();
    n.byPeriod.forEach((q) => { if (q) q.reverse(); });
    n.flash = null;
  });
});
$('loadGame').addEventListener('click', (e) => {
  const g = gameById($('gameSelect').value);
  if (!g) return;
  const run = () => { loadGame(g); closeSetup(); };
  if (inProgress()) confirmTap(e.currentTarget, 'Score and clock will reset. Tap again', run);
  else run();
});
$('newGameBtn').addEventListener('click', (e) => confirmTap(e.currentTarget, 'Resets score, clock and quarter. Tap again', () => { newGame(); closeSetup(); }));

const obsUrl = location.origin + '/live/overlay/';
$('obsUrl').textContent = obsUrl;
$('copyObs').addEventListener('click', () => {
  const done = () => { $('copyObs').textContent = 'Copied'; setTimeout(() => { $('copyObs').textContent = 'Copy'; }, 1800); };
  try { navigator.clipboard.writeText(obsUrl).then(done, () => {}); } catch (e) { /* the address can be selected instead */ }
});

/* ---------- Connection and sign-in ---------- */
function setStatus(state, text) { const st = $('status'); st.dataset.state = state; st.textContent = text; }
function showApp(show) {
  $('app').hidden = !show;
  $('clockbar').hidden = !show;
  $('setupBtn').hidden = !show;
  $('signin').hidden = show;
  document.body.classList.toggle('gate', !show);
  if (show) { fitStage(); overlay.update(S); }
}
function signInError(e) {
  const code = (e && e.code) || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this site, or open the page in Chrome or Safari, and try again.';
  if (code === 'auth/unauthorized-domain') return 'Firebase does not accept sign-ins from this address yet: add ' + location.hostname + ' under Authentication → Settings → Authorized domains.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not switched on in Firebase (Authentication → Sign-in method → Google).';
  return 'Sign-in did not work: ' + ((e && e.message) || code);
}

(async function start() {
  setStatus('', 'Connecting');
  try {
    sync = await connect({ auth: true });
  } catch (e) {
    sync = null;
    $('banner').textContent = 'Could not reach Firebase (' + ((e && e.message) || e) + '). Working in test mode on this device.';
    $('banner').hidden = false;
  }
  if (!sync) {
    mode = 'test';
    setStatus('test', 'Test mode');
    $('testNote').hidden = false;
    showApp(true);
    return;
  }
  sync.onConnection((on) => { online = on; if (mode === 'live') setStatus(on ? 'on' : 'off', on ? 'Live' : 'Offline'); });
  sync.onState(onRemote);
  sync.onUser((u) => {
    user = u;
    $('signoutBtn').hidden = !u;
    if (!u) {
      checkId++;
      mode = 'signin';
      setStatus('', 'Signed out');
      closeSetup();
      showApp(false);
      gate('signin');
      return;
    }
    checkAccess(u);
  });
  $('signinBtn').addEventListener('click', () => {
    $('signinErr').hidden = true;
    sync.signIn().catch((e) => {
      const m = signInError(e);
      if (m) { $('signinErr').textContent = m; $('signinErr').hidden = false; }
    });
  });
  $('signoutBtn').addEventListener('click', () => { sync.signOut(); });
})();

/* ---------- Only the operators in the database rules get in ---------- */
// Google sign-in itself accepts any account, so every sign-in (and every visit
// while signed in) is checked against the database rules before the controls
// show. An account that isn't in them is removed from Firebase again and signed out.
function gate(state) {
  $('signinBtn').hidden = state === 'checking';
  $('signinWait').hidden = state !== 'checking';
}
function checkAccess(u) {
  const id = ++checkId;
  mode = 'checking';
  setStatus('', 'Checking');
  $('signinErr').hidden = true;
  showApp(false);
  gate('checking');
  // No answer (no connection): let the operator in; the rules still guard every change.
  const slow = setTimeout(() => { if (id === checkId && mode === 'checking') admit(u); }, 8000);
  sync.canWrite().then((ok) => {
    clearTimeout(slow);
    if (id !== checkId) return;
    if (ok === false) reject(u);
    else if (mode === 'checking') admit(u);
  }, () => {
    clearTimeout(slow);
    if (id === checkId && mode === 'checking') admit(u);
  });
}
function admit(u) {
  mode = 'live';
  setStatus(online ? 'on' : 'off', online ? 'Live' : 'Offline');
  $('signoutBtn').title = 'Signed in as ' + u.email;
  gate('signin');
  showApp(true);
  if (remoteLoaded && lastRemote === null) push();     // first game ever: put this device's state in the database
}
function reject(u) {
  checkId++;
  mode = 'signin';
  closeSetup();
  showApp(false);
  gate('signin');
  setStatus('', 'Signed out');
  $('signinErr').textContent = 'This Google account (' + (u.email || 'no email') + ') is not on the list of scoreboard operators, so it cannot sign in. Ask an organiser to add it, or sign in with another account.';
  $('signinErr').hidden = false;
  sync.removeUser();
}
