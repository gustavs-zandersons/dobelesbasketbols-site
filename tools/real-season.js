// Builds the REAL season for the site from the season sheet and basket.lv.
//
//   node tools/real-season.js > src/season.json
//
// Inputs:
//   src/sheet.json                 teams, halls, the calendar ("Kalendārs"), MVPs, monthly
//                                  MVPs and decisions ("Lēmumi") — tools/sheet_sync.py
//   src/basket/<cup>/fixtures.json the cup's games on basket.lv          — tools/basket_sync.py
//   src/basket/<cup>/roster.json   registered players (names and teams)
//   src/basket/<cup>/games/*.json  box scores of finished games
//
// The sheet gives every game its place in the format: ID, stage, round, pair and
// game number, and the plan (date, time, hall, teams or slot codes such as A1 or
// W:SF1). basket.lv is the source of truth for every game it lists: date, time,
// hall, who is home, the score, quarters and box scores. A basket.lv game is tied
// to its calendar row by cup + the two teams (slot codes are resolved from the
// results so far) + the nearest date. "Lēmumi" (no-shows, annulled results,
// corrections, drawing lots) always win.
//
// A report in Latvian goes to stderr and, on GitHub, to the job summary.
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../src/engine.js');

const ROOT = path.join(__dirname, '..');
const SHEET = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'sheet.json'), 'utf8'));
const CUPS = ['dbck', 'jssc'];
const CUP_NAME = { dbck: 'Čempionu kauss', jssc: 'Izaicinājuma kauss' };
const TODAY = process.env.SEASON_TODAY || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Riga' });
// A basket.lv game further than this from its calendar date is not taken as that game.
const MATCH_DAYS = +process.env.SEASON_MATCH_DAYS || 90;
const warnings = [];
const notes = [];
function warn(cup, msg) { warnings.push([cup, msg]); }

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function dshort(d) { return d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' : '—'; }
function days(a, b) { return Math.abs((Date.parse(a) - Date.parse(b)) / 864e5); }

// ---------- teams ----------
const PALETTE = ['#2E5E8C', '#8C3B2E', '#3E7A4F', '#6A4C93', '#9A6B1F', '#2F6F73', '#7A2E5A', '#4B5A6B', '#1F4E79', '#6B1F2A', '#0B7A5A', '#5B6C8F'];
const EXTRA = ['city', 'description', 'website', 'facebook', 'instagram', 'tiktok'];
const teams = SHEET.teams.map((s, i) => {
  const t = { id: s.id, name: s.name, short: s.short, group: s.group, color: PALETTE[i % PALETTE.length] };
  if (fs.existsSync(path.join(ROOT, 'assets', 'teams', s.id + '.webp'))) t.logo = 'assets/teams/' + s.id + '.webp';
  EXTRA.forEach(k => { if (s[k]) t[k] = s[k]; });
  t.players = [];
  return t;
});
const teamById = new Map(teams.map(t => [t.id, t]));
// basket.lv team name -> team id: the sheet's "basket.lv nosaukums" (aliases), then the
// full name, then the short name — compared without spaces, case and diacritics.
const byName = new Map();
SHEET.teams.forEach(s => { [s.name, s.short].concat(s.basket || []).forEach(n => { if (n && !byName.has(norm(n))) byName.set(norm(n), s.id); }); });
SHEET.teams.forEach(s => (s.basket || []).forEach(n => byName.set(norm(n), s.id)));   // aliases win
const byEntity = new Map();
const unknownTeams = new Map();
function teamOf(cup, name, entity) {
  if (entity && byEntity.has(entity)) return byEntity.get(entity);
  const id = byName.get(norm(name)) || null;
  if (id && entity) byEntity.set(entity, id);
  if (!id && name) unknownTeams.set(cup + '|' + name, [cup, name]);
  return id;
}

// ---------- halls ----------
const venues = SHEET.venues.map(v => Object.assign({}, v));
const hallByName = new Map(venues.map(v => [norm(v.name), v.id]));
function hallOf(cup, name) {
  if (!name) return null;
  if (hallByName.has(norm(name))) return hallByName.get(norm(name));
  const id = 'bl-' + slug(name);
  venues.push({ id, name });
  hallByName.set(norm(name), id);
  warn(cup, `basket.lv zāle „${name}” nav lapā „Zāles” — mājaslapā rādīs basket.lv nosaukumu. Pievieno to lapā „Zāles”, lai būtu arī adrese.`);
  return id;
}

// ---------- basket.lv data ----------
const BL = {};
CUPS.forEach(cup => {
  const dir = path.join(ROOT, 'src', 'basket', cup);
  const fx = readJson(path.join(dir, 'fixtures.json'), null);
  const roster = readJson(path.join(dir, 'roster.json'), null);
  BL[cup] = { fixtures: fx ? fx.fixtures : [], roster, dir, used: new Set() };
  if (roster) roster.teams.forEach(t => teamOf(cup, t.name, t.entity));
  BL[cup].fixtures.forEach(f => { f.h = teamOf(cup, f.home.name, f.home.entity); f.a = teamOf(cup, f.away.name, f.away.entity); });
});

// ---------- players: registered players + anyone in a box score ----------
const playerIdx = new Map();          // teamId|pid -> index into team.players
function addPlayer(teamId, pid, name) {
  const t = teamById.get(teamId);
  if (!t || !name) return null;
  const key = teamId + '|' + (pid || 'name:' + norm(name));
  if (playerIdx.has(key)) return playerIdx.get(key);
  t.players.push({ name: name, pid: pid || null });
  playerIdx.set(key, t.players.length - 1);
  return t.players.length - 1;
}
const rosterRows = [];
CUPS.forEach(cup => { const r = BL[cup].roster; if (r) r.players.forEach(p => rosterRows.push([cup, p])); });
// Registered players, alphabetically per team.
rosterRows.slice().sort((x, y) => x[1].name.localeCompare(y[1].name, 'lv')).forEach(([cup, p]) => {
  const tid = teamOf(cup, p.team, p.entity);
  if (tid) addPlayer(tid, p.pid, p.name);
});

// ---------- the calendar ----------
const KG = 'Playoff kvalifikācijas grupa';
const STAGE = {
  dbck: { 'Grupu turnīrs': 'group', [KG]: 'k', 'Cerību kauss': 'hope', 'Pusfināls': 'playoff', 'Spēle par 3. vietu': 'playoff', 'Fināls': 'playoff' },
  jssc: { 'Astotdaļfināls': 'cup', 'Ceturtdaļfināls': 'cup', 'Pusfināls': 'cup', 'Fināls': 'cup' }
};
// Rounds as the site knows them (the same ids, stages and labels as the demo season).
function roundOf(row) {
  const st = STAGE[row.cup][row.stage];
  if (st === 'group') return row.round ? ['R' + row.round, 'Grupu turnīrs', row.round + '. kārta'] : ['R-' + row.date, 'Grupu turnīrs', dshort(row.date)];
  if (st === 'k') return row.round ? ['K' + row.round, KG, row.round + '. kārta'] : ['K-' + row.date, KG, dshort(row.date)];
  if (st === 'hope') return { H1: ['H1R', 'Cerību kauss', '1. pusfināls'], H2: ['H2R', 'Cerību kauss', '2. pusfināls'], HF: ['HF', 'Cerību kauss', 'Fināls'] }[row.tie];
  if (st === 'playoff') return /^SF/.test(row.tie) ? ['SFG' + (row.n || 1), 'Pusfināli', (row.n || 1) + '. spēle'] : ['FIN', 'Fināli', 'Zelta un bronzas fināls'];
  if (/^R16/.test(row.tie)) return ['C16' + (row.n === 2 ? 'B' : 'A'), 'Astotdaļfināls', (row.n || 1) + '. spēle'];
  if (/^QF/.test(row.tie)) return ['C8' + (row.n === 2 ? 'B' : 'A'), 'Ceturtdaļfināls', (row.n || 1) + '. spēle'];
  if (/^SF/.test(row.tie)) return ['C4A', 'Pusfināls', ''];
  return ['CF', 'Fināls', ''];
}
const rounds = new Map();
const games = [];
const unscheduled = [];
const byRowId = new Map();
SHEET.calendar.forEach(row => {
  if (row.status === 'Atcelta') return;
  const st = STAGE[row.cup][row.stage];
  const g = { id: row.id.toLowerCase(), sheetId: row.id, comp: row.cup, stage: st, date: row.date, time: row.time, venue: row.hall || null, home: row.home, away: row.away };
  if (row.tie) { g.tie = row.tie; g.n = row.n || 1; }
  if (row.status === 'Ja vajag') g.ifNeeded = true;
  const [rid, rstage, rlabel] = roundOf(row);
  g.round = rid;
  if (!rounds.has(rid)) rounds.set(rid, { id: rid, comp: row.cup, stage: rstage, label: rlabel, date: null });
  byRowId.set(row.id.toLowerCase(), g);
  games.push(g);
});

// ---------- decisions ("Lēmumi") always win ----------
// Applied before the basket.lv games are tied to the calendar (a no-show changes the
// standings that later slot codes depend on) and again after each basket.lv result.
const lots = [];
const decisionsFor = new Map();
(SHEET.decisions || []).forEach(d => {
  if (d.kind === 'Izloze') { lots.push(d.value.split(',').map(x => x.trim()).filter(Boolean)); return; }
  const g = byRowId.get(d.game.toLowerCase());
  if (!g) { warn('', `Lēmums par ${d.game}: šīs spēles nav kalendārā.`); return; }
  if (!decisionsFor.has(g.id)) decisionsFor.set(g.id, []);
  decisionsFor.get(g.id).push(d);
});
function applyDecisions(g) {
  (decisionsFor.get(g.id) || []).forEach(d => {
    if (d.kind === 'Neieradās mājinieki' || d.kind === 'Neieradās viesi') {
      const homeOut = d.kind === 'Neieradās mājinieki';
      g.hs = homeOut ? 0 : 20; g.as = homeOut ? 20 : 0; g.forfeit = homeOut ? 'home' : 'away'; g.done = true;
      delete g.box; delete g.q; delete g.ot; delete g.bib; delete g.treb;
    } else if (d.kind === 'Rezultāts anulēts') {
      g.hs = null; g.as = null; g.done = false; g.annulled = true;
      delete g.box; delete g.q; delete g.ot; delete g.bib; delete g.treb;
    } else if (d.kind === 'Rezultāta labojums') {
      const m = /^(\d+)\s*:\s*(\d+)$/.exec(d.value);
      g.hs = +m[1]; g.as = +m[2]; g.done = true; g.corrected = true;
    }
  });
}
games.forEach(applyDecisions);

// ---------- tie each basket.lv game to its calendar row ----------
function partial() {
  return { teams, venues, rounds: [...rounds.values()], games: games.filter(g => g.date), mvps: [], lots };
}
function resolveTeam(eng, cup, ref) { return teamById.has(ref) ? ref : eng.resolve(cup, ref).team; }
// Calendar order; rows without a date go last (they can still be found on basket.lv).
const order = games.slice().sort((x, y) => ((x.date || '9999') + (x.time || '')).localeCompare((y.date || '9999') + (y.time || '')) || (x.n || 0) - (y.n || 0));
let eng = Engine.create(partial(), '9999-12-31');
order.forEach(g => {
  const h = resolveTeam(eng, g.comp, g.home), a = resolveTeam(eng, g.comp, g.away);
  if (!h || !a) return;                                  // teams not known yet
  const cands = BL[g.comp].fixtures.filter(f => !BL[g.comp].used.has(f.id) && f.h && f.a && ((f.h === h && f.a === a) || (f.h === a && f.a === h)));
  if (!cands.length) return;
  const ref = g.date || cands[0].start.slice(0, 10);
  cands.sort((x, y) => days(x.start.slice(0, 10), ref) - days(y.start.slice(0, 10), ref));
  const f = cands[0];
  if (g.date && days(f.start.slice(0, 10), g.date) > MATCH_DAYS) return;
  BL[g.comp].used.add(f.id);
  applyFixture(g, f, h, a);
  applyDecisions(g);
  eng = Engine.create(partial(), '9999-12-31');          // later rows may depend on this result
});

function applyFixture(g, f, h, a) {
  g.bl = f.id;
  const d = f.start.slice(0, 10), t = f.start.slice(11, 16);
  if (g.date && (g.date !== d || (g.time && g.time !== t))) notes.push([g.comp, `${g.sheetId}: basket.lv laiks ${dshort(d)} ${t} (kalendārā ${dshort(g.date)} ${g.time || '—'}) — rāda basket.lv laiku.`]);
  g.date = d; g.time = t;
  const v = hallOf(g.comp, f.venue);
  if (v) g.venue = v;
  // Home and away as on basket.lv.
  if (f.h === a && f.a === h) {
    const x = g.home; g.home = g.away; g.away = x;
    notes.push([g.comp, `${g.sheetId}: basket.lv mājinieki ir ${teamById.get(a).short}, kalendārā — ${teamById.get(h).short}. Rāda kā basket.lv.`]);
  }
  if (f.status === 'CONFIRMED' && f.home.score != null && f.away.score != null) {
    g.hs = f.home.score; g.as = f.away.score; g.done = true;
    const box = readJson(path.join(BL[g.comp].dir, 'games', f.id + '.json'), null);
    if (box) addBox(g, box, f);
    else if (!decisionsFor.has(g.id)) warn(g.comp, `${g.sheetId} (${dshort(d)} ${f.home.name} – ${f.away.name}): rezultāts ir, bet spēlētāju statistika vēl nav nolasīta.`);
  }
}

function addBox(g, box, f) {
  g.q = (box.quarters || []).map(q => [q[0], q[1]]);
  if (box.ot) g.ot = true;
  g.box = { h: [], a: [] };
  g.bib = { h: {}, a: {} };
  const treb = {};
  [['h', 'home', f.h], ['a', 'away', f.a]].forEach(([side, bl, tid]) => {
    const b = box[bl] || {};
    (b.players || []).forEach(p => {
      const idx = addPlayer(tid, p.pid, p.name);
      if (idx == null) return;
      const s = p.s.slice();
      if (s[16] == null) s[16] = 0;                       // +/- missing on basket.lv
      g.box[side].push([idx, p.starter ? 1 : 0].concat(s));
      if (p.no) g.bib[side][idx] = String(p.no);
    });
    (b.dnp || []).forEach(p => {
      const idx = addPlayer(tid, p.pid, p.name);
      if (idx == null) return;
      g.box[side].push([idx, 0, null]);
      if (p.no) g.bib[side][idx] = String(p.no);
    });
    if (b.teamReb && (b.teamReb[0] || b.teamReb[1])) treb[side] = b.teamReb;
  });
  if (treb.h || treb.a) g.treb = { h: treb.h || [0, 0], a: treb.a || [0, 0] };
}

// basket.lv games that are not in the calendar
CUPS.forEach(cup => BL[cup].fixtures.forEach(f => {
  if (BL[cup].used.has(f.id)) return;
  warn(cup, `basket.lv spēle ${dshort(f.start.slice(0, 10))} ${f.start.slice(11, 16)} ${f.home.name} – ${f.away.name} nav atrasta kalendārā — mājaslapā to nerāda. Pārbaudi komandas un datumu lapā „Kalendārs”.`);
}));
unknownTeams.forEach(([cup, name]) => warn(cup, `basket.lv komanda „${name}” nav atrasta lapā „Komandas”. Ieraksti to kolonnā „basket.lv nosaukums”.`));

// ---------- dates of rounds; games without a date ----------
const dated = games.filter(g => g.date);
games.filter(g => !g.date).forEach(g => { unscheduled.push(g.sheetId); });
if (unscheduled.length) warn('', `Bez datuma (mājaslapā vēl nerāda): ${unscheduled.join(', ')}.`);
dated.forEach(g => { const r = rounds.get(g.round); if (!r.date || g.date < r.date) r.date = g.date; });
const usedRounds = [...rounds.values()].filter(r => r.date);

// Past games without a result
dated.filter(g => g.date < TODAY && !g.done && !g.ifNeeded).forEach(g => {
  const late = days(g.date, TODAY);
  if (late >= 2) warn(g.comp, `${g.sheetId} (${dshort(g.date)}): spēle bija, bet rezultāta vēl nav${g.bl ? ' (basket.lv tā nav apstiprināta)' : ' (basket.lv tās nav)'}.`);
});

// Two players with the same name in one team: give the second its own address.
teams.forEach(t => {
  const seen = {};
  t.players.forEach(p => {
    const s = slug(p.name);
    seen[s] = (seen[s] || 0) + 1;
    if (seen[s] > 1) { p.key = s + '-' + seen[s]; warn('', `${t.short}: divi spēlētāji ar vārdu „${p.name}” (basket.lv). Ja tā ir dubulta reģistrācija, izlabo to basket.lv.`); }
  });
});

// ---------- MVPs (the sheet names the player; stats come from the box score) ----------
const final = Engine.create({ teams, venues, rounds: usedRounds, games: dated, mvps: [], lots }, '9999-12-31');
function findRow(cup, date, teamId, player, gameId) {
  const list = dated.filter(g => g.comp === cup && g.box && (gameId ? g.sheetId.toLowerCase() === gameId.toLowerCase() : g.date === date));
  for (const g of list) {
    for (const side of ['h', 'a']) {
      const tid = final.resolve(cup, side === 'h' ? g.home : g.away).team;
      if (tid !== teamId) continue;
      const r = g.box[side].find(x => x[2] != null && norm(teamById.get(tid).players[x[0]].name) === norm(player));
      if (r) return { g, r, tid };
    }
  }
  return null;
}
const mvps = [];
(SHEET.mvps || []).forEach(m => {
  const hit = findRow(m.cup, m.date, m.team, m.player, m.game);
  if (!hit) { warn(m.cup, `MVP ${dshort(m.date)} „${m.player}” (${m.team}): spēlētājs nav atrasts šīs dienas protokolā. Vārdam jābūt tieši kā basket.lv.`); return; }
  const r = hit.r;
  mvps.push({ comp: m.cup, date: hit.g.date, game: hit.g.id, team: hit.tid, idx: r[0], player: teamById.get(hit.tid).players[r[0]].name,
    pts: r[3], reb: r[10] + r[11], ast: r[12], eff: r[17] });
});
const monthMvps = [];
(SHEET.monthMvps || []).forEach(m => {
  const t = teamById.get(m.team);
  const idx = t.players.findIndex(p => norm(p.name) === norm(m.player));
  if (idx < 0) { warn(m.cup, `Mēneša MVP ${m.month} „${m.player}”: spēlētājs nav komandas ${t.short} sarakstā. Vārdam jābūt tieši kā basket.lv.`); return; }
  monthMvps.push({ comp: m.cup, month: m.month, team: m.team, idx, player: t.players[idx].name });
});

// ---------- output ----------
const out = {
  season: SHEET.settings.season,
  sample: false,
  live: true,
  teams,
  venues,
  rounds: usedRounds.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id)),
  games: dated.map(g => { const o = Object.assign({}, g); delete o.sheetId; return o; }),
  mvps,
  monthMvps,
  lots
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');

// ---------- report ----------
const lines = ['## Mājaslapas dati', ''];
CUPS.forEach(cup => {
  const gs = out.games.filter(g => g.comp === cup);
  const fromBl = gs.filter(g => g.bl).length, played = gs.filter(g => g.done).length;
  lines.push(`- ${CUP_NAME[cup]}: ${gs.length} spēles kalendārā, ${fromBl} sasaistītas ar basket.lv, ${played} ar rezultātu.`);
});
lines.push(`- Spēlētāji: ${teams.reduce((a, t) => a + t.players.length, 0)} (${teams.map(t => t.short + ' ' + t.players.length).join(', ')}).`);
if (mvps.length || monthMvps.length) lines.push(`- MVP: ${mvps.length} kārtu, ${monthMvps.length} mēneša.`);
if (notes.length) { lines.push('', '**Atšķirības no kalendāra (rāda basket.lv):**', ''); notes.forEach(([c, m]) => lines.push(`- ${CUP_NAME[c] || ''}: ${m}`)); }
if (warnings.length) { lines.push('', `### Brīdinājumi (${warnings.length})`, ''); warnings.forEach(([c, m]) => lines.push(`- ${c ? CUP_NAME[c] + ': ' : ''}${m}`)); }
const report = lines.join('\n') + '\n';
process.stderr.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
