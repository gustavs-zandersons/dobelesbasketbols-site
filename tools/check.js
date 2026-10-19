// Sanity checks run in CI before every deploy:
//   node tools/check.js
// 1) the built page's inline scripts parse, 2) the engine runs at several
// points of the season, 3) every box score adds up to its final score,
// 4) sponsor logos and poster photos exist, 5) sponsors page data is valid.
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../src/engine.js');
const data = require('../src/sample-data.json');

let failures = 0;
function check(ok, msg) {
  if (!ok) { failures++; console.error('FAIL ' + msg); }
}

// 1. Built page
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check(scripts.length >= 2, 'expected inline scripts in dist/index.html');
scripts.forEach((s, i) => { try { new Function(s); } catch (e) { check(false, 'script ' + i + ' does not parse: ' + e.message); } });

// 2. Engine at different dates
const expect = {
  '2026-10-14': ['preseason', 'projected'],
  '2026-11-10': ['group', 'projected'],
  '2027-01-12': ['k', 'live'],
  '2027-03-10': ['playoff', 'live'],
  '2027-04-20': ['done', 'done']
};
Object.entries(expect).forEach(([day, [d, j]]) => {
  const c = Engine.create(data, day);
  check(c.dbckStage() === d, day + ': Dobele stage ' + c.dbckStage() + ' != ' + d);
  check(c.jsscStage() === j, day + ': Jelgava stage ' + c.jsscStage() + ' != ' + j);
  ['A', 'B'].forEach(g => check(c.groupTable(g).length === 6, day + ': group ' + g + ' has 6 teams'));
});
const end = Engine.create(data, '2027-04-20');
check(end.kTable().length === 8, 'K group has 8 teams');
['GOLD', 'BRONZE', 'HF'].forEach(t => check(end.tieState('dbck', t).decided, t + ' decided at season end'));
check(end.tieState('jssc', 'F').decided, 'Challenge Cup final decided at season end');

// 3. Box scores
data.games.filter(g => g.box).forEach(g => {
  [['h', g.hs], ['a', g.as]].forEach(([side, score]) => {
    const rows = g.box[side].filter(r => r[2] != null);
    const pts = rows.reduce((a, r) => a + r[3], 0);
    const q = g.q.reduce((a, x) => a + x[side === 'h' ? 0 : 1], 0);
    check(pts === score, g.id + ' ' + side + ': player points ' + pts + ' != ' + score);
    check(q === score, g.id + ' ' + side + ': quarter points ' + q + ' != ' + score);
    rows.forEach(r => check(r[3] === 2 * r[4] + 3 * r[6] + r[8], g.id + ': shot split does not match points'));
  });
});

// 4. Sponsor logos and poster photos referenced by the page exist
const root = path.join(__dirname, '..');
const sponsors = require('../src/sponsors.json');
const photos = require('../src/poster-photos.json');
check(sponsors.length > 0, 'sponsor list is empty');
check(photos.length > 0, 'poster photo pool is empty');
sponsors.concat(photos).forEach(a => check(fs.existsSync(path.join(root, a.src)), 'missing file ' + a.src));
check(html.includes('id="poster-data"') && html.includes('window.Poster'), 'poster script and data are in the page');

// 5. Sponsors page data (the sheet's "Sponsori" tab): every row has a logo,
// a known level, and links are full https addresses.
const info = require('../src/sponsor-info.json');
const logoIds = new Set(sponsors.map(s => s.id));
info.forEach(r => {
  check(logoIds.has(r.id), 'sponsor ' + r.id + ' has no logo in src/sponsors.json');
  check(['Ģenerālsponsors', 'Atbalstītājs'].includes(r.level), 'sponsor ' + r.id + ': unknown level ' + r.level);
  ['website', 'facebook', 'instagram', 'tiktok'].forEach(k => check(!r[k] || /^https:\/\/\S+$/.test(r[k]), 'sponsor ' + r.id + ': ' + k + ' must start with https://'));
});
check(html.includes('id="sponsor-data"'), 'sponsor data is in the page');

if (failures) { console.error(failures + ' check(s) failed'); process.exit(1); }
console.log('All checks passed (' + data.games.length + ' games).');
