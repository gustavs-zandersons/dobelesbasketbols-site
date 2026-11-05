// The stream overlay (1920×1080) drawn from the game state: pre-game screen with
// countdown, corner scorebug, bottom bar, break screen with the score by quarter.
// Used by the OBS page (/live/overlay/) and by the admin's preview (/live/admin/).
// Designs: the "Stream overlays" canvas, approved 2 Nov 2026.

export const QMS = 10 * 60 * 1000;   // quarter
export const OTMS = 5 * 60 * 1000;   // overtime
export const SCENES = ['pregame', 'live', 'break', 'off'];

export const periodLen = (p) => (p <= 4 ? QMS : OTMS);
export const periodLabel = (p) => (p <= 4 ? 'Q' + p : (p === 5 ? 'OT' : 'OT' + (p - 4)));
export const remaining = (c, t) => (c.running ? Math.max(0, c.remainMs - (t - c.startedAt)) : c.remainMs);

// Game clock: m:ss, and seconds with tenths in the last minute.
export function fmtClock(ms) {
  if (ms >= 60000) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const t = Math.floor(ms / 100);
  return Math.floor(t / 10) + '.' + (t % 10);
}
// Countdown to tip-off: m:ss, or h:mm:ss when an hour or more away.
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') : m + ':' + String(sec).padStart(2, '0');
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return 'rgb(' + ch.join(', ') + ')';
}
export function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.35;
}
// A team row in the cup's colours: navy text on the yellow row, white on the others.
export function rowLook(base, cup) {
  const light = isLight(base);
  const hi = shade(base, 0.12), lo = shade(base, -0.22);
  return {
    bg: 'linear-gradient(100deg, ' + hi + ' 0%, ' + base + ' 55%, ' + lo + ' 100%)',
    bgRev: 'linear-gradient(260deg, ' + hi + ' 0%, ' + base + ' 55%, ' + lo + ' 100%)',
    text: light ? cup.ink : '#FFFFFF',
    shadow: light ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.35)',
    scoreBg: light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.28)',
    cellA: light ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.12)',
    cellB: light ? 'rgba(0, 0, 0, 0.09)' : 'rgba(0, 0, 0, 0.2)',
    total: light ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.32)'
  };
}

// A game state the pages can use (the database drops empty values, so optional
// fields may be missing).
export function validState(s, D) {
  return !!(s && s.v === 2 && D.teams[s.home] && D.teams[s.away] && D.cups[s.cup] &&
    Array.isArray(s.score) && s.score.length === 2 && Array.isArray(s.byPeriod) && s.clock &&
    typeof s.clock.remainMs === 'number' && SCENES.indexOf(s.scene) >= 0);
}

// The game day's first game (or the next one), for a fresh start and the demo.
export function gameStart(g) { return new Date(g.date + 'T' + (g.time || '12:00') + ':00').getTime(); }
export function nextGame(D, t) {
  const today = new Date(t); today.setHours(0, 0, 0, 0);
  return D.games.find((g) => gameStart(g) >= today.getTime()) || D.games[D.games.length - 1] || null;
}

// What the OBS page shows before Firebase is set up: a running scorebug, so the
// browser source can be placed and checked.
export function demoState(D, t) {
  const g = nextGame(D, t);
  const ids = Object.keys(D.teams);
  return {
    v: 2, gameId: null, cup: g ? g.comp : 'dbck', home: g ? g.home : ids[0], away: g ? g.away : ids[1],
    score: [27, 26], byPeriod: [[17, 12], [10, 14]], period: 2,
    clock: { running: true, remainMs: 6 * 60000 + 42000, startedAt: t },
    layout: 'bottom', scene: 'live', startAt: t + 10 * 60000, flash: null
  };
}

// A drawn sports hall behind the admin's preview (OBS shows the real camera).
export const BACKDROP = `
  <div class="scene" aria-hidden="true">
    <div style="left:0;top:0;width:1920px;height:470px;background:linear-gradient(180deg,#12161D 0%,#20262F 55%,#29303B 100%)"></div>
    <div style="left:0;top:170px;width:1920px;height:250px;background:repeating-linear-gradient(180deg,#313946 0px,#313946 18px,#252B35 18px,#252B35 34px)"></div>
    <div style="left:0;top:418px;width:1920px;height:46px;background:#0E1A33;border-top:2px solid #1F3360;border-bottom:2px solid #0A1224"></div>
    <div style="left:0;top:466px;width:1920px;height:614px;background:linear-gradient(180deg,#A06D3A 0%,#BD8650 30%,#CB955E 70%,#BF8550 100%)"></div>
    <div style="left:260px;top:480px;width:560px;height:280px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,238,210,.32),rgba(255,238,210,0))"></div>
    <div style="left:1120px;top:480px;width:560px;height:280px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,238,210,.32),rgba(255,238,210,0))"></div>
    <div style="left:0;top:502px;width:1920px;height:4px;background:rgba(255,255,255,.88)"></div>
    <div style="left:958px;top:502px;width:6px;height:578px;background:rgba(255,255,255,.88)"></div>
    <div style="left:776px;top:668px;width:370px;height:136px;box-sizing:border-box;border:5px solid rgba(255,255,255,.88);border-radius:50%"></div>
    <div style="left:0;top:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.38) 100%)"></div>
  </div>`;

// The team's name panel: logo and name, plus the big logo (as wide as the panel)
// that rolls up through it when the team scores.
const REEL = '<div class="tm-roll" aria-hidden="true"><div class="tm-reel"><img data-big alt=""></div></div>';
const team = (inner) => '<div class="tm" data-tm><div class="tm-in">' + inner + '</div>' + REEL + '</div>';

const LAYERS = `
  <div class="ov full off" data-ov="pregame">
    <img data-img alt="">
    <div class="pg-count" data-count></div>
  </div>

  <div class="ov full off" data-ov="break">
    <img data-img alt="">
    <div class="ht-wrap">
      <div class="ht-box">
        <div class="ht-head" data-head></div>
        <div class="ht-row" data-row="0"><img data-logo alt=""><div class="ht-name" data-name></div></div>
        <div class="ht-row" data-row="1"><img data-logo alt=""><div class="ht-name" data-name></div></div>
      </div>
    </div>
    <span class="ht-measure" data-measure></span>
  </div>

  <div class="ov ov-corner off" data-ov="corner">
    <div class="cn-tab" data-tab></div>
    <div class="cn-box">
      <div class="cn-cup"><img data-cup alt=""></div>
      <div class="cn-rows">
        <div class="cn-row" data-row="0">${team('<img data-logo alt=""><div class="cn-name" data-name></div>')}<div class="cn-score" data-score></div></div>
        <div class="cn-row" data-row="1">${team('<img data-logo alt=""><div class="cn-name" data-name></div>')}<div class="cn-score" data-score></div></div>
        <div class="cn-clock"><div class="per" data-per></div><div class="sep"></div><div class="time" data-time></div></div>
      </div>
    </div>
  </div>

  <div class="ov ov-bottom off" data-ov="bottom">
    <div class="bt-tab" data-tab></div>
    <div class="bt-box">
      <div class="bt-team l" data-row="0">${team('<img data-logo alt=""><div class="bt-name" data-name></div>')}<div class="bt-score" data-score></div></div>
      <div class="bt-mid">
        <div class="bt-line"><div class="per" data-per></div><div class="sep"></div><div class="time" data-time></div></div>
        <div class="bt-label" data-label></div>
      </div>
      <div class="bt-team r" data-row="1"><div class="bt-score" data-score></div>${team('<div class="bt-name" data-name></div><img data-logo alt="">')}</div>
    </div>
  </div>

  <div class="sting" data-sting aria-hidden="true"></div>`;

// Transitions between what is on screen, in the cup's colours and with its logo
// (organisers, 3–5 Nov 2026). The admin's Settings pick one per scene
// (state.transitions.<scene>, the scene being switched to; switching the scorebug
// layout uses the Scorebug one). Timings in ms: ms the whole transition, show when
// the new graphic comes in. 'spin' fades the old graphic out first and the new
// one in over the logo; the others cover the whole picture and swap the graphics
// while it is covered (cut). Animations in live.css under the same names.
const LOGO = '<div class="sx-logo"><img data-sting-logo alt=""></div>';
const STRIPES = 6;
export const STINGERS = {
  spin: {
    name: 'Logo spin', ms: 1500, show: 1080, cut: false,
    html: '<div class="st-glow"></div><div class="st-ring a"></div><div class="st-ring b"></div><div class="st-turn"><img data-sting-logo alt=""></div>'
  },
  slash: {
    name: 'Slash', ms: 1400, show: 560, cut: true,
    html: ['a', 'b', 'c'].map((k) => '<div class="sl-in ' + k + '"><div class="sl-band"></div></div>').join('') + LOGO
  },
  iris: {
    name: 'Iris', ms: 1400, show: 560, cut: true,
    html: '<div class="ir a"></div><div class="ir b"></div>' + LOGO
  },
  stripes: {
    name: 'Stripes', ms: 1400, show: 560, cut: true,
    html: Array.from({ length: STRIPES }, (_, i) =>
      '<div class="sp ' + (i % 2 ? 'r' : 'l') + '" style="top:' + (i * 180) + 'px;--i:' + i + '"><div class="sp-bar"></div></div>').join('') + LOGO
  },
  split: {
    name: 'Split', ms: 1300, show: 420, cut: true,
    html: '<div class="spl-shake"><div class="spl-half top"></div><div class="spl-half bot"></div><div class="spl-seam"></div></div>'
      + '<div class="spl-badge"><img data-sting-logo alt=""></div>'
  },
};
export const DEFAULT_STINGER = 'spin';

// stage: a 1920×1080 element; D: the page's data (teams, cups, games, images);
// now: the shared clock (Firebase server time). Returns { update(state), tick(clockMs, countdownMs) }.
export function createOverlay(stage, D, now, opts) {
  stage.innerHTML = (opts && opts.backdrop ? BACKDROP : '') + LAYERS;
  const pre = stage.querySelector('[data-ov="pregame"]');
  const brk = stage.querySelector('[data-ov="break"]');
  const corner = stage.querySelector('[data-ov="corner"]');
  const bottom = stage.querySelector('[data-ov="bottom"]');
  const times = stage.querySelectorAll('[data-time]');
  const count = pre.querySelector('[data-count]');
  const measure = brk.querySelector('[data-measure]');
  const sting = stage.querySelector('[data-sting]');
  const NAME_TEXT = 500;    // room for a team name on the score card (1020 px card with two quarters)
  const BREAK_MID = 530;    // the card is centred between PĀRTRAUKUMS and the sponsor band
  let last = null, lastFlashId = null, flashTeam = -1, flashPts = 0, flashUntil = 0, flashTimer = 0, lastTime = '', lastCount = '';
  const preloaded = {};
  const layers = { pregame: pre, break: brk, corner: corner, bottom: bottom };
  let shown = null;           // the graphic on screen ('none' for nothing); null until the first state
  let want = null, revealTimer = 0, stingTimer = 0;
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // cut: swap without the graphics' own fade and slide (the picture is covered).
  function showLayer(k, cut) {
    shown = k;
    const els = Object.keys(layers).map((key) => layers[key]);
    if (cut) els.forEach((el) => el.classList.add('cut'));
    Object.keys(layers).forEach((key) => layers[key].classList.toggle('off', key !== k));
    if (cut) { void stage.offsetWidth; setTimeout(() => els.forEach((el) => el.classList.remove('cut')), 60); }
  }
  // The first state after the page opens is shown straight away; every change
  // after that goes through the transition. A change while one is playing just
  // picks what comes in at its end.
  function switchTo(k, cup, kind) {
    if (k === want) return;
    want = k;
    if (shown === null || calm()) { clearTimeout(revealTimer); revealTimer = 0; showLayer(k); return; }
    if (revealTimer) return;
    const st = STINGERS[kind] || STINGERS[DEFAULT_STINGER];
    const name = STINGERS[kind] ? kind : DEFAULT_STINGER;
    if (sting.dataset.kind !== name) { sting.innerHTML = st.html; sting.dataset.kind = name; }
    sting.querySelectorAll('[data-sting-logo]').forEach((img) => setSrc(img, cup.logo));
    sting.style.setProperty('--st-a', cup.c1);
    sting.style.setProperty('--st-b', cup.c2);
    sting.style.setProperty('--st-ink', cup.ink);
    sting.style.setProperty('--st-hi', cup.accent);
    if (!st.cut) showLayer('none');
    sting.classList.remove('go');
    void sting.offsetWidth;          // restart the animation
    sting.classList.add('go');
    clearTimeout(stingTimer);
    stingTimer = setTimeout(() => sting.classList.remove('go'), st.ms + 50);
    revealTimer = setTimeout(() => { revealTimer = 0; showLayer(want, st.cut); }, st.show);
  }

  // The full-screen images are large: fetch them before they are needed.
  function preload(url) {
    if (!url || preloaded[url]) return;
    preloaded[url] = new Image();
    preloaded[url].src = url;
  }
  Object.values(D.breakImg).forEach(preload);

  function setSrc(img, url) { if (url && img.getAttribute('src') !== url) img.src = url; }
  // The scoring team's name panel: logo and name fade out, the big logo rolls up
  // through the panel and out of the top, then logo and name fade back in (live.css).
  function roll(i) {
    stage.querySelectorAll('[data-row="' + i + '"] [data-tm]').forEach((tm) => {
      tm.classList.remove('rolling');
      void tm.offsetWidth;            // restart if the team scores again mid-roll
      tm.classList.add('rolling');
      clearTimeout(tm._roll);
      tm._roll = setTimeout(() => tm.classList.remove("rolling"), 1700);
    });
  }
  function splitName(name) {
    const i = name.indexOf(' / ');
    if (i > 0) return [name.slice(0, i) + ' /', name.slice(i + 3)];
    const j = name.lastIndexOf(' ');
    return j > 0 ? [name.slice(0, j), name.slice(j + 1)] : [name];
  }
  function nameLines(name) {
    measure.textContent = name;
    return measure.offsetWidth > NAME_TEXT ? splitName(name) : [name];
  }
  function el(cls, text, bg, color) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    if (bg) d.style.background = bg;
    if (color) d.style.color = color;
    return d;
  }

  function update(s) {
    last = s;
    const t = now();
    const cup = D.cups[s.cup];
    const teams = [D.teams[s.home], D.teams[s.away]];
    const looks = [rowLook(cup.c1, cup), rowLook(cup.c2, cup)];
    const byPeriod = s.byPeriod || [];
    stage.style.setProperty('--ov-accent', cup.accent);
    stage.style.setProperty('--ov-ink', cup.ink);
    stage.style.setProperty('--ov-muted', cup.muted);

    // "+2" / "+3": the scoring team's box turns white for 3 seconds.
    const flash = s.flash || null;
    if (flash && flash.id !== lastFlashId) {
      lastFlashId = flash.id;
      if (t - flash.id < 4000) {
        flashTeam = flash.team; flashPts = flash.pts; flashUntil = flash.id + 3000;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => update(last), Math.max(0, flashUntil - now()) + 30);
        if (flash.pts > 0) roll(flash.team);
      }
    }
    if (!flash) flashTeam = -1;
    const flashOn = flashTeam >= 0 && t < flashUntil;
    const flashing = (i) => flashOn && flashTeam === i;
    const label = periodLabel(s.period);

    const preImg = s.gameId ? D.pregame[s.gameId] : null;
    preload(preImg);
    preload(cup.logo);
    switchTo(s.scene === 'pregame' ? (preImg ? 'pregame' : 'none')
      : s.scene === 'break' ? 'break'
      : s.scene === 'live' ? (s.layout === 'corner' ? 'corner' : 'bottom')
      : 'none', cup, (s.transitions && s.transitions[s.scene]) || s.transition);

    /* pre-game screen */
    if (preImg) setSrc(pre.querySelector('[data-img]'), preImg);
    count.style.color = cup.count || '#FFFFFF';

    /* corner scorebug */
    setSrc(corner.querySelector('[data-cup]'), cup.logo);
    corner.querySelector('[data-cup]').alt = cup.name;
    corner.querySelectorAll('[data-row]').forEach((row, i) => {
      const lk = looks[i];
      row.style.background = lk.bg;
      setSrc(row.querySelector('[data-logo]'), teams[i].logo);
      row.querySelectorAll('[data-big]').forEach((img) => setSrc(img, teams[i].logo));
      const nm = row.querySelector('[data-name]');
      nm.textContent = teams[i].short; nm.style.color = lk.text; nm.style.textShadow = lk.shadow;
      const sc = row.querySelector('[data-score]');
      sc.textContent = s.score[i];
      sc.style.background = flashing(i) ? '#FFFFFF' : lk.scoreBg;
      sc.style.color = flashing(i) ? cup.ink : lk.text;
    });
    const cTab = corner.querySelector('[data-tab]');
    if (flashOn) { cTab.textContent = '+' + flashPts; cTab.style.top = (flashTeam * 54) + 'px'; }
    cTab.classList.toggle('on', flashOn);
    corner.querySelector('[data-per]').textContent = label;

    /* bottom bar */
    bottom.querySelectorAll('[data-row]').forEach((panel, i) => {
      const lk = looks[i];
      panel.style.background = i === 0 ? lk.bg : lk.bgRev;
      setSrc(panel.querySelector('[data-logo]'), teams[i].logo);
      panel.querySelectorAll('[data-big]').forEach((img) => setSrc(img, teams[i].logo));
      const nm = panel.querySelector('[data-name]');
      nm.textContent = teams[i].short; nm.style.color = lk.text; nm.style.textShadow = lk.shadow;
      const sc = panel.querySelector('[data-score]');
      sc.textContent = s.score[i];
      sc.style.background = flashing(i) ? '#FFFFFF' : lk.scoreBg;
      sc.style.color = flashing(i) ? cup.ink : lk.text;
    });
    const bTab = bottom.querySelector('[data-tab]');
    if (flashOn) { bTab.textContent = '+' + flashPts; bTab.style.left = (flashTeam === 0 ? 325 : 675) + 'px'; }
    bTab.classList.toggle('on', flashOn);
    bottom.querySelector('[data-per]').textContent = label;
    bottom.querySelector('[data-label]').textContent = cup.label;

    /* break screen: every quarter played so far, then the total */
    setSrc(brk.querySelector('[data-img]'), D.breakImg[s.cup]);
    const n = Math.max(1, s.period);
    const width = 796 + 112 * n;
    const lines = teams.map((tm) => nameLines(tm.name));
    const rowH = (lines[0].length > 1 || lines[1].length > 1) ? 2 * 44 + 6 + 48 : 124;
    const wrap = brk.querySelector('.ht-wrap');
    wrap.style.left = Math.round((1920 - width) / 2) + 'px';
    wrap.style.top = Math.round(BREAK_MID - (50 + 2 * rowH) / 2) + 'px';
    brk.querySelector('.ht-box').style.width = width + 'px';
    const head = brk.querySelector('[data-head]');
    head.textContent = '';
    head.appendChild(el('sp'));
    for (let p = 1; p <= n; p++) head.appendChild(el('q', periodLabel(p)));
    head.appendChild(el('t'));
    brk.querySelectorAll('[data-row]').forEach((row, i) => {
      const lk = looks[i];
      row.style.height = rowH + 'px';
      row.style.background = lk.bg;
      setSrc(row.querySelector('[data-logo]'), teams[i].logo);
      const nm = row.querySelector('[data-name]');
      nm.textContent = '';
      lines[i].forEach((line) => nm.appendChild(el('', line)));
      nm.style.color = lk.text; nm.style.textShadow = lk.shadow;
      Array.from(row.querySelectorAll('.ht-q, .ht-t')).forEach((c) => c.remove());
      for (let p = 1; p <= n; p++) {
        const v = (byPeriod[p - 1] || [0, 0])[i] || 0;
        row.appendChild(el('ht-q', v, p % 2 ? lk.cellA : lk.cellB, lk.text));
      }
      const leads = s.score[i] > s.score[1 - i];
      row.appendChild(el('ht-t', s.score[i], leads ? '#FFFFFF' : lk.total, leads ? cup.ink : lk.text));
    });
  }

  function tick(clockMs, countMs) {
    const c = fmtClock(clockMs);
    if (c !== lastTime) { lastTime = c; times.forEach((e) => { e.textContent = c; }); }
    const k = fmtCountdown(countMs);
    if (k !== lastCount) { lastCount = k; count.textContent = k; }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (last) update(last); });
  return { update, tick };
}
