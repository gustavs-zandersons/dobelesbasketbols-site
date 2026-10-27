// Sanity checks run in CI before every deploy:
//   node tools/check.js
// 1) the built site's scripts parse, 2) the engine runs at several points of the
// demo season, 3) every demo box score adds up to its final score, 4) sponsor
// logos and poster photos exist, 5) sponsors page data is valid, 6) teams from
// the sheet, 7) the real season (src/season.json) is consistent, 8) every page
// of the live site: title, description, canonical address, link-preview tags,
// sitemap and robots.txt, and every link to another page of the site works.
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../src/engine.js');
const data = require('../src/sample-data.json');

let failures = 0;
function check(ok, msg) {
  if (!ok) { failures++; console.error('FAIL ' + msg); }
}

// 1. Built site: one page per address with shared scripts (dist/sitemap.xml), or
// the single-page fallback with everything inline.
const DIST = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const MULTI = fs.existsSync(path.join(DIST, 'sitemap.xml'));
const scriptFiles = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
const scripts = MULTI ? scriptFiles.map(f => fs.readFileSync(path.join(DIST, f), 'utf8'))
  : [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check(scripts.length >= (MULTI ? 4 : 2), 'expected the site\'s scripts in dist/index.html');
scripts.forEach((s, i) => { try { new Function(s); } catch (e) { check(false, 'script ' + (scriptFiles[i] || i) + ' does not parse: ' + e.message); } });
const pageData = MULTI ? scripts[0] : html;   // data file (live site) or the inline data

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
check(MULTI ? pageData.includes('"poster":') && scripts.join('').includes('window.Poster') : html.includes('id="poster-data"') && html.includes('window.Poster'), 'poster script and data are in the page');
// Fonts are served by the site itself (assets/fonts), not by Google Fonts.
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const fontFiles = [...css.matchAll(/url\(\/(assets\/fonts\/[\w.-]+)\)/g)].map(m => m[1]);
check(fontFiles.length >= 7, 'styles.css names the site\'s font files');
fontFiles.forEach(f => check(fs.existsSync(path.join(root, f)), 'missing font file ' + f));
check(!/fonts\.(googleapis|gstatic)\.com/.test(html + css), 'no fonts from Google Fonts');

// 5. Sponsors page data (the sheet's "Sponsori" tab, src/sheet.json): every row
// has a logo, a known level, and links are full https addresses.
const sheet = require('../src/sheet.json');
const info = sheet.sponsors;
const logoIds = new Set(sponsors.map(s => s.id));
info.forEach(r => {
  check(logoIds.has(r.id), 'sponsor ' + r.id + ' has no logo in src/sponsors.json');
  check(['Ģenerālsponsors', 'Atbalstītājs'].includes(r.level), 'sponsor ' + r.id + ': unknown level ' + r.level);
  ['website', 'facebook', 'instagram', 'tiktok'].forEach(k => check(!r[k] || /^https:\/\/\S+$/.test(r[k]), 'sponsor ' + r.id + ': ' + k + ' must start with https://'));
});
check(MULTI ? pageData.includes('"sponsors":') : html.includes('id="sponsor-data"'), 'sponsor data is in the page');

// 6. Teams from the sheet's "Komandas" tab: the page has all of them, links are full https addresses.
check(sheet.teams.every(s => data.teams.some(t => t.id === s.id && t.name === s.name && t.short === s.short)),
  'src/sample-data.json is older than src/sheet.json — run: node tools/gen-season.js > src/sample-data.json');
check(['Sezona ' + sheet.settings.season, sheet.settings.cups.dbck.name].every(x => html.includes(x)), 'season and cup names from the sheet are in the page');
data.teams.forEach(t => ['website', 'facebook', 'instagram', 'tiktok'].forEach(k =>
  check(!t[k] || /^https:\/\/\S+$/.test(t[k]), 'team ' + t.id + ': ' + k + ' must start with https://')));

// 7. The real season (src/season.json, from the sheet and basket.lv), when built.
const seasonPath = path.join(root, 'src', 'season.json');
let realGames = 0;
if (fs.existsSync(seasonPath)) {
  const real = JSON.parse(fs.readFileSync(seasonPath, 'utf8'));
  realGames = real.games.length;
  check(real.live === true, 'season.json is not marked live');
  check(MULTI, 'the live site is built as one page per address (dist/sitemap.xml)');
  check(pageData.includes('"live":true') && !html.includes('data-today='), 'the built page uses the real season and today\'s date');
  check(!html.includes('class="test-note"'), 'the test notice is gone from the live page');
  const tids = new Set(real.teams.map(t => t.id)), vids = new Set(real.venues.map(v => v.id)), rids = new Set(real.rounds.map(r => r.id));
  const ids = new Set();
  real.games.forEach(g => {
    check(!ids.has(g.id), 'duplicate game id ' + g.id); ids.add(g.id);
    check(/^\d{4}-\d{2}-\d{2}$/.test(g.date) && /^\d{2}:\d{2}$/.test(g.time || ''), g.id + ': date or time missing');
    check(vids.has(g.venue), g.id + ': unknown hall ' + g.venue);
    check(rids.has(g.round), g.id + ': unknown round ' + g.round);
    check(g.stage !== 'group' || (tids.has(g.home) && tids.has(g.away)), g.id + ': group game without both teams');
    if (g.box) ['h', 'a'].forEach(side => {
      const tid = g.stage === 'group' ? g[side === 'h' ? 'home' : 'away'] : null;
      g.box[side].forEach(r => check(r.length === 19 || (r.length === 3 && r[2] == null), g.id + ': box row shape'));
      if (tid) g.box[side].forEach(r => check(real.teams.find(t => t.id === tid).players[r[0]], g.id + ': box row points at no player'));
      // basket.lv's own data can be off by a point; that is reported, not a reason to stop the update.
      const pts = g.box[side].filter(r => r[2] != null).reduce((a, r) => a + r[3], 0);
      if (pts !== (side === 'h' ? g.hs : g.as)) console.warn('NOTE ' + g.id + ' ' + side + ': players\' points ' + pts + ' vs score ' + (side === 'h' ? g.hs : g.as));
    });
  });
  real.teams.forEach(t => check(Array.isArray(t.players), 'team ' + t.id + ' has no player list'));
  [new Date().toISOString().slice(0, 10), '2099-12-31'].forEach(day => {
    try {
      const c = Engine.create(real, day);
      ['A', 'B'].forEach(gr => check(c.groupTable(gr).length === 6, 'real season ' + day + ': group ' + gr + ' has 6 teams'));
      c.dbckStage(); c.jsscStage(); c.bracket('dbck', { project: true }); c.bracket('jssc', { project: true });
      c.lastRound('dbck'); c.nextRound('dbck'); c.lastRound('jssc'); c.nextRound('jssc');
    } catch (e) { check(false, 'engine fails on the real season at ' + day + ': ' + e.message); }
  });
}

// 8. Every page of the live site.
let pageCount = 0;
if (MULTI) {
  const SITE = 'https://dobelesbasketbols.lv';
  const pages = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const f = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'assets') walk(f);
      else if (e.name === 'index.html') pages.push('/' + path.relative(DIST, dir).split(path.sep).filter(Boolean).map(x => x + '/').join(''));
    });
  })(DIST);
  pageCount = pages.length;
  const exists = p => p.startsWith('/assets/') ? fs.existsSync(path.join(DIST, p.split(/[?#]/)[0])) : fs.existsSync(path.join(DIST, p.split(/[?#]/)[0], 'index.html'));
  const sitemap = [...fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(SITE, ''));
  check(sitemap.length > 10, 'sitemap.xml lists the pages');
  check(fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8').includes('Sitemap: ' + SITE + '/sitemap.xml'), 'robots.txt points to the sitemap');
  const titles = {};
  const bad = new Set();
  pages.forEach(p => {
    const t = fs.readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
    if (p === '/dobele/') { check(t.includes('url=/'), '/dobele/ forwards to the front page'); return; }
    const get = re => (re.exec(t) || [])[1];
    const title = get(/<title>([^<]*)<\/title>/), desc = get(/<meta name="description" content="([^"]*)"/);
    const robots = get(/<meta name="robots" content="([^"]*)"/), canon = get(/<link rel="canonical" href="([^"]*)"/);
    check(title && title.length > 10, p + ': title');
    check(desc && desc.length > 50, p + ': description');
    check(t.includes('property="og:title"') && t.includes('property="og:image"') && t.includes('property="og:description"'), p + ': link-preview tags');
    // Google Analytics loads only after consent (app.js), never from the saved page.
    check(!t.includes('googletagmanager.com') && !t.includes('id="consent"'), p + ': no Google tag or cookie banner saved in the page');
    check(/<h1[\s>]/.test(t.replace(/<section class="hero"[\s\S]*?<\/section>/, '')) || p === '/' || p === '/jelgava/', p + ': a heading in the page content');
    if (robots === 'index, follow') {
      check(canon && canon.startsWith(SITE + '/'), p + ': canonical address');
      if (canon === SITE + p) {
        check(sitemap.includes(p), p + ': in the sitemap');
        if (titles[title]) check(false, p + ': same title as ' + titles[title]); else titles[title] = p;
      }
    } else check(!sitemap.includes(p), p + ': not indexed, so not in the sitemap');
    [...t.matchAll(/href="(\/[^"]*)"/g)].forEach(m => { if (!m[1].startsWith('//') && !exists(m[1])) bad.add(p + ' → ' + m[1]); });
    [...t.matchAll(/src="(\/[^"]*)"/g)].forEach(m => { if (!exists(m[1])) bad.add(p + ' → ' + m[1]); });
  });
  sitemap.forEach(p => check(pages.includes(p), 'sitemap address has a page: ' + p));
  check(!bad.size, 'links to pages that do not exist:\n  ' + [...bad].slice(0, 20).join('\n  '));
  const nf = fs.readFileSync(path.join(DIST, '404.html'), 'utf8');
  check(nf.includes('content="noindex'), '404.html is kept out of search results');
}

if (failures) { console.error(failures + ' check(s) failed'); process.exit(1); }
console.log('All checks passed (demo ' + data.games.length + ' games' + (realGames ? ', real season ' + realGames + ' games' : '') + (pageCount ? ', ' + pageCount + ' pages' : '') + ').');
