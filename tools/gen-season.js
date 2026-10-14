// Generates a realistic SAMPLE 2026/27 season for the prototype.
// Team names and logos are last season's teams (plus two placeholders);
// every score, player and MVP is made up.
// Scheduling rules from the organisers: one hall per round, at most 4 games.
// Run: node tools/gen-season.js > src/sample-data.json
'use strict';
const Engine = require('../src/engine.js');

// ---- deterministic randomness ----
let seed = 20262027;
function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function randn() { return (rnd() + rnd() + rnd() + rnd() - 2) * 1.7; }
function rint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

// ---- teams: draw simulated per 8.2 (pots from 2025/26 final standings) ----
// Pot 1: Buki, Skandijs · Pot 2: Vilki, Jaunpils · Pot 3: Līvbērze, Brocēni, Īle
// Pot 4: Valauto, Doks, Sprīdītis · Joker: Auce, Bēne. Alternating A/B.
const L = id => 'assets/teams/' + id + '.webp';
const teams = [
  { id: 'buki', name: 'BK Buki / Sandramebeles.lv', short: 'Buki', group: 'A', color: '#3A3A3A', logo: L('buki'), str: 90 },
  { id: 'vilki', name: 'Vilki', short: 'Vilki', group: 'A', color: '#5B6C8F', logo: L('vilki'), str: 70 },
  { id: 'livberze', name: 'BK Līvbērze', short: 'Līvbērze', group: 'A', color: '#1F4E79', logo: L('livberze'), str: 81 },
  { id: 'ile', name: 'Īle / Penkule', short: 'Īle', group: 'A', color: '#B5651D', logo: L('ile'), str: 80 },
  { id: 'doks', name: 'Doks', short: 'Doks', group: 'A', color: '#1B2A4A', logo: L('doks'), str: 79 },
  { id: 'auce', name: 'BK Auce', short: 'Auce', group: 'A', color: '#C0392B', str: 74 },
  { id: 'skandijs', name: 'Skandijs / HQ Chipper Parts', short: 'Skandijs', group: 'B', color: '#C8102E', logo: L('skandijs'), str: 88 },
  { id: 'jaunpils', name: 'Jaunpils', short: 'Jaunpils', group: 'B', color: '#7B3A2E', logo: L('jaunpils'), str: 69 },
  { id: 'broceni', name: 'Brocēni', short: 'Brocēni', group: 'B', color: '#0B7A5A', logo: L('broceni'), str: 82 },
  { id: 'valauto', name: 'Valauto', short: 'Valauto', group: 'B', color: '#6B1F2A', logo: L('valauto'), str: 72 },
  { id: 'spriditis', name: 'TSK Sprīdītis', short: 'Sprīdītis', group: 'B', color: '#1E8E3E', logo: L('spriditis'), str: 71 },
  { id: 'bene', name: 'BK Bēne', short: 'Bēne', group: 'B', color: '#6B8E23', str: 76 }
];
const STR = Object.fromEntries(teams.map(t => [t.id, t.str]));

const venues = [
  { id: 'dobele', name: 'Dobeles Sporta halle', address: 'Tērvetes iela 10, Dobele' },
  { id: 'jelgava', name: 'Jelgavas Sporta halle', address: 'Mātera iela 44A, Jelgava' }
];

const rounds = [];
const games = [];
const mvps = [];
function addRound(r) { rounds.push(r); }

// ---- players (fictional) ----
const FIRST = ['Kristaps', 'Rihards', 'Mārtiņš', 'Edgars', 'Jānis', 'Artūrs', 'Roberts', 'Ainārs', 'Gatis', 'Kārlis', 'Toms', 'Dāvis', 'Raivis', 'Uģis', 'Andris', 'Elvis', 'Valters', 'Reinis', 'Ivo', 'Krišjānis', 'Oskars', 'Edijs', 'Ralfs', 'Sandis'];
const LAST = ['Bērziņš', 'Kalniņš', 'Ozols', 'Liepiņš', 'Krūmiņš', 'Zariņš', 'Pētersons', 'Vītols', 'Jansons', 'Balodis', 'Kļaviņš', 'Siliņš', 'Lapiņš', 'Eglītis', 'Strautiņš', 'Freimanis', 'Grīnbergs', 'Ābele', 'Dzenis', 'Upītis', 'Saulītis', 'Zvirbulis', 'Vanags', 'Kronbergs'];
const roster = {};
teams.forEach((t, i) => { roster[t.id] = [0, 1, 2].map(k => FIRST[(i * 5 + k * 7) % FIRST.length] + ' ' + LAST[(i * 3 + k * 11) % LAST.length]); });

// ---- scoring ----
function sim(h, a) {
  let hs = Math.round(70 + (STR[h] - 78) * 0.55 + 1.5 + randn() * 4.5);
  let as = Math.round(70 + (STR[a] - 78) * 0.55 + randn() * 4.5);
  let ot = false;
  if (hs === as) { ot = true; const x = rint(6, 12); hs += x; as += x - rint(1, 5) * (rnd() < (STR[h] >= STR[a] ? 0.65 : 0.35) ? 1 : -1); }
  return { hs, as, ot };
}
function forced(winner, loser, h) {
  const w = Math.round(76 + randn() * 4), l = w - rint(3, 14);
  return h === winner ? { hs: w, as: l, ot: false } : { hs: l, as: w, ot: false };
}

let gid = 0;
function game(o) { const g = Object.assign({ id: 'g' + (++gid) }, o); games.push(g); return g; }
function ctx(today = '2099-01-01') { return Engine.create({ teams, venues, rounds, games, mvps }, today); }
function res(comp, ref) { return ctx().resolve(comp, ref).team; }
function refGame(comp, stage, round, date, time, venue, home, away, extra = {}, scoreFn) {
  const h = res(comp, home), a = res(comp, away);
  const s = scoreFn ? scoreFn(h, a) : sim(h, a);
  return game(Object.assign({ comp, stage, round, date, time, venue, home, away, hs: s.hs, as: s.as, ot: !!s.ot }, extra));
}

const SLOTS = ['11:00', '12:30', '14:00', '15:30'];
const venueFor = i => (i % 2 ? 'jelgava' : 'dobele');

// ---- 1. Group stage: 30 games → 8 rounds (4,4,4,4,4,4,4,2) ----
// Each group plays 5 match days of 3 games (circle method). Match days are
// interleaved A1, B1, A2, B2 … and packed into rounds of at most 4 games, so
// no team ever plays twice in one round.
function roundRobin(ids) {
  const arr = ids.slice(); const out = [];
  for (let r = 0; r < arr.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < arr.length / 2; i++) {
      const x = arr[i], y = arr[arr.length - 1 - i];
      pairs.push(r % 2 ? [y, x] : [x, y]);
    }
    out.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return out;
}
const rrA = roundRobin(teams.filter(t => t.group === 'A').map(t => t.id));
const rrB = roundRobin(teams.filter(t => t.group === 'B').map(t => t.id));
const flat = [];
for (let md = 0; md < 5; md++) { rrA[md].forEach(p => flat.push(p)); rrB[md].forEach(p => flat.push(p)); }
let forfeitDone = false;
const groupDates = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13'];
groupDates.forEach((date, r) => {
  const rid = 'R' + (r + 1);
  addRound({ id: rid, comp: 'dbck', stage: 'Grupu turnīrs', label: (r + 1) + '. kārta', date });
  flat.slice(r * 4, r * 4 + 4).forEach(([h, a], i) => {
    let s = sim(h, a), forfeit;
    // One no-show for realism: in their second-round game Vilki do not turn up (8.5 / 13.7).
    if (!forfeitDone && r >= 1 && (h === 'vilki' || a === 'vilki')) { forfeitDone = true; forfeit = h === 'vilki' ? 'home' : 'away'; s = h === 'vilki' ? { hs: 0, as: 20 } : { hs: 20, as: 0 }; }
    game({ comp: 'dbck', stage: 'group', round: rid, date, time: SLOTS[i], venue: venueFor(r), home: h, away: a, hs: s.hs, as: s.as, ot: !!s.ot, forfeit });
  });
});

// ---- Rounds after the group stage (one hall, ≤ 4 games each) ----
const J = Engine.STRUCTURE.jssc.ties;
[['C16A', '2027-01-03', 'Astotdaļfināls', '1. spēle'], ['C16B', '2027-01-17', 'Astotdaļfināls', '2. spēle'],
 ['C8A', '2027-01-31', 'Ceturtdaļfināls', '1. spēle'], ['C8B', '2027-02-14', 'Ceturtdaļfināls', '2. spēle'],
 ['C4A', '2027-02-28', 'Pusfināls', '1. spēle'], ['C4B', '2027-03-14', 'Pusfināls', '2. spēle'],
 ['CF', '2027-04-11', 'Fināls', '']].forEach(([id, date, stage, label]) => addRound({ id, comp: 'jssc', stage, label, date }));

function cupLeg(tieIds, rid, date, venue, n) {
  tieIds.forEach((tid, i) => {
    const def = J[tid];
    if (n === 1) { refGame('jssc', 'cup', rid, date, SLOTS[i], venue, def.a, def.b, { tie: tid, n: 1 }); return; }
    const h = res('jssc', def.b), a = res('jssc', def.a);
    const first = games.find(g => g.comp === 'jssc' && g.tie === tid && g.n === 1);
    const s = sim(h, a); s.ot = false;
    // Level on aggregate after regulation → 5-minute overtime(s) in leg 2.
    if (first.as + s.hs === first.hs + s.as) {
      s.ot = true; const x = rint(7, 12); const hWins = rnd() < (STR[h] >= STR[a] ? 0.6 : 0.4);
      s.hs += hWins ? x : x - rint(1, 4); s.as += hWins ? x - rint(1, 4) : x;
    }
    game({ comp: 'jssc', stage: 'cup', round: rid, date, time: SLOTS[i], venue, home: def.b, away: def.a, hs: s.hs, as: s.as, ot: s.ot, tie: tid, n: 2 });
  });
}

// K group: 16 games (every A1–A4 v every B1–B4) in rounds of 4,3,3,3,3.
// Hope Cup games join rounds 2–4 so each round still has at most 4 games.
const lat = r => [0, 1, 2, 3].map(i => ['A' + (i + 1), 'B' + (((i + r) % 4) + 1)]);
const kRounds = [
  lat(0),
  lat(1).filter((_, i) => i !== 1),
  lat(2).filter((_, i) => i !== 2),
  lat(3).filter((_, i) => i !== 0),
  [lat(1)[1], lat(2)[2], lat(3)[0]]
];
const hopeIn = { 1: ['H1', 'A5', 'B6'], 2: ['H2', 'B5', 'A6'], 3: ['HF', 'W:H1', 'W:H2'] };
const kDates = ['2026-12-20', '2027-01-10', '2027-01-24', '2027-02-07', '2027-02-21'];

// Interleave in calendar order.
function kRound(r) {
  const rid = 'K' + (r + 1), date = kDates[r], venue = venueFor(r + 1);
  addRound({ id: rid, comp: 'dbck', stage: 'K grupa', label: (r + 1) + '. kārta', date });
  kRounds[r].forEach(([a, b], i) => {
    const [home, away] = (i + r) % 2 ? [b, a] : [a, b];
    refGame('dbck', 'k', rid, date, SLOTS[i], venue, home, away);
  });
  if (hopeIn[r]) {
    const [tie, a, b] = hopeIn[r];
    const hid = tie === 'HF' ? 'HF' : 'H' + tie.slice(1) + 'R';
    addRound({ id: hid, comp: 'dbck', stage: 'Cerību kauss', label: tie === 'HF' ? 'Fināls' : tie.slice(1) + '. pusfināls', date });
    refGame('dbck', 'hope', hid, date, SLOTS[3], venue, a, b, { tie, n: 1 });
  }
}

kRound(0);                                                     // 20 Dec
cupLeg(['R16_1', 'R16_2', 'R16_3', 'R16_4'], 'C16A', '2027-01-03', 'jelgava', 1);
kRound(1);                                                     // 10 Jan
cupLeg(['R16_1', 'R16_2', 'R16_3', 'R16_4'], 'C16B', '2027-01-17', 'dobele', 2);
kRound(2);                                                     // 24 Jan
cupLeg(['QF1', 'QF2', 'QF3', 'QF4'], 'C8A', '2027-01-31', 'jelgava', 1);
kRound(3);                                                     // 7 Feb
cupLeg(['QF1', 'QF2', 'QF3', 'QF4'], 'C8B', '2027-02-14', 'dobele', 2);
kRound(4);                                                     // 21 Feb
cupLeg(['SF1', 'SF2'], 'C4A', '2027-02-28', 'jelgava', 1);

// ---- Dobele semifinals, best of three ----
// Scripted so the demo shows both states: SF1 ends 2–0, SF2 goes to game 3.
addRound({ id: 'SFG1', comp: 'dbck', stage: 'Pusfināli', label: '1. spēle', date: '2027-03-07' });
addRound({ id: 'SFG2', comp: 'dbck', stage: 'Pusfināli', label: '2. spēle', date: '2027-03-21' });
addRound({ id: 'SFG3', comp: 'dbck', stage: 'Pusfināli', label: '3. spēle', date: '2027-04-04' });
const K = n => res('dbck', 'K' + n);
const win = (w, l) => (h) => forced(w, l, h);
refGame('dbck', 'playoff', 'SFG1', '2027-03-07', '13:00', 'dobele', 'K1', 'K4', { tie: 'SF1', n: 1 }, win(K(1), K(4)));
refGame('dbck', 'playoff', 'SFG1', '2027-03-07', '15:00', 'dobele', 'K2', 'K3', { tie: 'SF2', n: 1 }, win(K(2), K(3)));
cupLeg(['SF1', 'SF2'], 'C4B', '2027-03-14', 'dobele', 2);
refGame('dbck', 'playoff', 'SFG2', '2027-03-21', '13:00', 'jelgava', 'K4', 'K1', { tie: 'SF1', n: 2 }, win(K(1), K(4)));
refGame('dbck', 'playoff', 'SFG2', '2027-03-21', '15:00', 'jelgava', 'K3', 'K2', { tie: 'SF2', n: 2 }, win(K(3), K(2)));
// 28 March is Easter Sunday — no games.
refGame('dbck', 'playoff', 'SFG3', '2027-04-04', '13:00', 'dobele', 'K1', 'K4', { tie: 'SF1', n: 3, ifNeeded: true }, () => ({ hs: null, as: null }));
refGame('dbck', 'playoff', 'SFG3', '2027-04-04', '15:00', 'dobele', 'K2', 'K3', { tie: 'SF2', n: 3, ifNeeded: true }, win(K(2), K(3)));
refGame('jssc', 'cup', 'CF', '2027-04-11', '15:00', 'jelgava', 'W:SF1', 'W:SF2', { tie: 'F', n: 1 });
addRound({ id: 'FIN', comp: 'dbck', stage: 'Fināli', label: 'Zelta un bronzas fināls', date: '2027-04-18' });
refGame('dbck', 'playoff', 'FIN', '2027-04-18', '13:00', 'dobele', 'L:SF1', 'L:SF2', { tie: 'BRONZE', n: 1 });
refGame('dbck', 'playoff', 'FIN', '2027-04-18', '15:30', 'dobele', 'W:SF1', 'W:SF2', { tie: 'GOLD', n: 1 });

// ---- Placeholder box scores (fictional players, same fields as basket.lv) ----
// Box row layout (compact array, also used by the site):
// [rosterIdx, starter, seconds, pts, 2pm, 2pa, 3pm, 3pa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf, eff, plusMinus]
// A player who was on the roster but did not play: [rosterIdx, 0, null]
const ROLE = [1.6, 1.4, 1.25, 1.1, 1.0, 0.85, 0.75, 0.6, 0.5, 0.4];
const rosters = {};
teams.forEach((t, i) => {
  const used = new Set();
  rosters[t.id] = ROLE.map((w, k) => {
    let no; do { no = rint(0, 55); } while (used.has(no)); used.add(no);
    return { no: String(no), name: FIRST[(i * 7 + k * 5 + 3) % FIRST.length] + ' ' + LAST[(i * 11 + k * 7 + 1) % LAST.length], w: w * (0.9 + rnd() * 0.2) };
  });
});

function alloc(total, weights) {
  const s = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map(w => total * w / s);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; rem > 0; j = (j + 1) % order.length, rem--) out[order[j][1]]++;
  return out;
}
function shots(p) {
  const t3 = p >= 3 ? rint(0, Math.floor(p * 0.4 / 3)) : 0;
  const rem = p - 3 * t3;
  let ft = rint(0, Math.min(rem, Math.round(rem * 0.35)));
  if ((rem - ft) % 2) ft = ft + 1 <= rem ? ft + 1 : ft - 1;
  const two = (rem - ft) / 2;
  return {
    m2: two, a2: two + Math.round(two * (0.6 + rnd() * 0.8)) + rint(0, 1),
    m3: t3, a3: t3 + Math.round(t3 * (1.2 + rnd() * 1.2)) + rint(0, 2),
    ftm: ft, fta: ft + (ft ? rint(0, Math.ceil(ft * 0.5)) : (rnd() < 0.2 ? 2 : 0))
  };
}
function teamBox(teamId, pts, nOT, diff) {
  const ros = rosters[teamId];
  const nPlay = rint(8, 10);
  const bench = [7, 8, 9].sort(() => rnd() - 0.5).slice(0, nPlay - 7);
  const part = [0, 1, 2, 3, 4, 5, 6].concat(bench);
  const gw = part.map(i => ros[i].w * (0.75 + rnd() * 0.5));
  const starters = new Set(part.map((p, j) => [gw[j], p]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(x => x[1]));
  const cap = (40 + 5 * nOT) * 60 - 40;
  let secs = alloc((200 + 25 * nOT) * 60, part.map((p, j) => gw[j] * (starters.has(p) ? 1.7 : 1)));
  for (let it = 0; it < 6; it++) {
    let ex = 0;
    secs = secs.map(s => { if (s > cap) { ex += s - cap; return cap; } return s; });
    if (!ex) break;
    const add = alloc(ex, secs.map(s => (s < cap ? s : 0)));
    secs = secs.map((s, i) => s + add[i]);
  }
  const ptsA = alloc(pts, part.map((p, j) => gw[j] * secs[j] * (0.6 + rnd() * 0.8)));
  const by = (n) => alloc(n, secs.map(s => s * (0.4 + rnd())));
  const reb = by(rint(34, 50));
  const orb = alloc(Math.round(reb.reduce((a, b) => a + b, 0) * (0.22 + rnd() * 0.1)), reb).map((o, j) => Math.min(o, reb[j]));
  const ast = by(rint(8, 18)), stl = by(rint(4, 11)), blk = by(rint(1, 6)), tov = by(rint(8, 17));
  const pf = by(rint(12, 21));
  for (let guard = 0; pf.some(f => f > 5) && guard < 50; guard++) {
    const i = pf.findIndex(f => f > 5), j = pf.findIndex(f => f < 4);
    pf[i]--; if (j >= 0) pf[j]++;
  }
  const full = (40 + 5 * nOT) * 60;
  const pm = secs.map(s => Math.round(diff * s / full + (rnd() - 0.5) * 8));
  const top = secs.indexOf(Math.max(...secs));
  pm[top] += 5 * diff - pm.reduce((a, b) => a + b, 0);
  const rows = part.map((p, j) => {
    const s = shots(ptsA[j]);
    const eff = ptsA[j] + reb[j] + ast[j] + stl[j] + blk[j] - (s.a2 + s.a3 - s.m2 - s.m3) - (s.fta - s.ftm) - tov[j];
    return [p, starters.has(p) ? 1 : 0, secs[j], ptsA[j], s.m2, s.a2, s.m3, s.a3, s.ftm, s.fta, orb[j], reb[j] - orb[j], ast[j], stl[j], blk[j], tov[j], pf[j], eff, pm[j]];
  });
  const dnp = [7, 8, 9].filter(i => !part.includes(i));
  if (dnp.length && rnd() < 0.4) rows.push([dnp[0], 0, null]);
  return rows;
}

const final = ctx();
games.filter(g => g.hs != null && !g.forfeit).forEach(g => {
  let otH = 0, otA = 0, nOT = 0;
  if (g.ot) {
    nOT = 1;
    let need = g.hs - g.as; // regulation ended level
    if (g.comp === 'jssc' && g.n === 2) { // aggregate was level after regulation of leg 2
      const f = games.find(x => x.comp === 'jssc' && x.tie === g.tie && x.n === 1);
      need = (g.hs - g.as) - (f.hs - f.as);
    }
    const lo = rint(4, 9);
    if (need >= 0) { otA = lo; otH = lo + need; } else { otH = lo; otA = lo - need; }
  }
  const qw = [0, 1, 2, 3].map(() => 0.8 + rnd() * 0.4);
  const qh = alloc(g.hs - otH, qw.map(w => w * (0.85 + rnd() * 0.3)));
  const qa = alloc(g.as - otA, qw.map(w => w * (0.85 + rnd() * 0.3)));
  g.q = qh.map((v, i) => [v, qa[i]]);
  if (nOT) g.q.push([otH, otA]);
  const h = final.resolve(g.comp, g.home).team, a = final.resolve(g.comp, g.away).team;
  g.box = { h: teamBox(h, g.hs, nOT, g.hs - g.as), a: teamBox(a, g.as, nOT, g.as - g.hs) };
});

// ---- MVP per cup per game day: best efficiency, winners get a small bonus ----
const best = {};
games.filter(g => g.box).forEach(g => {
  const h = final.resolve(g.comp, g.home).team, a = final.resolve(g.comp, g.away).team;
  [['h', h, g.hs > g.as], ['a', a, g.as > g.hs]].forEach(([side, team, won]) => {
    g.box[side].forEach(r => {
      if (r[2] == null) return;
      const score = r[17] + (won ? 6 : 0);
      const k = g.comp + '|' + g.date;
      if (!best[k] || score > best[k].score) {
        best[k] = { score, comp: g.comp, date: g.date, game: g.id, team, idx: r[0], player: rosters[team][r[0]].name, pts: r[3], reb: r[10] + r[11], ast: r[12], eff: r[17] };
      }
    });
  });
});
Object.values(best).forEach(({ score, ...m }) => mvps.push(m));

// Sanity checks for the scheduling rules.
const perRound = {};
games.forEach(g => { const k = g.comp + g.date; (perRound[k] = perRound[k] || []).push(g); });
Object.entries(perRound).forEach(([k, list]) => {
  if (list.length > 4) throw new Error('more than 4 games on ' + k);
  if (new Set(list.map(g => g.venue)).size > 1) throw new Error('two halls on ' + k);
});

const out = {
  season: '2026/27',
  sample: true,
  teams: teams.map(({ str, ...t }) => Object.assign(t, { players: rosters[t.id].map(p => ({ no: p.no, name: p.name })) })),
  venues, rounds,
  games: games.map(g => { const o = Object.assign({}, g); if (!o.ot) delete o.ot; if (!o.forfeit) delete o.forfeit; return o; }),
  mvps
};
process.stdout.write(JSON.stringify(out, null, 1));
