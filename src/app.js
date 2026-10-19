/* Home page + game page renderer. Reads season data, asks the Engine for
   derived state and renders the selected cup (or a single game). */
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('season-data').textContent);
  var STRUCT = window.Engine.STRUCTURE;
  var RAW = {};
  DATA.games.forEach(function (g) { RAW[g.id] = g; });

  // Prototype only: preview the home page at different points of the season.
  var DEMO = {
    pre: '2026-10-14',
    group: '2026-11-10',
    k: '2027-01-12',
    playoff: '2027-03-23',
    done: '2027-04-20'
  };
  // Deployed test site: a fixed mock date from <html data-today> and no
  // prototype bar unless the address has ?demo. Previews keep the bar.
  var FIXED_TODAY = document.documentElement.getAttribute('data-today');
  var SHOW_DEMO = !FIXED_TODAY || /[?&]demo\b/.test(window.location.search);

  // Per-cup settings. Full names, the season and the MVP sponsor (one per cup
  // for the whole season) come from the sheet's "Iestatījumi" tab.
  var SET = DATA.settings || {};
  var SEASON_LABEL = SET.season || DATA.season;
  var CUPS = {
    dbck: { hash: 'dobele', short: 'Dobeles čempionu kauss', name: 'Dobeles Basketbola čempionu kauss', logo: 'assets/dbck-logo.webp', mvpSponsor: null },
    jssc: { hash: 'jelgava', short: 'Izaicinājuma kauss', name: 'Jelgavas Sporta servisa centra Izaicinājuma kauss', logo: 'assets/jssc-logo.webp', mvpSponsor: null }
  };
  Object.keys(CUPS).forEach(function (c) {
    var s = (SET.cups || {})[c];
    if (!s) return;
    if (s.name) CUPS[c].name = s.name;
    CUPS[c].mvpSponsor = s.mvpSponsor || null;
  });

  var state = {
    cup: 'dbck', view: 'home', gameId: null, teamId: null, demo: load('demo') || 'group', tabs: {},
    cal: { month: null, team: load('team') || '', cup: 'all', open: null, showAll: false },
    std: { season: null }
  };
  var ctx;

  // ---------- small helpers ----------
  function load(k) { try { return window.localStorage.getItem('dbck-proto-' + k); } catch (e) { return null; } }
  function save(k, v) { try { window.localStorage.setItem('dbck-proto-' + k, v); } catch (e) { /* storage unavailable */ } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  var WEEKDAY = ['svētdien', 'pirmdien', 'otrdien', 'trešdien', 'ceturtdien', 'piektdien', 'sestdien'];
  var WEEKDAY_NOM = ['svētdiena', 'pirmdiena', 'otrdiena', 'trešdiena', 'ceturtdiena', 'piektdiena', 'sestdiena'];
  var MONTH_LOC = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
  var MONTH_NOM = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
  function parse(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dateLong(d) { var x = parse(d); return WEEKDAY[x.getDay()] + ', ' + x.getDate() + '. ' + MONTH_LOC[x.getMonth()]; }
  function dateDay(d) { var x = parse(d); return x.getDate() + '. ' + MONTH_LOC[x.getMonth()]; }
  function dateShort(d) { var x = parse(d); return pad(x.getDate()) + '.' + pad(x.getMonth() + 1) + '.'; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function games(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? ' spēle' : ' spēles'); }
  function pct(m, a) { return a ? Math.round(100 * m / a) + '%' : '–'; }
  function mins(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + pad(s); }

  function team(id) { return ctx.team(id); }
  function initials(s) { return s.replace(/[^A-Za-zĀ-ž]/g, '').slice(0, 2).toUpperCase(); }
  function badge(id, size) {
    var cls = 'badge' + (size ? ' badge--' + size : '');
    if (!id) return '<span class="' + cls + ' badge--empty" aria-hidden="true"></span>';
    var t = team(id);
    if (t.logo) return '<img class="' + cls + '" src="' + esc(t.logo) + '" alt="" loading="lazy">';
    return '<span class="' + cls + '" style="--team:' + esc(t.color) + '" aria-hidden="true">' + esc(initials(t.short)) + '</span>';
  }
  // Full name on wider screens, short name on phones.
  function nameHtml(id) {
    var t = team(id);
    if (t.name === t.short) return '<span class="nm">' + esc(t.name) + '</span>';
    return '<span class="nm"><span class="nm-full">' + esc(t.name) + '</span><span class="nm-short">' + esc(t.short) + '</span></span>';
  }
  function gameHref(id) { return '#spele-' + id; }

  // ---------- names for slots that are not decided yet ----------
  var TIE_GEN = {
    dbck: { SF1: '1. pusfināla', SF2: '2. pusfināla', H1: '1. pusfināla', H2: '2. pusfināla' },
    jssc: {
      R16_1: '1. astotdaļfināla', R16_2: '2. astotdaļfināla', R16_3: '3. astotdaļfināla', R16_4: '4. astotdaļfināla',
      QF1: '1. ceturtdaļfināla', QF2: '2. ceturtdaļfināla', QF3: '3. ceturtdaļfināla', QF4: '4. ceturtdaļfināla',
      SF1: '1. pusfināla', SF2: '2. pusfināla'
    }
  };
  var TIE_NAME = {
    R16_1: '1. astotdaļfināls', R16_2: '2. astotdaļfināls', R16_3: '3. astotdaļfināls', R16_4: '4. astotdaļfināls',
    QF1: '1. ceturtdaļfināls', QF2: '2. ceturtdaļfināls', QF3: '3. ceturtdaļfināls', QF4: '4. ceturtdaļfināls',
    SF1: '1. pusfināls', SF2: '2. pusfināls', F: 'Fināls'
  };
  // The Dobele K group is called "Playoff kvalifikācijas grupa" everywhere;
  // its places show as PK1…PK8 (internal slot codes stay K1…K8).
  var KG = 'Playoff kvalifikācijas grupa', KG_GEN = 'Playoff kvalifikācijas grupas', KG_LOC = 'Playoff kvalifikācijas grupā';
  function seedText(seed) { return String(seed).replace(/^K(\d)$/, 'PK$1'); }
  function refLabel(comp, ref, r, short) {
    var m = /^([WL]):(.+)$/.exec(ref);
    if (m) {
      if (r && r.placeholder && r.placeholder.indexOf('/') >= 0) return r.placeholder;
      if (short) return m[1] === 'W' ? 'Uzvarētāja' : 'Zaudētāja';
      var g = TIE_GEN[comp][m[2]];
      return (g ? g + ' ' : '') + (m[1] === 'W' ? 'uzvarētāja' : 'zaudētāja');
    }
    m = /^([AB])([1-6])$/.exec(ref);
    if (m) return m[1] + ' grupas ' + m[2] + '. vieta';
    m = /^K([1-8])$/.exec(ref);
    if (m) return short ? m[1] + '. vieta' : KG_GEN + ' ' + m[1] + '. vieta';
    return ref;
  }
  function side(comp, ref, project) {
    var r = ctx.resolve(comp, ref, { project: !!project });
    return { team: r.team, projected: !!r.projected, label: r.team ? team(r.team).short : refLabel(comp, ref, r) };
  }
  // Original seed of whoever fills a slot (A1, K4 …), following decided ties.
  function seedOf(comp, ref, project) {
    if (/^[ABK]\d$/.test(ref)) return ref;
    var m = /^([WL]):(.+)$/.exec(ref);
    if (!m) return '';
    var st = ctx.tieState(comp, m[2], { project: project });
    if (!st.decided) return '';
    var s = m[1] === 'W' ? st.winner : (st.winner === 'a' ? 'b' : 'a');
    return seedOf(comp, st.def[s], project);
  }

  function gameTag(g) {
    if (g.comp === 'dbck') {
      if (g.stage === 'group') return team(g.home).group + ' grupa';
      if (g.stage === 'k') return KG;
      if (g.stage === 'hope') return 'Cerību kauss';
      var d = STRUCT.dbck.ties[g.tie];
      return d.label + (d.type === 'bo3' ? ' · ' + g.n + '. spēle' : '');
    }
    var def = STRUCT.jssc.ties[g.tie];
    if (/^[AB]\d$/.test(def.a) && /^[AB]\d$/.test(def.b)) return def.a + ' – ' + def.b;
    return TIE_NAME[g.tie];
  }
  function mapsUrl(v) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.name + ', ' + v.address);
  }

  // ---------- round naming ----------
  function primaryRound(rounds) {
    return rounds.filter(function (r) { return r.stage !== 'Cerību kauss'; })[0] || rounds[0];
  }
  function groupTitle(r) {
    if (r.stage === 'Cerību kauss') return 'Cerību kauss · ' + r.label;
    if (r.comp === 'jssc') return r.stage + (r.label ? ' · ' + r.label : '');
    return r.stage + ' · ' + r.label;
  }
  function sortGames(list) {
    return list.slice().sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
  }
  function head(id, title, subHtml, extraHtml) {
    return '<div class="block-head"><div class="block-head-main"><h2 class="block-title" id="' + id + '">' + esc(title) + '</h2>' +
      (subHtml ? '<p class="block-sub">' + subHtml + '</p>' : '') + '</div>' + (extraHtml || '') + '</div>';
  }
  var CAL_LINK = '<a class="head-link" href="#kalendars">Viss kalendārs ›</a>';

  // ---------- Block 1: previous round results ----------
  function resNote(g) {
    var bits = [];
    if (g.forfeit) {
      var noShow = ctx.resolve(g.comp, g.forfeit === 'home' ? g.home : g.away).team;
      bits.push('Tehniskais rezultāts — <b>' + esc(team(noShow).short) + '</b> neieradās');
    }
    if (g.ot) bits.push('Papildlaikā');
    if (g.tie) {
      var st = ctx.tieState(g.comp, g.tie);
      if (st.type === 'twoleg') {
        if (g.n === 1) {
          var second = st.games[1];
          if (second) bits.push('Atbildes spēle ' + dateDay(second.date));
        } else if (st.decided) {
          var w = st[st.winner].team;
          var wa = st.winner === 'a' ? st.aggA : st.aggB, la = st.winner === 'a' ? st.aggB : st.aggA;
          bits.push('Summā <b>' + wa + ':' + la + '</b> · tālāk <b>' + esc(team(w).short) + '</b>');
        }
      } else if (st.type === 'bo3') {
        var wa2 = 0, wb2 = 0;
        st.games.forEach(function (x) {
          if (x.final && x.n <= g.n) { if (x.aScore > x.bScore) wa2++; else wb2++; }
        });
        var A = team(st.a.team).short, B = team(st.b.team).short;
        var hi = Math.max(wa2, wb2), lo = Math.min(wa2, wb2);
        if (hi === 2) bits.push('<b>' + esc(wa2 === 2 ? A : B) + '</b> uzvar sērijā ' + hi + '–' + lo);
        else if (wa2 === wb2) bits.push('Sērijā ' + wa2 + '–' + wb2 + ' · būs 3. spēle');
        else bits.push('<b>' + esc(wa2 > wb2 ? A : B) + '</b> vada sērijā ' + hi + '–' + lo);
      } else if (g.tie === 'HF' || g.tie === 'GOLD' || g.tie === 'F') {
        bits.push('Kausa ieguvēja — <b>' + esc(team(st[st.winner].team).short) + '</b>');
      }
    }
    return bits.join(' · ');
  }

  function resRow(g) {
    var h = ctx.resolve(g.comp, g.home).team, a = ctx.resolve(g.comp, g.away).team;
    var hw = g.hs > g.as;
    return '<a class="res" href="' + gameHref(g.id) + '" aria-label="' + esc(team(h).short + ' ' + g.hs + ':' + g.as + ' ' + team(a).short + ' — spēles statistika') + '">' +
      '<div class="res-meta"><span class="tag">' + esc(gameTag(g)) + '</span><span>' + esc(g.time) + '</span><span class="res-go">Statistika ›</span></div>' +
      '<div class="res-team res-home' + (hw ? ' is-win' : '') + '">' + badge(h, 'md') + nameHtml(h) + '</div>' +
      '<span class="res-sc h' + (hw ? ' is-win' : '') + '">' + g.hs + '</span><span class="res-sep" aria-hidden="true">:</span>' +
      '<span class="res-sc a' + (hw ? '' : ' is-win') + '">' + g.as + '</span>' +
      '<div class="res-team res-away' + (hw ? '' : ' is-win') + '">' + badge(a, 'md') + nameHtml(a) + '</div>' +
      '<div class="res-note">' + resNote(g) + '</div></a>';
  }

  function renderLast(lr) {
    var el = $('block-last');
    // No results yet: the block is not shown at all.
    if (!lr) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var multi = lr.rounds.length > 1;
    var body = lr.rounds.map(function (r) {
      var list = sortGames(lr.games.filter(function (g) { return g.round === r.id; }));
      return (multi ? '<h3 class="group-head">' + esc(groupTitle(r)) + ' <small>' + games(list.length) + '</small></h3>' : '') +
        list.map(resRow).join('');
    }).join('');
    var shareBtn = '<button type="button" class="share-btn" data-share-results>' + SHARE_ICON + 'Dalīties</button>';
    // Desktop: share next to the title. Phones: share under the last result, on the right.
    el.innerHTML = head('last-title', 'Iepriekšējās kārtas rezultāti', '', '<div class="head-actions">' + shareBtn + '</div>') +
      '<div class="results">' + body + '</div>' +
      '<div class="foot-m foot-m--end">' + shareBtn + '</div>';
  }

  // ---------- Block 2: round MVP ----------
  function renderMvp(lr) {
    var el = $('block-mvp');
    if (!lr || !lr.mvp) { el.hidden = true; el.innerHTML = ''; return; }
    var m = lr.mvp, sp = CUPS[state.cup].mvpSponsor;
    el.hidden = false;
    // Part of the previous-round section: no heading of its own.
    el.innerHTML = '<div class="mvp-wrap">' +
      (sp ? '<div class="mvp-sponsor"><p>Kārtas MVP balvu pasniedz</p>' + (sp.logo ? '<img src="' + esc(sp.logo) + '" alt="' + esc(sp.name) + '">' : '<p class="mvp-sponsor-name">' + esc(sp.name) + '</p>') + '</div>' : '') +
      '<article class="mvp" aria-label="Kārtas vērtīgākais spēlētājs">' +
      '<p class="mvp-k">Vērtīgākais spēlētājs</p>' +
      '<p class="mvp-name">' + esc(m.player) + '</p>' +
      '<p class="mvp-team">' + badge(m.team, 'lg') + esc(team(m.team).name) + '</p>' +
      '<dl class="mvp-stats">' +
      '<div><dd>' + m.pts + '</dd><dt>Punkti</dt></div>' +
      '<div><dd>' + m.reb + '</dd><dt>Atl. bumbas</dt></div>' +
      '<div><dd>' + m.ast + '</dd><dt>Rez. piesp.</dt></div>' +
      '</dl>' +
      (m.game ? '<a class="mvp-link" href="' + gameHref(m.game) + '">Skatīt spēles statistiku ›</a>' : '') +
      '</article></div>';
  }

  // ---------- Block 3: next round schedule ----------
  var CAL_ICON = '<svg class="stub-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.3h2"/></svg>';

  function fxRow(g) {
    function tm(ref, cls) {
      var s = side(g.comp, ref, false);
      return '<span class="fx-team ' + cls + (s.team ? '' : ' is-tbd') + '">' + badge(s.team, 'md') +
        (s.team ? nameHtml(s.team) : '<span class="nm">' + esc(s.label) + '</span>') + '</span>';
    }
    return '<li class="fx"><time datetime="' + g.date + 'T' + g.time + '">' + esc(g.time) + '</time>' +
      tm(g.home, 'fx-home') + '<span class="fx-vs" aria-hidden="true">–</span>' + tm(g.away, 'fx-away') +
      '<span class="fx-tag">' + esc(gameTag(g)) + '</span></li>';
  }

  function renderNext() {
    var el = $('block-next');
    var title = 'Nākamās kārtas spēles';
    var nr = ctx.nextRound(state.cup);
    if (state.cup === 'jssc' && !ctx.groupComplete()) {
      el.innerHTML = head('next-title', title) +
        '<div class="empty"><strong>Spēļu kalendārs būs zināms pēc Dobeles kausa grupu turnīra noslēguma (' + esc(dateDay(lastGroupDate())) + ').</strong>' +
        (nr ? 'Izaicinājuma kausa pirmās spēles plānotas ' + esc(dateLong(nr.date)) + '.' : '') + '</div>';
      return;
    }
    if (!nr) {
      el.innerHTML = head('next-title', title) + '<div class="empty"><strong>Sezona noslēgusies.</strong>Paldies visām komandām un skatītājiem!</div>';
      return;
    }
    var v = ctx.venue(nr.games[0].venue);
    var x = parse(nr.date);
    var multi = nr.rounds.length > 1;
    var list = nr.rounds.map(function (r) {
      var gs = sortGames(nr.games.filter(function (g) { return g.round === r.id; }));
      return (multi ? '<li class="group-head" role="presentation">' + esc(groupTitle(r)) + ' <small>' + games(gs.length) + '</small></li>' : '') +
        gs.map(fxRow).join('');
    }).join('');
    // Desktop: share + calendar next to the title. Phones: one row under the
    // schedule card — calendar link on the left, share on the right.
    var shareBtn = posterRound(nr) ? '<button type="button" class="share-btn" data-share-round>' + SHARE_ICON + 'Dalīties</button>' : '';
    el.innerHTML = head('next-title', title, '', '<div class="head-actions">' + shareBtn + CAL_LINK + '</div>') +
      '<div class="ticket">' +
      '<div class="stub" aria-label="' + esc(cap(dateLong(nr.date))) + '"><span class="stub-day">' + x.getDate() + '</span>' +
      '<span class="stub-txt"><span class="stub-month">' + MONTH_NOM[x.getMonth()] + '</span><span class="stub-wd">' + WEEKDAY_NOM[x.getDay()] + '</span></span>' + CAL_ICON + '</div>' +
      '<div class="ticket-main"><div class="venue-bar"><div><h3 class="venue-name">' + esc(v.name) + '</h3><p class="venue-addr">' + esc(v.address) + '</p></div>' +
      '<a class="map-link" href="' + esc(mapsUrl(v)) + '" target="_blank" rel="noopener" aria-label="' + esc(v.name) + ' — atvērt Google Maps">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>Kā nokļūt</a></div>' +
      '<ul class="fx-list">' + list + '</ul></div></div>' +
      '<div class="foot-m">' + CAL_LINK + shareBtn + '</div>';
  }

  function lastGroupDate() {
    return DATA.games.filter(function (g) { return g.stage === 'group'; })
      .map(function (g) { return g.date; }).sort().pop();
  }

  // ---------- Standings ----------
  function standingsTable(rows, opts) {
    var thead = '<thead><tr><th class="pos" scope="col"><span class="sr-only">Vieta</span>#</th><th class="l" scope="col">Komanda</th>' +
      '<th class="n" scope="col" title="Spēles">S</th><th class="n" scope="col" title="Uzvaras">U</th><th class="n" scope="col" title="Zaudējumi">Z</th>' +
      '<th class="n col-wide" scope="col" title="Gūtie un zaudētie punkti">Punkti</th><th class="n" scope="col" title="Punktu starpība">+/−</th>' +
      '<th class="pts" scope="col" title="Turnīra punkti">P</th></tr></thead>';
    var body = rows.map(function (r) {
      var zone = opts.zone(r.pos);
      var cls = (zone || '') + (opts.zoneEnd.indexOf(r.pos) >= 0 ? ' zone-end' : '');
      var origin = r.origin ? '<span class="origin" title="Vieta grupu turnīrā">' + r.origin + '</span>' : '';
      return '<tr class="' + cls + '"><td class="pos">' + r.pos + '</td>' +
        '<td class="l"><a class="team-cell" href="' + teamHref(r.team, 'dbck') + '">' + badge(r.team) + nameHtml(r.team) + origin + '</a></td>' +
        '<td class="n">' + r.gp + '</td><td class="n">' + r.w + '</td><td class="n">' + r.l + '</td>' +
        '<td class="n col-wide muted">' + r.pf + ':' + r.pa + '</td>' +
        '<td class="n muted">' + (r.diff > 0 ? '+' : '') + r.diff + '</td>' +
        '<td class="pts">' + r.pts + '</td></tr>';
    }).join('');
    return '<div class="table-scroll"><table class="standings">' + thead + '<tbody>' + body + '</tbody></table></div>';
  }

  function stageHead(id, eyebrow, title, extra) {
    return '<div class="block-head"><div class="block-head-main"><p class="eyebrow">' + esc(eyebrow) + '</p>' +
      '<h2 class="block-title" id="' + id + '">' + esc(title) + '</h2></div>' + (extra || '') + '</div>';
  }

  var TIEBREAK = 'Uzvara — 2 punkti, zaudējums — 1, neierašanās — 0. Vienāda punktu skaita gadījumā augstāk ierindojas komanda ar vairāk punktiem savstarpējās spēlēs, tad — labāku savstarpējo spēļu punktu starpību, tad — vairāk savstarpējās spēlēs gūtu punktu.';

  function renderGroups(o) {
    o = o || {};
    var zone = function (p) { return p <= 4 ? 'z1' : 'z2'; };
    var cards = ['A', 'B'].map(function (g) {
      return '<div class="table-card"><h3>' + g + ' grupa</h3>' + standingsTable(ctx.groupTable(g), { zone: zone, zoneEnd: [4] }) + '</div>';
    }).join('');
    return stageHead(o.id || 'stage-title', 'Turnīra tabula', 'Grupu turnīrs', o.chip) + (o.lead || '') +
      '<div class="tables two">' + cards + '</div>' +
      '<div class="legend"><span><i class="key"></i>1.–4. vieta — ' + KG + '</span><span><i class="key key--2"></i>5.–6. vieta — Cerību kauss</span>' +
      '<span>S – spēles · U – uzvaras · Z – zaudējumi · P – turnīra punkti</span></div>' +
      '<p class="note">' + (ctx.groupStarted() ? '' : 'Tabula sāks pildīties pēc 1. kārtas. ') + TIEBREAK + '</p>';
  }

  function renderK(o) {
    o = o || {};
    return stageHead(o.id || 'stage-title', 'Turnīra tabula', KG, o.chip) + (o.lead || '') +
      '<div class="tables"><div class="table-card">' +
      standingsTable(ctx.kTable(), { zone: function (p) { return p <= 4 ? 'z1' : ''; }, zoneEnd: [4] }) + '</div></div>' +
      '<div class="legend"><span><i class="key"></i>1.–4. vieta — pusfināls</span><span>A1, B2 … — vieta grupu turnīrā</span></div>' +
      '<p class="note">Tabulā ieskaitīti grupu turnīra rezultāti pret savas grupas komandām, kas arī iekļuva ' + KG_LOC + '. Ar tām šajā grupā atkārtoti nespēlē — katra komanda aizvada 4 spēles pret otras grupas komandām. ' + TIEBREAK + '</p>';
  }

  // ---------- Tie cards (all brackets) ----------
  // o: project, head, headSub, longPh (long placeholders), champLabel, finalStyle
  function tieCard(comp, st, o) {
    o = o || {};
    function row(s) {
      var ref = st.def[s];
      var r = ctx.resolve(comp, ref, { project: o.project });
      var won = st.decided && st.winner === s;
      var label = r.team ? team(r.team).short : refLabel(comp, ref, r, !o.longPh);
      var seed = seedOf(comp, ref, o.project);
      var sc = '';
      if (st.type === 'twoleg' && st.started) {
        sc = st.games.map(function (g) { return '<span class="leg">' + (g.final ? (s === 'a' ? g.aScore : g.bScore) : '–') + '</span>'; }).join('') +
          '<span class="agg">' + (st.decided ? (s === 'a' ? st.aggA : st.aggB) : '') + '</span>';
      } else if (st.type === 'bo3' && st.started) {
        sc = st.games.filter(function (g) { return g.final; }).map(function (g) {
          return '<span class="leg">' + (s === 'a' ? g.aScore : g.bScore) + '</span>';
        }).join('') + '<span class="agg">' + (s === 'a' ? st.winsA : st.winsB) + '</span>';
      } else if (st.type === 'single' && st.games[0] && st.games[0].final) {
        sc = '<span class="agg">' + (s === 'a' ? st.games[0].aScore : st.games[0].bScore) + '</span>';
      }
      return '<div class="t-row' + (won ? ' is-win' : '') + (r.team ? '' : ' is-tbd') + '">' +
        (seed ? '<span class="seed">' + esc(seedText(seed)) + '</span>' : '<span></span>') + badge(r.team, 'sm') +
        '<span class="tname">' + esc(label) + '</span><span class="t-sc">' + sc + '</span></div>';
    }
    var left = '', right = '';
    if (st.type === 'single') {
      var g0 = st.games[0];
      if (g0) { left = dateShort(g0.date) + ' · ' + g0.time; right = ctx.venue(g0.venue).name; }
    } else {
      left = st.games.filter(function (g) { return !g.notNeeded; }).map(function (g) {
        return dateShort(g.date) + (g.ifNeeded && !g.final ? ' (ja vajag)' : '');
      }).join(' / ');
      if (st.decided && !o.champLabel) right = 'Tālāk: ' + team(st[st.winner].team).short;
    }
    var headHtml = o.head ? '<div class="tie-head"><span>' + esc(o.head) + '</span>' + (o.headSub ? '<small>' + esc(o.headSub) + '</small>' : '') + '</div>' : '';
    var champ = '';
    if (o.champLabel && st.decided) {
      var w = st[st.winner].team;
      champ = '<div class="champ">' + badge(w, 'md') + '<span><small>' + esc(o.champLabel) + '</small>' + esc(team(w).name) + '</span></div>';
    }
    // A tie with played games opens the latest of them.
    var played = st.games.filter(function (g) { return g.final; });
    var tag = played.length ? 'a' : 'article';
    var href = played.length ? ' href="' + gameHref(played[played.length - 1].id) + '"' : '';
    return '<' + tag + href + ' class="tie' + (st.projected ? ' is-projected' : '') + (o.finalStyle ? ' is-final' : '') + '">' +
      headHtml + row('a') + row('b') +
      '<div class="tie-foot"><span>' + esc(left) + '</span><span>' + esc(right) + '</span></div>' + champ + '</' + tag + '>';
  }

  // A1, B2, B1, A2 go straight to the quarterfinal. Same build as a game box
  // (two rows + footer) so both are the same size; footer = their 1/4 dates.
  var BYE_QF = { A1: 'QF1', B2: 'QF2', B1: 'QF3', A2: 'QF4' };
  function byeCard(seed, project) {
    var r = ctx.resolve('jssc', seed, { project: project });
    var label = r.team ? team(r.team).short : refLabel('jssc', seed, r);
    var qf = ctx.tieState('jssc', BYE_QF[seed], { project: project });
    var dates = qf.games.map(function (g) { return dateShort(g.date); }).join(' / ');
    return '<article class="tie tie--bye' + (r.projected ? ' is-projected' : '') + '" aria-label="' + esc(seed + ' ' + label) + ' — automātiski kvalificējas ceturtdaļfinālam">' +
      '<div class="t-row' + (r.team ? '' : ' is-tbd') + '"><span class="seed">' + esc(seed) + '</span>' + badge(r.team, 'sm') +
      '<span class="tname">' + esc(label) + '</span></div>' +
      '<div class="t-row t-note"><span>Automātiski kvalificējas ceturtdaļfinālam</span></div>' +
      '<div class="tie-foot"><span>' + esc(dates ? 'Ceturtdaļfināls ' + dates : '') + '</span></div></article>';
  }

  // Phone tab bar for a bracket. On wider screens the full bracket shows.
  function tabs(treeId, items, active, extraCls) {
    return '<div class="tree-tabs' + (extraCls ? ' ' + extraCls : '') + '" role="tablist" aria-label="Kārta">' + items.map(function (c) {
      return '<button class="tree-tab" type="button" role="tab" data-tree="' + treeId + '" data-bk="' + c.key + '" aria-selected="' + (c.key === active) + '" aria-label="' + esc(c.name) + '">' + esc(c.short || c.name) + '</button>';
    }).join('') + '</div>';
  }
  function activeTab(treeId, fallback) { return state.tabs[treeId] || fallback; }

  // Generic left-to-right bracket. Each item: html, row (grid-row), pos
  // ('top'/'bot' of a pair feeding the next round), join (0, 'g1', 'g2'),
  // recv (has an incoming line), cls (extra spacing on phones).
  function tree(treeId, cols, o) {
    var JOIN = { 0: '0px', g1: 'calc(var(--g1) / 2)', g2: 'calc(var(--g2) / 2)' };
    var active = activeTab(treeId, o.current);
    var html = tabs(treeId, cols, active) +
      '<div class="tree' + (o.cls ? ' ' + o.cls : '') + '" id="' + treeId + '" data-active="' + active + '" style="--cols:' + cols.length + ';--rows:' + o.rows + '">';
    cols.forEach(function (c, i) {
      html += '<div class="tree-head" style="grid-column:' + (i + 1) + ';grid-row:1">' + esc(c.name) + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</div>';
      c.items.forEach(function (it) {
        var cls = 'tc c-' + c.key + (it.pos ? ' ' + it.pos : '') + (it.recv ? ' recv' : '') + (it.cls ? ' ' + it.cls : '');
        html += '<div class="' + cls + '" style="grid-column:' + (i + 1) + ';grid-row:' + it.row + ';--join:' + JOIN[it.join || 0] + '">' + it.html + '</div>';
      });
    });
    return html + '</div>';
  }
  function firstOpen(cols, tieIds, comp, project) {
    for (var i = 0; i < cols.length; i++) {
      var open = tieIds[cols[i].key].some(function (id) { return !ctx.tieState(comp, id, { project: project }).decided; });
      if (open) return cols[i].key;
    }
    return cols[cols.length - 1].key;
  }

  // ---------- Jelgava bracket ----------
  function renderBracket(o) {
    o = o || {};
    var project = true;
    var T = function (id) { return ctx.tieState('jssc', id, { project: project }); };
    var card = function (id, extra) { return tieCard('jssc', T(id), Object.assign({ project: project }, extra || {})); };
    var cols = [
      { key: 'r16', short: '1/8', name: 'Astotdaļfināls', sub: '2 spēļu summā', items: [
        { html: byeCard('A1', project), row: '2', pos: 'top' },
        { html: card('R16_1'), row: '3', pos: 'bot' },
        { html: byeCard('B2', project), row: '5', pos: 'top', cls: 'path-gap' },
        { html: card('R16_2'), row: '6', pos: 'bot' },
        { html: byeCard('B1', project), row: '8', pos: 'top', cls: 'half-gap' },
        { html: card('R16_3'), row: '9', pos: 'bot' },
        { html: byeCard('A2', project), row: '11', pos: 'top', cls: 'path-gap' },
        { html: card('R16_4'), row: '12', pos: 'bot' }
      ] },
      { key: 'qf', short: '1/4', name: 'Ceturtdaļfināls', sub: '2 spēļu summā', items: [
        { html: card('QF1'), row: '2 / 4', pos: 'top', join: 'g1', recv: true },
        { html: card('QF2'), row: '5 / 7', pos: 'bot', join: 'g1', recv: true, cls: 'path-gap' },
        { html: card('QF3'), row: '8 / 10', pos: 'top', join: 'g1', recv: true, cls: 'half-gap' },
        { html: card('QF4'), row: '11 / 13', pos: 'bot', join: 'g1', recv: true, cls: 'path-gap' }
      ] },
      { key: 'sf', short: '1/2', name: 'Pusfināls', sub: '1 spēle', items: [
        { html: card('SF1'), row: '2 / 7', pos: 'top', join: 'g2', recv: true },
        { html: card('SF2'), row: '8 / 13', pos: 'bot', join: 'g2', recv: true, cls: 'half-gap' }
      ] },
      { key: 'f', short: 'Fināls', name: 'Fināls', sub: '1 spēle', items: [
        { html: card('F', { finalStyle: true, champLabel: 'Izaicinājuma kausa ieguvēja' }), row: '2 / 13', recv: true }
      ] }
    ];
    var current = firstOpen(cols, { r16: ['R16_1', 'R16_2', 'R16_3', 'R16_4'], qf: ['QF1', 'QF2', 'QF3', 'QF4'], sf: ['SF1', 'SF2'], f: ['F'] }, 'jssc', project);
    var projected = ctx.jsscStage() === 'projected';
    var extra = projected && ctx.groupStarted() ? '<span class="pill pill--ghost">Prognoze</span>' : '';
    var note = projected
      ? (ctx.groupStarted()
        ? 'Prognoze — ja grupu turnīrs beigtos šodien. Komandu vietas Dobeles kausa grupu turnīrā (A1, B4 …) nosaka to vietu shēmā; A1, A2, B1 un B2 sāk uzreiz ceturtdaļfinālā. Galīgie pāri būs zināmi pēc ' + esc(dateDay(lastGroupDate())) + '.'
        : 'Komandu vietas Dobeles kausa grupu turnīrā (A1, B4 …) noteiks to vietu shēmā; A1, A2, B1 un B2 sāk uzreiz ceturtdaļfinālā.')
      : 'Astotdaļfināls un ceturtdaļfināls — divu spēļu summā (mazie skaitļi — katras spēles rezultāts, lielais — kopsumma). Pusfināls un fināls — vienā spēlē. Pieskaries pārim, lai redzētu spēles statistiku.';
    return stageHead(o.id || 'stage-title', 'Izaicinājuma kauss', 'Izspēles shēma', o.chip != null ? o.chip : extra) + (o.lead || '') +
      tree('bk', cols, { current: current, rows: 'auto 1fr 1fr var(--g1) 1fr 1fr var(--g2) 1fr 1fr var(--g1) 1fr 1fr' }) +
      '<p class="note">' + note + '</p>';
  }

  // ---------- Dobele playoffs (mirrored on desktop, tabs on phones) ----------
  function renderPlayoffs(o) {
    o = o || {};
    var S = function (id) { return ctx.tieState('dbck', id); };
    var current = S('SF1').decided && S('SF2').decided ? 'f' : 'sf';
    var active = activeTab('po', current);
    return stageHead(o.id || 'stage-title', 'Izslēgšanas spēles', 'Pusfināli un fināli', o.chip) + (o.lead || '') +
      tabs('po', [{ key: 'sf', name: 'Pusfināli' }, { key: 'f', name: 'Fināli' }], active, 'tabs-po') +
      '<div class="po" id="po" data-active="' + active + '">' +
      '<div class="po-sf1">' + tieCard('dbck', S('SF1'), { head: '1. pusfināls', headSub: 'līdz 2 uzvarām' }) + '</div>' +
      '<div class="po-sf2">' + tieCard('dbck', S('SF2'), { head: '2. pusfināls', headSub: 'līdz 2 uzvarām' }) + '</div>' +
      '<div class="po-gold">' + tieCard('dbck', S('GOLD'), { head: 'Zelta fināls', longPh: true, finalStyle: true, champLabel: 'Dobeles čempionu kausa ieguvēja' }) + '</div>' +
      '<div class="po-bronze">' + tieCard('dbck', S('BRONZE'), { head: 'Bronzas fināls', longPh: true }) + '</div>' +
      '</div>' +
      '<p class="note">Pusfināli PK1–PK4 un PK2–PK3 (PK — vieta ' + KG_LOC + ') — līdz divām uzvarām (mazie skaitļi — katras spēles rezultāts, lielais — uzvaras sērijā). Zelta un bronzas fināls — vienā spēlē.</p>';
  }

  // ---------- Hope Cup bracket ----------
  function renderHope(o) {
    o = o || {};
    var S = function (id) { return ctx.tieState('dbck', id); };
    var cols = [
      { key: 'sf', name: 'Pusfināli', sub: '1 spēle', items: [
        { html: tieCard('dbck', S('H1')), row: '2', pos: 'top' },
        { html: tieCard('dbck', S('H2')), row: '3', pos: 'bot' }
      ] },
      { key: 'f', name: 'Fināls', sub: '1 spēle', items: [
        { html: tieCard('dbck', S('HF'), { longPh: true, finalStyle: true, champLabel: 'Cerību kausa ieguvēja' }), row: '2 / 4', recv: true }
      ] }
    ];
    var current = S('H1').decided && S('H2').decided ? 'f' : 'sf';
    return stageHead(o.id || 'extra-title', '5. un 6. vietas komandas', 'Cerību kauss', o.chip) + (o.lead || '') +
      tree('hope', cols, { current: current, cls: 'tree--hope', rows: 'auto 1fr 1fr' }) +
      '<p class="note">Pusfināli A5–B6 un B5–A6, fināls — vienā spēlē.</p>';
  }

  function renderStage() {
    var el = $('block-stage'), ex = $('block-extra');
    ex.hidden = true; ex.innerHTML = '';
    if (state.cup === 'jssc') { el.innerHTML = renderBracket(); return; }
    var s = ctx.dbckStage();
    if (s === 'preseason' || s === 'group') { el.innerHTML = renderGroups(); return; }
    el.innerHTML = s === 'k' ? renderK() : renderPlayoffs();
    ex.innerHTML = renderHope();
    ex.hidden = false;
  }

  // ---------- Hero ----------
  function renderHero() {
    var cup = CUPS[state.cup];
    $('hero-logo').src = cup.logo;
    $('hero-title').textContent = cup.name;
    $('season-bar').innerHTML = seasonBar(state.cup);
  }

  // Season progress (home page only): first game → final, filled by date,
  // with a small tick where each stage starts.
  var TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13v4M8.5 20h7M10 17h4"/></svg>';
  function seasonStages(cup) {
    var first = function (f) { return DATA.games.filter(f).map(function (g) { return g.date; }).sort()[0]; };
    if (cup === 'dbck') {
      return [
        { name: 'Grupu turnīrs', date: first(function (g) { return g.stage === 'group'; }) },
        { name: KG, date: first(function (g) { return g.stage === 'k'; }) },
        { name: 'Pusfināli', date: first(function (g) { return g.comp === 'dbck' && /^SF/.test(g.tie || ''); }) },
        { name: 'Fināli', date: first(function (g) { return g.tie === 'GOLD' || g.tie === 'BRONZE'; }) }
      ];
    }
    return [
      { name: 'Astotdaļfināls', date: first(function (g) { return g.comp === 'jssc' && /^R16/.test(g.tie || ''); }) },
      { name: 'Ceturtdaļfināls', date: first(function (g) { return g.comp === 'jssc' && /^QF/.test(g.tie || ''); }) },
      { name: 'Pusfināls', date: first(function (g) { return g.comp === 'jssc' && /^SF/.test(g.tie || ''); }) },
      { name: 'Fināls', date: first(function (g) { return g.comp === 'jssc' && g.tie === 'F'; }) }
    ];
  }
  function seasonBar(cup) {
    var dates = DATA.games.filter(function (g) { return g.comp === cup; }).map(function (g) { return g.date; }).sort();
    if (!dates.length) return '';
    var start = parse(dates[0]), end = parse(dates[dates.length - 1]), now = parse(ctx.today);
    var span = Math.max(1, end - start);
    var at = function (d) { return Math.max(0, Math.min(1, (parse(d) - start) / span)); };
    var p = Math.max(0, Math.min(1, (now - start) / span));
    var done = now >= end;
    var stages = seasonStages(cup).filter(function (s) { return s.date; });
    var current = stages.filter(function (s) { return s.date <= ctx.today; }).pop();
    var pc = function (x) { return (Math.round(x * 1000) / 10) + '%'; };
    // A tick at the start of every stage after the first; the last stage
    // (the final) starts on the trophy, so it needs no tick of its own.
    var ticks = stages.slice(1).filter(function (s) { return at(s.date) < 1; }).map(function (s) {
      return '<i class="season-tick' + (at(s.date) <= p ? ' is-past' : '') + '" style="left:' + pc(at(s.date)) + '" title="' + esc(s.name + ' · no ' + dateShort(s.date)) + '"></i>';
    }).join('');
    var said = 'Sezonas gaita: ' + dateShort(dates[0]) + '–' + dateShort(dates[dates.length - 1]) + '. ' +
      (done ? 'Sezona noslēgusies.' : now < start ? 'Sezona vēl nav sākusies.' : 'Aizvadīti ' + Math.round(p * 100) + '%' + (current ? ', pašlaik — ' + current.name : '') + '.');
    return '<div class="season-track" aria-hidden="true"><span class="season-fill" style="width:' + pc(p) + '"></span>' + ticks +
      (done ? '' : '<span class="season-dot" style="left:' + pc(p) + '"></span>') + '</div>' +
      '<span class="season-cup' + (done ? ' is-done' : '') + '" aria-hidden="true">' + TROPHY + '</span>' +
      '<div class="season-dates" aria-hidden="true"><span>' + dateShort(dates[0]) + '</span><span>' + dateShort(dates[dates.length - 1]) + '</span></div>' +
      '<span class="sr-only">' + esc(said) + '</span>';
  }


  // ---------- Game page ----------
  // Box row layout: [rosterIdx, starter, seconds, pts, 2pm, 2pa, 3pm, 3pa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf, eff, +/-]
  function played(rows) { return rows.filter(function (r) { return r[2] != null; }); }
  function totals(rows) {
    var t = new Array(19).fill(0);
    played(rows).forEach(function (r) { for (var i = 2; i < 19; i++) t[i] += r[i]; });
    return t;
  }
  function playerName(teamId, idx) { return team(teamId).players[idx].name; }
  function playerNo(teamId, idx) { return team(teamId).players[idx].no; }

  // "1. pusfināls · 1. spēle", "Grupu turnīrs · 4. kārta · A grupa", "Astotdaļfināls · 1. spēle" …
  function gameStage(g, rnd) {
    if (g.comp === 'dbck' && g.stage === 'playoff') return gameTag(g);
    return groupTitle(rnd) + (g.stage === 'group' ? ' · ' + gameTag(g) : '');
  }
  function renderGame(id) {
    var raw = RAW[id];
    var g = ctx.games().filter(function (x) { return x.id === id; })[0];
    if (!raw || !g || !g.final) return false;
    var comp = g.comp;
    var hId = ctx.resolve(comp, g.home).team, aId = ctx.resolve(comp, g.away).team;
    var hw = g.hs > g.as;
    var rnd = ctx.round(g.round);
    var v = ctx.venue(g.venue);
    var mvp = (DATA.mvps || []).filter(function (m) { return m.game === id; })[0] || null;
    var html = '';

    html += '<a class="back" href="#' + CUPS[comp].hash + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Atpakaļ uz sākumu</a>';

    // Header
    var tieStrip = '';
    if (g.tie) {
      var st = ctx.tieState(comp, g.tie);
      if (st.type !== 'single') {
        var chips = st.games.filter(function (x) { return !x.notNeeded; }).map(function (x) {
          var label = x.n + '. spēle · ' + (x.final ? x.hs + ':' + x.as : dateShort(x.date));
          if (x.id === id) return '<span aria-current="page">' + esc(label) + '</span>';
          if (x.final) return '<a href="' + gameHref(x.id) + '">' + esc(label) + '</a>';
          return '<span>' + esc(label) + '</span>';
        });
        tieStrip = '<div class="gh-tie">' + chips.join('') + '</div>';
      }
    }
    var note = resNote(g);
    html += '<section class="gh" aria-label="Spēles rezultāts">' +
      // Centred, top to bottom: cup, stage + game, result, when/where, status, series games.
      '<div class="gh-meta"><p class="gh-cup">' + esc(CUPS[comp].short) + '</p><p class="gh-stage">' + esc(gameStage(g, rnd)) + '</p></div>' +
      '<div class="gh-board">' +
      '<a class="gh-team' + (hw ? ' is-win' : '') + '" href="' + teamHref(hId, comp) + '">' + badge(hId, 'lg') + '<span>' + esc(team(hId).name) + '</span></a>' +
      '<div class="gh-score"><span' + (hw ? ' class="w"' : '') + '>' + g.hs + '</span><span class="sep">:</span><span' + (hw ? '' : ' class="w"') + '>' + g.as + '</span></div>' +
      '<a class="gh-team' + (hw ? '' : ' is-win') + '" href="' + teamHref(aId, comp) + '">' + badge(aId, 'lg') + '<span>' + esc(team(aId).name) + '</span></a>' +
      '</div>' +
      '<p class="gh-when">' + esc(cap(dateLong(g.date)) + ', ' + g.time + ' · ' + v.name) + '</p>' +
      (note ? '<p class="gh-note">' + note + '</p>' : '') + tieStrip + '</section>';

    if (!raw.box) {
      html += '<div class="forfeit-box"><strong>Spēle nenotika.</strong> Piešķirts tehniskais rezultāts 20:0, tāpēc spēles statistikas nav.</div>';
      $('game-view').innerHTML = html;
      return true;
    }

    // Quarter scores
    var qh = raw.q.map(function (_, i) { return i < 4 ? (i + 1) + '.' : 'PL'; });
    function qRow(tid, idx, total, win) {
      return '<tr><td class="l"><span class="tm">' + badge(tid, 'sm') + '<span class="nm">' + esc(team(tid).short) + '</span></span></td>' +
        raw.q.map(function (q) { var mine = q[idx], other = q[1 - idx]; return '<td' + (mine > other ? ' class="qw"' : '') + '>' + mine + '</td>'; }).join('') +
        '<td class="tot">' + total + '</td></tr>';
    }
    html += '<section aria-labelledby="g-q"><h2 class="g-title" id="g-q">Rezultāts pa ceturtdaļām</h2><div class="qt-card"><table class="qt"><thead><tr><th class="l" scope="col">Komanda</th>' +
      qh.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '<th scope="col">Kopā</th></tr></thead><tbody>' +
      qRow(hId, 0, g.hs, hw) + qRow(aId, 1, g.as, !hw) + '</tbody></table></div>' +
      (raw.q.length > 4 ? '<p class="note">PL — papildlaiks (5 minūtes).</p>' : '') + '</section>';

    // Top performers
    var all = [];
    [['h', hId], ['a', aId]].forEach(function (p) { played(raw.box[p[0]]).forEach(function (r) { all.push({ team: p[1], r: r }); }); });
    function topBy(fn) { return all.slice().sort(function (x, y) { return fn(y.r) - fn(x.r); })[0]; }
    var LEAD = [
      { k: 'Punkti', fn: function (r) { return r[3]; } },
      { k: 'Atlēkušās bumbas', fn: function (r) { return r[10] + r[11]; } },
      { k: 'Rezultatīvas piespēles', fn: function (r) { return r[12]; } },
      { k: 'Efektivitāte', fn: function (r) { return r[17]; } }
    ];
    html += '<section aria-labelledby="g-l"><h2 class="g-title" id="g-l">Spēles līderi</h2><div class="leaders">' + LEAD.map(function (l) {
      var b = topBy(l.fn);
      var pn = playerName(b.team, b.r[0]), sp = pn.indexOf(' ');
      var nm = sp > 0 ? '<span class="fn">' + esc(pn.slice(0, sp)) + '</span> <span class="ln">' + esc(pn.slice(sp + 1)) + '</span>' : esc(pn);
      return '<div class="ldr"><p class="ldr-k">' + esc(l.k) + '</p><p class="ldr-who">' + badge(b.team, 'sm') + '<span class="nm">' + nm + '</span></p><p class="ldr-v">' + l.fn(b.r) + '</p></div>';
    }).join('') + '</div></section>';

    // Team comparison
    var th = totals(raw.box.h), ta = totals(raw.box.a);
    var CMP = [
      { l: 'Divpunktu metieni', m: 4, a: 5 },
      { l: 'Trīspunktu metieni', m: 6, a: 7 },
      { l: 'Soda metieni', m: 8, a: 9 },
      { l: 'Atlēkušās bumbas', v: function (t) { return t[10] + t[11]; }, sub: function (t) { return t[10] + '/' + t[11]; } },
      { l: 'Rezultatīvas piespēles', i: 12 },
      { l: 'Pārķertās bumbas', i: 13 },
      { l: 'Bloķētie metieni', i: 14 },
      { l: 'Kļūdas', i: 15, low: true },
      { l: 'Piezīmes', i: 16, low: true },
      { l: 'Efektivitāte', i: 17 }
    ];
    var cmpRows = CMP.map(function (c) {
      var hv, av, hs, as, hn, an;
      if (c.m != null) {
        hn = th[c.a] ? th[c.m] / th[c.a] : 0; an = ta[c.a] ? ta[c.m] / ta[c.a] : 0;
        hs = th[c.m] + '/' + th[c.a] + '<small>·</small>' + pct(th[c.m], th[c.a]);
        as = pct(ta[c.m], ta[c.a]) + '<small>·</small>' + ta[c.m] + '/' + ta[c.a];
      } else if (c.v) {
        hn = c.v(th); an = c.v(ta);
        hs = hn + '<small>(' + c.sub(th) + ')</small>'; as = '<small>(' + c.sub(ta) + ')</small>' + an;
      } else {
        hn = th[c.i]; an = ta[c.i]; hs = String(hn); as = String(an);
      }
      var hl = c.low ? hn < an : hn > an, al = c.low ? an < hn : an > hn;
      var sum = Math.abs(hn) + Math.abs(an) || 1;
      var hp = Math.max(4, Math.round(100 * Math.abs(hn) / sum)), ap = Math.max(4, 100 - hp);
      return '<div class="cmp-row"><span class="cmp-v h' + (hl ? ' lead' : '') + '">' + hs + '</span><span class="cmp-l">' + esc(c.l) + '</span><span class="cmp-v a' + (al ? ' lead' : '') + '">' + as + '</span>' +
        '<span class="cmp-bar" aria-hidden="true"><i class="h' + (hl ? ' lead' : '') + '" style="width:' + hp + '%"></i><i class="a' + (al ? ' lead' : '') + '" style="width:' + ap + '%"></i></span></div>';
    }).join('');
    html += '<section aria-labelledby="g-c"><h2 class="g-title" id="g-c">Komandu salīdzinājums</h2><div class="cmp">' +
      '<div class="cmp-head"><span>' + badge(hId, 'sm') + nameHtml(hId) + '</span><span></span><span>' + nameHtml(aId) + badge(aId, 'sm') + '</span></div>' +
      cmpRows + '</div></section>';

    // Box scores
    function boxTable(tid, rows, score) {
      var on = played(rows), dnp = rows.filter(function (r) { return r[2] == null; });
      var st = on.filter(function (r) { return r[1]; }).sort(function (x, y) { return y[3] - x[3]; });
      var bn = on.filter(function (r) { return !r[1]; }).sort(function (x, y) { return y[3] - x[3]; });
      var t = totals(rows);
      function tr(r, cls) {
        var isMvp = mvp && mvp.team === tid && mvp.idx === r[0];
        return '<tr class="' + cls + '"><td class="pl"><span class="row"><span class="no">' + esc(playerNo(tid, r[0])) + '</span><span class="nm">' + esc(playerName(tid, r[0])) + '</span>' + (isMvp ? '<span class="mvp-chip" title="Kārtas MVP">MVP</span>' : '') + '</span></td>' +
          '<td>' + mins(r[2]) + '</td><td class="pts">' + r[3] + '</td>' +
          '<td>' + r[4] + '/' + r[5] + '</td><td>' + r[6] + '/' + r[7] + '</td><td>' + r[8] + '/' + r[9] + '</td>' +
          '<td>' + r[10] + '</td><td>' + r[11] + '</td><td class="pts">' + (r[10] + r[11]) + '</td>' +
          '<td class="pts">' + r[12] + '</td><td>' + r[13] + '</td><td>' + r[14] + '</td><td>' + r[15] + '</td><td>' + r[16] + '</td>' +
          '<td>' + r[17] + '</td><td>' + (r[18] > 0 ? '+' : '') + r[18] + '</td></tr>';
      }
      var body = st.map(function (r) { return tr(r, 'st'); }).join('') +
        bn.map(function (r, i) { return tr(r, i === 0 ? 'bench-start' : ''); }).join('') +
        dnp.map(function (r) {
          return '<tr class="dnp"><td class="pl"><span class="row"><span class="no">' + esc(playerNo(tid, r[0])) + '</span><span class="nm">' + esc(playerName(tid, r[0])) + '</span></span></td><td colspan="15">Nepiedalījās</td></tr>';
        }).join('') +
        '<tr class="tot"><td class="pl">Komanda kopā</td><td>' + Math.round(t[2] / 60) + '</td><td class="pts">' + t[3] + '</td>' +
        '<td>' + t[4] + '/' + t[5] + '</td><td>' + t[6] + '/' + t[7] + '</td><td>' + t[8] + '/' + t[9] + '</td>' +
        '<td>' + t[10] + '</td><td>' + t[11] + '</td><td class="pts">' + (t[10] + t[11]) + '</td>' +
        '<td class="pts">' + t[12] + '</td><td>' + t[13] + '</td><td>' + t[14] + '</td><td>' + t[15] + '</td><td>' + t[16] + '</td><td>' + t[17] + '</td><td></td></tr>' +
        '<tr class="pct"><td class="pl">Precizitāte</td><td></td><td></td><td>' + pct(t[4], t[5]) + '</td><td>' + pct(t[6], t[7]) + '</td><td>' + pct(t[8], t[9]) + '</td><td colspan="10"></td></tr>';
      return '<div class="bx-card"><h3><a class="bx-team" href="' + teamHref(tid, g.comp) + '">' + badge(tid, 'sm') + esc(team(tid).name) + '</a><span class="sc">' + score + '</span></h3>' +
        '<div class="bx-scroll"><table class="bx"><thead><tr>' +
        '<th class="pl" scope="col">Spēlētājs</th><th scope="col" title="Minūtes">Min</th><th scope="col" title="Punkti">Pkt</th>' +
        '<th scope="col" title="Divpunktu metieni">2P</th><th scope="col" title="Trīspunktu metieni">3P</th><th scope="col" title="Soda metieni">SM</th>' +
        '<th scope="col" title="Atlēkušās bumbas uzbrukumā">Uzb</th><th scope="col" title="Atlēkušās bumbas aizsardzībā">Aizs</th><th scope="col" title="Atlēkušās bumbas kopā">AB</th>' +
        '<th scope="col" title="Rezultatīvas piespēles">RP</th><th scope="col" title="Pārķertās bumbas">PK</th><th scope="col" title="Bloķētie metieni">BL</th>' +
        '<th scope="col" title="Kļūdas">KĻ</th><th scope="col" title="Piezīmes">PZ</th><th scope="col" title="Efektivitāte">EF</th><th scope="col" title="Punktu starpība laukumā">+/−</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    }
    html += '<section aria-labelledby="g-b"><h2 class="g-title" id="g-b">Spēlētāju statistika</h2><div class="bx-grid">' +
      boxTable(hId, raw.box.h, g.hs) + boxTable(aId, raw.box.a, g.as) + '</div>' +
      '<p class="note">Treknrakstā — pamatsastāvs. 2P / 3P / SM — divu un trīs punktu metieni un soda metieni (iemesti/mesti). AB — atlēkušās bumbas (Uzb — uzbrukumā, Aizs — aizsardzībā). RP — rezultatīvas piespēles, PK — pārķertās bumbas, BL — bloķētie metieni, KĻ — kļūdas, PZ — piezīmes, EF — efektivitāte, +/− — punktu starpība, spēlētājam atrodoties laukumā.</p></section>';

    $('game-view').innerHTML = html;
    makeSortable($('game-view'), -1);
    return true;
  }

  // ---------- Sortable player tables (box scores, team rosters) ----------
  // Every header becomes a button. First click sorts high → low (names A → Ž),
  // a second click reverses. Totals, percentage and "did not play" rows stay at the bottom.
  function makeSortable(root, defaultCol) {
    root.querySelectorAll('table.bx').forEach(function (table) {
      table.querySelectorAll('thead th').forEach(function (th, i) {
        th.setAttribute('aria-sort', i === defaultCol ? 'descending' : 'none');
        th.innerHTML = '<button type="button" class="sort-btn" data-sort' + (i === 0 ? ' data-text' : '') + '>' + th.innerHTML + '</button>';
      });
    });
  }
  function cellValue(td, text) {
    var t = (td && td.textContent || '').trim();
    if (text) return t;
    var m = /^(\d+):(\d\d)$/.exec(t);
    if (m) return +m[1] * 60 + +m[2];
    m = /^[+−-]?\d+(?:[.,]\d+)?/.exec(t.replace('−', '-'));
    return m ? parseFloat(m[0].replace(',', '.')) : -Infinity;
  }
  function sortTable(btn) {
    var th = btn.closest('th'), table = btn.closest('table'), tbody = table.tBodies[0];
    var col = Array.prototype.indexOf.call(th.parentNode.children, th), text = btn.hasAttribute('data-text');
    var cur = th.getAttribute('aria-sort');
    var dir = cur === 'descending' ? 'ascending' : cur === 'ascending' ? 'descending' : (text ? 'ascending' : 'descending');
    table.querySelectorAll('thead th').forEach(function (x) { x.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', dir);
    var fixed = function (r) { return r.classList.contains('dnp') || r.classList.contains('tot') || r.classList.contains('pct'); };
    var rows = Array.prototype.filter.call(tbody.rows, function (r) { return !fixed(r); });
    var rest = Array.prototype.filter.call(tbody.rows, fixed);
    rows.sort(function (a, b) {
      var x = cellValue(a.cells[col], text), y = cellValue(b.cells[col], text);
      var d = text ? x.localeCompare(y, 'lv') : x - y;
      return dir === 'ascending' ? d : -d;
    });
    rows.concat(rest).forEach(function (r) { tbody.appendChild(r); });
    table.classList.add('is-sorted');
  }

  // ---------- Calendar page ----------
  var DOW = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'];
  var DOW_LONG = ['Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena', 'Svētdiena'];
  var MONTH_IN = MONTH_LOC; // "oktobrī"
  var MARK = { dbck: 'assets/dbck-mark.webp', jssc: 'assets/jssc-mark.webp' };

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(s) { return s.slice(0, 7); }
  function addMonth(m, n) { var p = m.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthName(m) { var p = m.split('-'); return cap(MONTH_NOM[+p[1] - 1]) + ' ' + p[0]; }

  // All games that are (or may still be) played, with resolved teams.
  function calGames() {
    return ctx.games().filter(function (g) {
      if (g.ifNeeded && !g.final && ctx.tieState(g.comp, g.tie).decided) return false;
      if (g.date < ctx.today && !g.final) return false;
      return true;
    }).map(function (g) {
      return Object.assign({}, g, { ht: ctx.resolve(g.comp, g.home).team, at: ctx.resolve(g.comp, g.away).team });
    });
  }
  function calFiltered() {
    var c = state.cal;
    return calGames().filter(function (g) {
      if (c.cup !== 'all' && g.comp !== c.cup) return false;
      if (c.team && g.ht !== c.team && g.at !== c.team) return false;
      return true;
    });
  }
  function byDate(list) {
    var m = {};
    list.forEach(function (g) { (m[g.date] = m[g.date] || []).push(g); });
    return m;
  }
  function nextGameDate(list) {
    var up = list.filter(function (g) { return !g.final && g.date >= ctx.today; }).map(function (g) { return g.date; }).sort();
    return up[0] || null;
  }
  function seasonMonths() {
    var ds = DATA.games.map(function (g) { return g.date; }).sort();
    return { first: ym(ds[0]), last: ym(ds[ds.length - 1]) };
  }
  function dayLabel(list) {
    var g = list[0], r = ctx.round(g.round);
    var main = list.filter(function (x) { return x.stage !== 'hope'; })[0] || g;
    r = ctx.round(main.round);
    return r.comp === 'jssc' ? r.stage + (r.label ? ' · ' + r.label : '') : r.stage + ' · ' + r.label;
  }
  // With a team filter: the opponent and (if played) the result.
  function teamView(g, tid) {
    var home = g.ht === tid, opp = home ? g.at : g.ht;
    var res = '';
    if (g.final) {
      var my = home ? g.hs : g.as, their = home ? g.as : g.hs;
      res = my + ':' + their;
    }
    return { opp: opp, res: res, won: g.final && ((home ? g.hs : g.as) > (home ? g.as : g.hs)) };
  }

  function renderCalendar() {
    var c = state.cal;
    var list = calFiltered();
    var days = byDate(list);
    var bounds = seasonMonths();
    var nextDate = nextGameDate(list);
    if (!c.month) {
      var lastDate = list.map(function (g) { return g.date; }).sort().pop();
      c.month = ym(nextDate || lastDate || DATA.games[0].date);
    }
    if (c.month < bounds.first) c.month = bounds.first;
    if (c.month > bounds.last) c.month = bounds.last;

    var teamsSorted = ctx.teams().slice().sort(function (a, b) { return a.short.localeCompare(b.short, 'lv'); });
    var opts = '<option value="">Visas komandas</option>' + teamsSorted.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (c.team === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    var CUPF = [{ k: 'all', l: 'Visi kausi', s: 'Visi' }, { k: 'dbck', l: 'Čempionu kauss', s: 'Dobele' }, { k: 'jssc', l: 'Izaicinājuma kauss', s: 'Jelgava' }];

    var html = '<div class="page-head"><p class="eyebrow">Sezona ' + esc(SEASON_LABEL) + '</p><h1 class="page-title">Kalendārs</h1>' +
      '<p class="page-sub">Visas Dobeles čempionu kausa un Jelgavas Izaicinājuma kausa spēles. Izvēlies dienu, lai redzētu spēles.</p></div>';

    html += '<div class="cal-filters">' +
      '<label class="team-pick" for="team-filter">' + (c.team ? badge(c.team, 'sm') : '<svg class="team-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.3 4.8 1.2 5.5 4.3"/></svg>') +
      '<span class="sr-only">Komanda</span><select id="team-filter">' + opts + '</select></label>' +
      '<div class="seg" role="group" aria-label="Kauss">' + CUPF.map(function (f) {
        return '<button type="button" data-cupf="' + f.k + '" aria-pressed="' + (c.cup === f.k) + '"><span class="lg">' + esc(f.l) + '</span><span class="sm">' + esc(f.s) + '</span></button>';
      }).join('') + '</div></div>';

    // Month grid (weeks start on Monday)
    var p = c.month.split('-');
    var first = new Date(+p[0], +p[1] - 1, 1);
    var lead = (first.getDay() + 6) % 7;
    var start = new Date(first); start.setDate(1 - lead);
    var monthDays = Object.keys(days).filter(function (d) { return ym(d) === c.month; }).sort();
    var nGames = monthDays.reduce(function (a, d) { return a + days[d].length; }, 0);

    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== first.getMonth()) break;
      var ds = ymd(d), inMonth = d.getMonth() === first.getMonth();
      var dg = days[ds];
      var cls = 'cal-day' + (inMonth ? '' : ' out') + (ds === ctx.today ? ' today' : '');
      if (!inMonth || !dg) {
        cells += '<div class="' + cls + '"><span class="cal-n">' + d.getDate() + '</span></div>';
        continue;
      }
      var played = dg.every(function (g) { return g.final; });
      cls += ' has' + (played ? ' past' : '') + (ds === nextDate ? ' next' : '');
      var cups = []; dg.forEach(function (g) { if (cups.indexOf(g.comp) < 0) cups.push(g.comp); });
      var marks = cups.map(function (k) { return '<img class="cal-cup" src="' + MARK[k] + '" alt="">'; }).join('');
      var info;
      if (c.team && dg.length === 1) {
        var tv = teamView(dg[0], c.team);
        cls += ' tv';
        info = '<span class="cal-opp">' + (tv.opp ? '<span class="cal-vs">VS</span>' + badge(tv.opp, 'sm') : '<span class="cal-oppn">Pretinieks vēl nav zināms</span>') + '</span>' +
          (tv.res ? '<span class="cal-res">' + wl(tv.won) + esc(tv.res) + '</span>' : '');
      } else {
        info = '<span class="cal-count">' + games(dg.length) + '</span>';
      }
      var aria = cap(DOW_LONG[(d.getDay() + 6) % 7]) + ', ' + d.getDate() + '. ' + MONTH_IN[d.getMonth()] + ' — ' + games(dg.length) + (played ? ', rezultāti' : '');
      cells += '<button type="button" class="' + cls + '" data-day="' + ds + '" aria-label="' + esc(aria) + '">' +
        '<span class="cal-n">' + d.getDate() + '</span><span class="cal-marks">' + marks + '</span>' + info +
        '<span class="cal-what">' + esc(dayLabel(dg)) + '</span>' +
        (ds === nextDate ? '<span class="cal-flag">Nākamā</span>' : '') + '</button>';
    }

    var prevOk = c.month > bounds.first, nextOk = c.month < bounds.last;
    html += '<section class="cal-card" aria-labelledby="cal-month">' +
      '<div class="cal-nav">' +
      '<button type="button" class="cal-btn" data-cal-nav="-1" aria-label="Iepriekšējais mēnesis"' + (prevOk ? '' : ' disabled') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div class="cal-mh"><h2 class="cal-month" id="cal-month">' + esc(monthName(c.month)) + '</h2><p class="cal-sum">' + (nGames ? games(nGames) + ' · ' + monthDays.length + ' spēļu ' + (monthDays.length === 1 ? 'diena' : 'dienas') : 'Šajā mēnesī spēļu nav') + '</p></div>' +
      '<button type="button" class="cal-btn" data-cal-nav="1" aria-label="Nākamais mēnesis"' + (nextOk ? '' : ' disabled') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '</div>' +
      '<div class="cal-grid">' + DOW.map(function (w) { return '<span class="cal-dow" aria-hidden="true">' + w + '</span>'; }).join('') + cells + '</div>' +
      '<div class="cal-legend"><span><img class="cal-cup" src="' + MARK.dbck + '" alt="">Dobeles čempionu kauss</span><span><img class="cal-cup" src="' + MARK.jssc + '" alt="">Izaicinājuma kauss</span><span><i class="cal-key next"></i>Nākamā spēļu diena</span><span><i class="cal-key past"></i>Aizvadīta</span></div>' +
      '</section>';

    // Same month as a list (quick scan on phones)
    if (monthDays.length) {
      html += '<section aria-labelledby="cal-list-title"><h2 class="g-title" id="cal-list-title">Spēļu dienas ' + esc(MONTH_IN[+p[1] - 1]) + '</h2><div class="cal-list">' +
        monthDays.map(function (ds) {
          var dg = days[ds], x = parse(ds);
          var cups = []; dg.forEach(function (g) { if (cups.indexOf(g.comp) < 0) cups.push(g.comp); });
          var played = dg.every(function (g) { return g.final; });
          var right;
          if (c.team && dg.length === 1) {
            var tv = teamView(dg[0], c.team);
            right = (tv.opp ? badge(tv.opp, 'sm') + '<span>' + esc(team(tv.opp).short) + '</span>' : '<span>Pretinieks vēl nav zināms</span>') + (tv.res ? '<b class="cal-wl">' + wl(tv.won) + esc(tv.res) + '</b>' : '<b>' + esc(dg[0].time) + '</b>');
          } else {
            right = '<span>' + games(dg.length) + '</span><b>' + (played ? 'Rezultāti' : esc(dg.map(function (g) { return g.time; }).sort()[0])) + '</b>';
          }
          return '<button type="button" class="cal-row' + (played ? ' past' : '') + (ds === nextDate ? ' next' : '') + '" data-day="' + ds + '">' +
            '<span class="cal-date"><b>' + x.getDate() + '</b><span>' + MONTH_NOM[x.getMonth()].slice(0, 3) + ' · ' + DOW[(x.getDay() + 6) % 7] + '</span></span>' +
            '<span class="cal-rmid">' + cups.map(function (k) { return '<img class="cal-cup" src="' + MARK[k] + '" alt="">'; }).join('') + '<span>' + esc(dayLabel(dg)) + '</span></span>' +
            '<span class="cal-rright">' + right + '</span></button>';
        }).join('') + '</div></section>';
    } else if (c.team || c.cup !== 'all') {
      html += '<div class="empty"><strong>Šajā mēnesī izvēlētajai komandai vai kausam spēļu nav.</strong>Izmanto bultiņas, lai pārietu uz citu mēnesi, vai noņem filtru.</div>';
    }

    $('calendar-view').innerHTML = html;
  }

  // ---------- Day pop-up ----------
  var sheetReturn = null;
  function openSheet(ds, trigger) {
    state.cal.open = ds; state.cal.showAll = false;
    sheetReturn = trigger || null;
    $('sheet').classList.remove('sheet--share', 'sheet--sponsor');
    renderSheet();
    $('sheet').hidden = false; $('sheet-scrim').hidden = false;
    document.body.classList.add('no-scroll');
    var cl = $('sheet').querySelector('[data-sheet-close]');
    if (cl) cl.focus();
  }
  function closeSheet() {
    if ($('sheet').hidden) return;
    state.cal.open = null;
    $('sheet').hidden = true; $('sheet-scrim').hidden = true; $('sheet').innerHTML = '';
    $('sheet').classList.remove('sheet--share', 'sheet--sponsor');
    releaseShare();
    document.body.classList.remove('no-scroll');
    if (sheetReturn && document.body.contains(sheetReturn)) sheetReturn.focus();
    sheetReturn = null;
  }
  function renderSheet() {
    var ds = state.cal.open; if (!ds) return;
    var all = calGames().filter(function (g) { return g.date === ds; });
    var shown = state.cal.showAll ? all : calFiltered().filter(function (g) { return g.date === ds; });
    var hidden = all.length - shown.length;
    var x = parse(ds);
    // Group by cup + hall (normally one group per day).
    var groups = [];
    shown.forEach(function (g) {
      var k = g.comp + '|' + g.venue, grp = groups.filter(function (q) { return q.k === k; })[0];
      if (!grp) { grp = { k: k, comp: g.comp, venue: g.venue, games: [] }; groups.push(grp); }
      grp.games.push(g);
    });
    var body = groups.map(function (grp) {
      var v = ctx.venue(grp.venue);
      var rounds = []; grp.games.forEach(function (g) { var r = ctx.round(g.round); if (rounds.indexOf(r) < 0) rounds.push(r); });
      var cupHead = '<p class="sheet-cup"><img class="cal-cup" src="' + MARK[grp.comp] + '" alt="">' + esc(CUPS[grp.comp].short) + '</p>';
      var played = grp.games.every(function (g) { return g.final; });
      var multi = rounds.length > 1;
      if (played) {
        return cupHead + '<div class="results">' + rounds.map(function (r) {
          var gs = sortGames(grp.games.filter(function (g) { return g.round === r.id; }));
          return '<h3 class="group-head">' + esc(groupTitle(r)) + ' <small>' + games(gs.length) + '</small></h3>' + gs.map(resRow).join('');
        }).join('') + '</div><p class="sheet-venue">' + esc(v.name + ', ' + v.address) + '</p>';
      }
      var list = rounds.map(function (r) {
        var gs = sortGames(grp.games.filter(function (g) { return g.round === r.id; }));
        return '<li class="group-head" role="presentation">' + esc(groupTitle(r)) + ' <small>' + games(gs.length) + '</small></li>' + gs.map(fxRow).join('');
      }).join('');
      return cupHead + '<div class="ticket">' +
        '<div class="stub" aria-hidden="true"><span class="stub-day">' + x.getDate() + '</span>' +
        '<span class="stub-txt"><span class="stub-month">' + MONTH_NOM[x.getMonth()] + '</span><span class="stub-wd">' + WEEKDAY_NOM[x.getDay()] + '</span></span>' + CAL_ICON + '</div>' +
        '<div class="ticket-main"><div class="venue-bar"><div><h3 class="venue-name">' + esc(v.name) + '</h3><p class="venue-addr">' + esc(v.address) + '</p></div>' +
        '<a class="map-link" href="' + esc(mapsUrl(v)) + '" target="_blank" rel="noopener" aria-label="' + esc(v.name) + ' — atvērt Google Maps">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>Kā nokļūt</a></div>' +
        '<ul class="fx-list">' + list + '</ul></div></div>';
    }).join('');
    var more = hidden > 0 ? '<button type="button" class="sheet-more" data-sheet-all>Rādīt visas šīs dienas spēles (vēl ' + games(hidden) + ')</button>' : '';
    $('sheet').innerHTML = '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + esc(cap(dateLong(ds))) + '</h2>' +
      '<button type="button" class="icon-btn" data-sheet-close aria-label="Aizvērt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="sheet-body">' + body + more + '</div>';
  }

  // ---------- Round posters (share pop-up) ----------
  // Two posters for the next round, drawn by poster.js: a 4:5 feed post and
  // a 9:16 Story/Reel. Phones get the system share sheet, others a download.
  var POSTER_DATA = JSON.parse(document.getElementById('poster-data').textContent);
  var NOTICE = 'Čempionāts var tikt fotografēts un/vai filmēts, foto/video var tikt izmantoti publicitātes vajadzībām';
  var SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8"/></svg>';
  var DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/></svg>';
  var POSTERS = [
    { key: 'feed', name: 'Ieraksts', hint: 'Facebook, Instagram · 4:5', file: 'ieraksts' },
    { key: 'story', name: 'Stāsts / Reels', hint: 'Instagram, Facebook · 9:16', file: 'stasts' }
  ];
  var share = { token: 0, files: {}, urls: [] };

  function canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.share &&
        navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] }));
    } catch (e) { return false; }
  }
  // This poster template covers the Dobele group stage and K group (incl. Hope
  // Cup games) and the Jelgava 1/8 and 1/4 finals. Semifinals and finals of
  // both cups will get their own template later, so no button there yet.
  function posterRound(nr) {
    return !!nr && nr.games.length > 0 && nr.games.every(function (g) {
      return g.comp === 'dbck' ? ['group', 'k', 'hope'].indexOf(g.stage) >= 0 : /^(R16|QF)/.test(g.tie || '');
    });
  }
  // Two separate photo pools: next-round posters (use "next") and results
  // posters (use "results"). Same photo for everyone during a round;
  // consecutive rounds get the next one. The full-photo results story prefers
  // upright photos.
  function posterPhoto(date, kind, format) {
    var pool = (POSTER_DATA.photos || []).filter(function (p) { return (p.use || ['next']).indexOf(kind) >= 0; });
    if (!pool.length) return null;
    var list = pool;
    if (kind === 'results' && format === 'story') {
      var tall = pool.filter(function (p) { return p.h > p.w; });
      if (tall.length) list = tall;
    }
    var dates = [];
    DATA.rounds.forEach(function (r) { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
    dates.sort();
    return list[Math.max(0, dates.indexOf(date)) % list.length];
  }
  function posterSpec(nr) {
    var pr = primaryRound(nr.rounds), x = parse(nr.date);
    var v = ctx.venue(nr.games[0].venue);
    return {
      cup: state.cup, seed: state.cup + nr.date,
      title: CUPS[state.cup].name,
      date: x.getDate() + '. ' + MONTH_NOM[x.getMonth()],
      hall: v ? v.name : '',
      stage: pr.stage + (pr.label ? ' · ' + pr.label : ''),
      names: ctx.teams().map(function (t) { return t.name; }),
      // Hope Cup games always go last, below the K group games.
      games: sortGames(nr.games).sort(function (x, y) { return (x.round !== pr.id) - (y.round !== pr.id); }).map(function (g) {
        var h = side(g.comp, g.home, false), a = side(g.comp, g.away, false);
        // A Hope Cup game inside a K group round gets a label over its row.
        var tag = g.round !== pr.id ? groupTitle(ctx.round(g.round)) : '';
        return {
          time: g.time, tag: tag,
          home: h.team ? team(h.team).name : refLabel(g.comp, g.home),
          away: a.team ? team(a.team).name : refLabel(g.comp, g.away)
        };
      }),
      notice: NOTICE
    };
  }
  // ---------- Results poster ----------
  function crestOf(id) {
    var tm = team(id);
    return { src: tm.logo || '', initials: initials(tm.short), color: tm.color };
  }
  // Small line under a score: series standing, aggregate, overtime, forfeit.
  function resultInfo(g) {
    var bits = [];
    var h = ctx.resolve(g.comp, g.home).team, a = ctx.resolve(g.comp, g.away).team;
    if (g.tie) {
      var st = ctx.tieState(g.comp, g.tie);
      var pts = function (x, id) { return ctx.resolve(g.comp, x.home).team === id ? x.hs : x.as; };
      if (st.type === 'bo3') {
        var wh = 0, wa = 0;
        st.games.forEach(function (x) { if (x.final && x.n <= g.n) { if (pts(x, h) > pts(x, a)) wh++; else wa++; } });
        bits.push('Sērijā ' + wh + ':' + wa);
      } else if (st.type === 'twoleg') {
        if (g.n === 1) bits.push('1. spēle');
        else {
          var th = 0, ta = 0;
          st.games.forEach(function (x) { if (x.final) { th += pts(x, h); ta += pts(x, a); } });
          bits.push('Summā ' + th + ':' + ta);
        }
      }
    }
    if (g.ot) bits.push('Papildlaikā');
    if (g.forfeit) bits.push('Tehniskais rezultāts');
    return bits.join(' · ');
  }
  function resultsSpec(lr) {
    var pr = primaryRound(lr.rounds), x = parse(lr.date);
    var finals = pr.stage === 'Fināli';
    return {
      cup: state.cup, seed: state.cup + lr.date + 'r',
      title: 'Rezultāti',
      sub: x.getDate() + '. ' + MONTH_NOM[x.getMonth()],   // date the games were played
      // Each round's games sit under a label with the stage and round
      // (Hope Cup games last); on finals day each game gets its own label.
      games: (function () {
        var prev = null;
        return sortGames(lr.games).sort(function (p, q) { return (p.round !== pr.id) - (q.round !== pr.id); }).map(function (g) {
          var tag = finals ? gameTag(g) : g.round !== prev ? groupTitle(ctx.round(g.round)) : '';
          prev = g.round;
          return {
            home: crestOf(ctx.resolve(g.comp, g.home).team), away: crestOf(ctx.resolve(g.comp, g.away).team),
            hs: g.hs, as: g.as, info: resultInfo(g), tag: tag
          };
        });
      })(),
      notice: NOTICE
    };
  }
  function releaseShare() {
    share.token++;
    share.urls.forEach(function (u) { URL.revokeObjectURL(u); });
    share.urls = []; share.files = {};
  }
  // kind: 'next' (next-round posters) or 'results' (previous-round results).
  function openShare(trigger, kind) {
    var results = kind === 'results';
    var round = results ? ctx.lastRound(state.cup) : ctx.nextRound(state.cup);
    if (!round || (!results && !posterRound(round)) || typeof window.Poster === 'undefined') return;
    releaseShare();
    var token = share.token;
    var canShare = canShareFiles();
    var base = CUPS[state.cup].hash + '-' + round.date + (results ? '-rezultati-' : '-');
    var cards = POSTERS.map(function (f) {
      return '<figure class="poster-card poster-card--' + f.key + '">' +
        '<div class="poster-frame" data-poster-frame="' + f.key + '"><span class="poster-wait">Gatavo plakātu…</span></div>' +
        '<figcaption class="poster-hint">' + esc(f.hint) + '</figcaption>' +
        '<div class="poster-actions">' +
        (canShare ? '<button type="button" class="btn btn--fill" data-poster-share="' + f.key + '" disabled>' + SHARE_ICON + 'Dalīties</button>' : '') +
        '<a class="btn' + (canShare ? '' : ' btn--fill') + '" data-poster-dl="' + f.key + '" download="' + esc(base + f.file + '.jpg') + '" aria-disabled="true">' + DL_ICON + 'Lejupielādēt</a>' +
        '</div></figure>';
    }).join('');
    sheetReturn = trigger || null;
    $('sheet').classList.add('sheet--share');
    $('sheet').innerHTML = '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + (results ? 'Kārtas rezultāti' : 'Kārtas plakāti') + '</h2>' +
      '<button type="button" class="icon-btn" data-sheet-close aria-label="Aizvērt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="sheet-body"><div class="poster-grid">' + cards + '</div>' +
      '<p class="poster-note">' + (canShare ? 'Spied „Dalīties”, lai publicētu plakātu sociālajos tīklos, vai lejupielādē to.' : 'Lejupielādē plakātu un publicē to sociālajos tīklos.') + '</p></div>';
    $('sheet').hidden = false; $('sheet-scrim').hidden = false;
    document.body.classList.add('no-scroll');
    var cl = $('sheet').querySelector('[data-sheet-close]');
    if (cl) cl.focus();

    // Everything the two posters need, loaded once.
    var spec = results ? resultsSpec(round) : posterSpec(round);
    var photos = {}, logos = POSTER_DATA.sponsors || [], srcs = [];
    var need = function (src) { if (src && srcs.indexOf(src) < 0) srcs.push(src); };
    POSTERS.forEach(function (f) { photos[f.key] = posterPhoto(round.date, results ? 'results' : 'next', f.key); if (photos[f.key]) need(photos[f.key].src); });
    logos.forEach(function (s) { need(s.src); });
    if (results) {
      need(CUPS[state.cup].logo);
      spec.games.forEach(function (gm) { need(gm.home.src); need(gm.away.src); });
    }
    window.Poster.prepare(srcs).then(function (imgs) {
      if (token !== share.token) return;
      var img = function (src) { var i = srcs.indexOf(src); return i < 0 ? null : imgs[i]; };
      spec.sponsors = logos.map(function (s) { return { img: img(s.src), w: s.w, h: s.h, scale: s.scale }; });
      if (results) {
        spec.logo = img(CUPS[state.cup].logo);
        spec.games.forEach(function (gm) { gm.home.img = img(gm.home.src); gm.away.img = img(gm.away.src); });
      }
      POSTERS.forEach(function (f) {
        var ph = photos[f.key];
        var fs = Object.assign({}, spec, { format: f.key, photo: ph ? { img: img(ph.src), focus: ph.focus, focusX: ph.focusX } : null });
        var canvas = results ? window.Poster.renderResults(fs) : window.Poster.render(fs);
        // Preview as a data URL (works in every viewer); the file itself as a blob.
        var preview = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob(function (blob) {
          if (token !== share.token || !blob) return;
          var name = base + f.file + '.jpg';
          share.files[f.key] = new File([blob], name, { type: 'image/jpeg' });
          var url = URL.createObjectURL(blob);
          share.urls.push(url);
          var frame = $('sheet').querySelector('[data-poster-frame="' + f.key + '"]');
          if (frame) frame.innerHTML = '<img src="' + preview + '" alt="' + esc(f.name + ' — ' + CUPS[state.cup].short + ', ' + dateDay(round.date)) + '">';
          var dl = $('sheet').querySelector('[data-poster-dl="' + f.key + '"]');
          if (dl) { dl.href = url; dl.removeAttribute('aria-disabled'); }
          var sb = $('sheet').querySelector('[data-poster-share="' + f.key + '"]');
          if (sb) sb.disabled = false;
        }, 'image/jpeg', 0.92);
      });
    });
  }
  function sharePoster(key) {
    var file = share.files[key];
    if (!file) return;
    navigator.share({ files: [file], title: CUPS[state.cup].short }).catch(function () { /* cancelled */ });
  }

  // ---------- Kopvērtējums (standings) page ----------
  // Seasons this site knows about. Past seasons will be added here as frozen
  // snapshots (seasons/<id>/…) once a season ends; each lists its own cups.
  var SEASONS = [
    { id: SEASON_LABEL.replace('/', '-'), label: SEASON_LABEL, current: true, cups: ['dbck', 'jssc'] }
  ];
  var CHIP = {
    live: '<span class="pill">Notiek</span>',
    done: '<span class="pill pill--done">Noslēdzies</span>',
    proj: '<span class="pill pill--ghost">Prognoze</span>',
    soon: '<span class="pill pill--done">Vēl nav sācies</span>'
  };
  function stageEnd(filter) {
    return DATA.games.filter(filter).map(function (g) { return g.date; }).sort().pop();
  }
  function lead(text) { return '<p class="st-lead">' + text + '</p>'; }
  function sec(html, done) { return '<section class="st-sec' + (done ? ' is-done' : '') + '">' + html + '</section>'; }

  function podiumHtml(places, extra) {
    // places: [{place, team, label}] in display order (2nd, 1st, 3rd)
    var steps = places.map(function (p) {
      return '<div class="pod pod--' + p.place + '">' +
        '<div class="pod-team">' + badge(p.team, 'xl') + '<p class="pod-name">' + esc(team(p.team).name) + '</p></div>' +
        '<div class="pod-step"><span class="pod-n">' + p.place + '.</span><span class="pod-l">' + esc(p.label) + '</span></div></div>';
    }).join('');
    return '<div class="podium" style="--n:' + places.length + '">' + steps + '</div>' + (extra || '');
  }

  function renderPodium(cup) {
    if (cup === 'dbck') {
      var gold = ctx.tieState('dbck', 'GOLD'), bronze = ctx.tieState('dbck', 'BRONZE'), hf = ctx.tieState('dbck', 'HF');
      var w = function (st) { return st[st.winner].team; }, l = function (st) { return st[st.winner === 'a' ? 'b' : 'a'].team; };
      var g = gold.games[0], b = bronze.games[0];
      var places = [
        { place: 2, team: l(gold), label: 'Sudrabs' },
        { place: 1, team: w(gold), label: 'Čempioni' },
        { place: 3, team: w(bronze), label: 'Bronza' }
      ];
      var hope = hf.decided ? '<div class="pod-extra"><img class="cal-cup" src="' + MARK.dbck + '" alt="">' + badge(w(hf), 'md') +
        '<div><p class="pod-extra-k">Cerību kausa ieguvēja</p><p class="pod-extra-n">' + esc(team(w(hf)).name) + '</p></div></div>' : '';
      var finals = '<p class="pod-finals">Zelta fināls: ' + esc(team(ctx.resolve('dbck', g.home).team).short) + ' ' + g.hs + ':' + g.as + ' ' + esc(team(ctx.resolve('dbck', g.away).team).short) +
        ' · Bronzas fināls: ' + esc(team(ctx.resolve('dbck', b.home).team).short) + ' ' + b.hs + ':' + b.as + ' ' + esc(team(ctx.resolve('dbck', b.away).team).short) + '</p>';
      return sec('<div class="block-head"><div class="block-head-main"><p class="eyebrow">Sezonas noslēgums</p><h2 class="block-title" id="pod-title">2027. gada Dobeles novada čempioni</h2></div></div>' +
        podiumHtml(places, finals + hope));
    }
    var f = ctx.tieState('jssc', 'F'), fg = f.games[0];
    var fw = f[f.winner].team, fl = f[f.winner === 'a' ? 'b' : 'a'].team;
    return sec('<div class="block-head"><div class="block-head-main"><p class="eyebrow">Sezonas noslēgums</p><h2 class="block-title" id="pod-title">Izaicinājuma kausa ieguvēja</h2></div></div>' +
      podiumHtml([{ place: 2, team: fl, label: 'Finālists' }, { place: 1, team: fw, label: 'Kausa ieguvēja' }],
        '<p class="pod-finals">Fināls: ' + esc(team(ctx.resolve('jssc', fg.home).team).short) + ' ' + fg.hs + ':' + fg.as + ' ' + esc(team(ctx.resolve('jssc', fg.away).team).short) + '</p>'));
  }

  function renderStandings() {
    var cup = state.cup, s = state.std;
    var seasons = SEASONS.filter(function (x) { return x.cups.indexOf(cup) >= 0; });
    var season = seasons.filter(function (x) { return x.id === s.season; })[0] || seasons.filter(function (x) { return x.current; })[0];
    // Kopvērtējums always shows the current season; past seasons live in "Iepriekšējās sezonas".
    var html = '<div class="page-head st-top"><div><p class="eyebrow">' + esc(CUPS[cup].name) + ' · sezona ' + esc(season.label) + '</p><h1 class="page-title">Kopvērtējums</h1></div></div>';

    if (!season.current) {
      // Past seasons are shown from their frozen snapshot (added when a season ends).
      $('standings-view').innerHTML = html + '<div class="empty"><strong>Sezonas ' + esc(season.label) + ' arhīvs vēl nav pieejams.</strong></div>';
      return;
    }

    var active = [], history = [];
    if (cup === 'jssc') {
      var js = ctx.jsscStage();
      if (js === 'done') {
        active.push(renderPodium('jssc'));
        history.push(sec(renderBracket({ id: 'st-bk', chip: CHIP.done, lead: lead('Fināls aizvadīts ' + dateDay(stageEnd(function (g) { return g.comp === 'jssc'; })) + '.') }), true));
      } else {
        active.push(sec(renderBracket({ id: 'st-bk', chip: js === 'projected' ? (ctx.groupStarted() ? CHIP.proj : CHIP.soon) : CHIP.live })));
      }
    } else {
      var st = ctx.dbckStage();
      var gEnd = stageEnd(function (g) { return g.stage === 'group'; });
      var kEnd = stageEnd(function (g) { return g.stage === 'k'; });
      var hEnd = stageEnd(function (g) { return g.stage === 'hope'; });
      var hope = ctx.tieState('dbck', 'HF');
      var groupsDone = sec(renderGroups({ id: 'st-groups', chip: CHIP.done,
        lead: lead('Grupu turnīrs noslēdzās ' + dateDay(gEnd) + '. 1.–4. vietas komandas turpina cīņu ' + KG_LOC + ', 5.–6. vietas komandas — Cerību kausā.') }), true);
      var kDone = function () {
        return sec(renderK({ id: 'st-k', chip: CHIP.done,
          lead: lead(KG + ' noslēdzās ' + dateDay(kEnd) + '. Četras labākās komandas turpina cīņu pusfinālos.') }), true);
      };
      var hopeSec = function () {
        return sec(renderHope({ id: 'st-hope', chip: hope.decided ? CHIP.done : CHIP.live,
          lead: hope.decided ? lead('Cerību kauss izcīnīts ' + dateDay(hEnd) + ' — uzvarēja ' + esc(team(hope[hope.winner].team).name) + '.') : '' }), hope.decided);
      };
      if (st === 'preseason' || st === 'group') {
        active.push(sec(renderGroups({ id: 'st-groups', chip: st === 'preseason' ? CHIP.soon : CHIP.live })));
      } else if (st === 'k') {
        active.push(sec(renderK({ id: 'st-k', chip: CHIP.live })));
        active.push(hopeSec());
        history.push(groupsDone);
      } else if (st === 'playoff') {
        active.push(sec(renderPlayoffs({ id: 'st-po', chip: CHIP.live })));
        history.push(hopeSec(), kDone(), groupsDone);
      } else {
        active.push(renderPodium('dbck'));
        history.push(sec(renderPlayoffs({ id: 'st-po', chip: CHIP.done,
          lead: lead('Fināli aizvadīti ' + dateDay(stageEnd(function (g) { return g.tie === 'GOLD'; })) + '.') }), true), hopeSec(), kDone(), groupsDone);
      }
    }
    html += active.join('');
    if (history.length) {
      html += '<div class="st-divider"><span>Iepriekšējie posmi</span></div>' + history.join('');
    }
    $('standings-view').innerHTML = html;
  }

  // ---------- Komandas: team list + team pages ----------
  // Everything is calculated from the results and box scores, per cup (the
  // page has a switch). Forfeits count in the record but not in the stats.
  function teamHref(id, comp) { return '#' + CUPS[comp || state.cup].hash + '-komanda-' + id; }
  function fmt1(x) { return x == null || isNaN(x) ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }
  function pct1(m, a) { return a ? (Math.round(1000 * m / a) / 10).toFixed(1).replace('.', ',') + '%' : '–'; }
  function byWhen(x, y) { var a = x.date + x.time, b = y.date + y.time; return a < b ? -1 : a > b ? 1 : 0; }
  var statsMemo = {};
  function cupStats(comp) {
    var key = comp + '|' + ctx.today;
    if (statsMemo[key]) return statsMemo[key];
    var T = {};
    ctx.teams().forEach(function (t) { T[t.id] = { team: t.id, w: 0, l: 0, list: [], sg: 0, pf: 0, pa: 0, tot: new Array(19).fill(0), players: {} }; });
    ctx.games().filter(function (g) { return g.comp === comp && g.final; }).sort(byWhen).forEach(function (g) {
      var raw = RAW[g.id];
      var h = ctx.resolve(comp, g.home).team, a = ctx.resolve(comp, g.away).team;
      [['h', h, a, g.hs, g.as], ['a', a, h, g.as, g.hs]].forEach(function (s) {
        var t = T[s[1]]; if (!t) return;
        var won = s[3] > s[4];
        if (won) t.w++; else t.l++;
        t.list.push({ g: g, opp: s[2], my: s[3], their: s[4], won: won });
        if (!raw.box) return;
        t.sg++; t.pf += s[3]; t.pa += s[4];
        played(raw.box[s[0]]).forEach(function (r) {
          var p = t.players[r[0]] || (t.players[r[0]] = { idx: r[0], gp: 0, sum: new Array(19).fill(0) });
          p.gp++;
          for (var i = 2; i < 19; i++) { t.tot[i] += r[i]; p.sum[i] += r[i]; }
        });
      });
    });
    statsMemo[key] = T;
    return T;
  }
  // Win / loss chip, the same everywhere on the site: green U, red Z.
  function wl(won, title) {
    return '<i class="wl ' + (won ? 'w' : 'l') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + (won ? 'U' : 'Z') + '</i>';
  }
  function formHtml(list, n) {
    var last = list.slice(-(n || 5));
    if (!last.length) return '';
    return '<span class="form" aria-label="Pēdējās spēles: ' + esc(last.map(function (x) { return x.won ? 'uzvara' : 'zaudējums'; }).join(', ')) + '">' +
      last.map(function (x) { return wl(x.won, dateShort(x.g.date) + ' pret ' + team(x.opp).short + ' ' + x.my + ':' + x.their); }).join('') + '</span>';
  }
  // Team averages, grouped. m/a = made/attempted (percentages); low = lower is better.
  var PERF = [
    { group: 'Punkti', rows: [
      { k: 'Gūtie punkti', v: function (t) { return t.pf / t.sg; }, cup: function (L) { return L.pf / L.sg; } },
      { k: 'Ielaistie punkti', v: function (t) { return t.pa / t.sg; }, cup: function (L) { return L.pa / L.sg; }, low: true }
    ] },
    { group: 'Metieni', rows: [
      { k: 'Metieni no spēles', m: function (t) { return t.tot[4] + t.tot[6]; }, a: function (t) { return t.tot[5] + t.tot[7]; } },
      { k: 'Divpunktu metieni', m: function (t) { return t.tot[4]; }, a: function (t) { return t.tot[5]; } },
      { k: 'Trīspunktu metieni', m: function (t) { return t.tot[6]; }, a: function (t) { return t.tot[7]; } },
      { k: 'Soda metieni', m: function (t) { return t.tot[8]; }, a: function (t) { return t.tot[9]; } }
    ] },
    { group: 'Pārējais', rows: [
      { k: 'Atlēkušās bumbas', i: [10, 11] },
      { k: 'Rezultatīvas piespēles', i: [12] },
      { k: 'Pārķertās bumbas', i: [13] },
      { k: 'Bloķētie metieni', i: [14] },
      { k: 'Kļūdas', i: [15], low: true },
      { k: 'Efektivitāte', i: [17] }
    ] }
  ];
  function perfValue(c, t) {
    if (c.m) return c.a(t) ? c.m(t) / c.a(t) : 0;
    if (c.i) return c.i.reduce(function (s, i) { return s + t.tot[i]; }, 0) / t.sg;
    return c.v(t);
  }
  var LEADS = [
    { k: 'Punkti', i: [3] },
    { k: 'Atlēkušās bumbas', i: [10, 11] },
    { k: 'Rezultatīvas piespēles', i: [12] },
    { k: 'Pārķertās bumbas', i: [13] },
    { k: 'Bloķētie metieni', i: [14] },
    { k: 'Efektivitāte', i: [17] }
  ];
  function psum(p, idx) { return idx.reduce(function (a, i) { return a + p.sum[i]; }, 0); }

  function cupSwitch(id) {
    return '<div class="seg tm-seg" role="group" aria-label="Kauss">' + ['dbck', 'jssc'].map(function (c) {
      var l = c === 'dbck' ? ['Čempionu kauss', 'Dobele'] : ['Izaicinājuma kauss', 'Jelgava'];
      return '<button type="button" data-team-cup="' + c + '" data-team-id="' + esc(id || '') + '" aria-pressed="' + (state.cup === c) + '"><span class="lg">' + l[0] + '</span><span class="sm">' + l[1] + '</span></button>';
    }).join('') + '</div>';
  }

  // Team list: logo tiles (like the sponsors page), alphabetical, no groups.
  function renderTeams() {
    var all = ctx.teams().slice().sort(function (a, b) { return a.short.localeCompare(b.short, 'lv'); });
    $('teams-view').innerHTML = '<div class="page-head"><p class="eyebrow">Sezona ' + esc(SEASON_LABEL) + '</p><h1 class="page-title">Komandas</h1>' +
      '<p class="page-sub">Visas sezonas komandas. Izvēlies komandu, lai redzētu tās statistiku, sastāvu un spēles.</p></div>' +
      '<div class="tm-tiles">' + all.map(function (t) {
        return '<a class="tm-tile" href="' + teamHref(t.id) + '"><span class="tm-tile-logo">' + badge(t.id, 'xl') + '</span><span class="tm-tile-name">' + esc(t.name) + '</span></a>';
      }).join('') + '</div>';
  }

  function teamRow(x, o) {
    // x: { g, opp (team id or null), oppLabel, my, their, won } ; o.next = upcoming game
    var g = x.g, d = parse(g.date), rnd = ctx.round(g.round);
    var stage = rnd ? groupTitle(rnd) : '';
    var opp = x.opp ? badge(x.opp, 'sm') + nameHtml(x.opp) : badge(null, 'sm') + '<span class="nm is-tbd">' + esc(x.oppLabel || 'Pretinieks vēl nav zināms') + '</span>';
    var right = o.next
      ? '<span class="tm-row-r"><b>' + esc(g.time) + '</b><small>' + esc((ctx.venue(g.venue) || {}).name || '') + '</small></span>'
      : '<span class="tm-row-r"><b class="tm-res">' + wl(x.won) + x.my + ':' + x.their + '</b>' + (g.forfeit ? '<small>Tehniskais rezultāts</small>' : '') + '</span>';
    var inner = '<span class="tm-row-d"><b>' + d.getDate() + '</b><span>' + MONTH_NOM[d.getMonth()].slice(0, 3) + '</span></span>' +
      '<span class="tm-row-m"><span class="tm-row-k">' + (o.mark ? '<img class="cal-cup" src="' + MARK[g.comp] + '" alt="">' : '') + esc(stage) + '</span><span class="tm-row-o">pret ' + opp + '</span></span>' + right;
    return o.next ? '<li class="tm-row">' + inner + '</li>' : '<li><a class="tm-row" href="' + gameHref(g.id) + '">' + inner + '</a></li>';
  }

  function renderTeam(id) {
    var t = team(id), cup = state.cup, S = cupStats(cup), s = S[id];
    // Top row: back link left, cup switch right.
    var html = '<div class="tm-bar"><a class="back" href="#' + CUPS[cup].hash + '-komandas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Visas komandas</a>' + cupSwitch(id) + '</div>';

    // Highlighted block (styled like the round MVP card): logo, name, record, last games, table position.
    var pos = '';
    if (cup === 'dbck') {
      var st = ctx.dbckStage();
      if (st === 'group' && t.group) {
        var gr = ctx.groupTable(t.group).filter(function (r) { return r.team === id; })[0];
        if (gr) pos = gr.pos + '. vieta ' + t.group + ' grupā';
      } else if (st === 'k') {
        var kr = ctx.kTable().filter(function (r) { return r.team === id; })[0];
        pos = kr ? kr.pos + '. vieta ' + KG_LOC : 'Cerību kauss';
      }
    }
    var meta = [t.group ? t.group + ' grupa' : '', t.city || '', CUPS[cup].short].filter(Boolean).join(' · ');
    html += '<section class="tm-hl" aria-label="' + esc(t.name) + '" data-mark="' + esc(t.short) + '">' +
      '<span class="tm-hl-logo">' + badge(id, 'xl') + '</span>' +
      '<div class="tm-hl-id"><p class="mvp-k">' + esc(meta) + '</p><h1 class="tm-hl-name">' + esc(t.name) + '</h1>' + (pos ? '<p class="tm-hl-pos">' + esc(pos) + '</p>' : '') + '</div>' +
      '<div class="tm-hl-rec"><dl class="mvp-stats"><div><dd>' + (s.w + s.l) + '</dd><dt>Spēles</dt></div><div><dd>' + s.w + '</dd><dt>Uzvaras</dt></div><div><dd>' + s.l + '</dd><dt>Zaudējumi</dt></div></dl>' +
      (s.list.length ? '<div class="tm-hl-form"><span>Pēdējās spēles</span>' + formHtml(s.list) + '</div>' : '') + '</div></section>';

    // Optional info from the sheet's "Komandas" tab (description, links).
    var links = LINKS.filter(function (l) { return t[l.key]; }).map(function (l) {
      return '<a class="sp-link" href="' + esc(t[l.key]) + '" target="_blank" rel="noopener">' + l.icon + esc(l.label) + '</a>';
    }).join('');
    var about = (t.description ? '<p class="sp-desc">' + esc(t.description) + '</p>' : '') + (links ? '<div class="sp-links">' + links + '</div>' : '');
    if (!about && SHOW_DEMO) about = '<p class="sp-desc sp-ph">Šeit būs komandas apraksts, pilsēta un saites no tabulas „Komandas”, ja tās būs aizpildītas.</p>';
    if (about) html += '<div class="tm-about">' + about + '</div>';

    // Next 3 games in the selected cup.
    var next = calGames().filter(function (g) { return g.comp === cup && !g.final && g.date >= ctx.today && (g.ht === id || g.at === id); }).sort(byWhen).slice(0, 3);
    var nextHtml = '<section class="tm-sec" aria-labelledby="tm-next"><h2 class="g-title" id="tm-next">Nākamās spēles</h2>' +
      (next.length ? '<ul class="tm-list">' + next.map(function (g) {
        var home = g.ht === id, oppRef = home ? g.away : g.home, oppId = home ? g.at : g.ht;
        return teamRow({ g: g, opp: oppId, oppLabel: oppId ? '' : refLabel(g.comp, oppRef, ctx.resolve(g.comp, oppRef)) }, { next: true });
      }).join('') + '</ul>' : '<div class="empty"><strong>' + (cup === 'jssc' ? 'Izaicinājuma kausā' : 'Čempionu kausā') + ' komandai nākamās spēles vēl nav ieplānotas.</strong></div>') + '</section>';

    if (!s.list.length) {
      html += '<div class="empty"><strong>' + (cup === 'jssc' ? 'Izaicinājuma kausā' : 'Čempionu kausā') + ' komanda vēl nav aizvadījusi nevienu spēli.</strong>Statistika parādīsies pēc pirmās spēles.</div>' + nextHtml;
      $('teams-view').innerHTML = html;
      return;
    }

    if (s.sg) {
      // 1) Team averages as a table: value, cup average, rank, bar vs the best team.
      var teamsIn = Object.keys(S).map(function (k) { return S[k]; }).filter(function (x) { return x.sg; });
      var L = { sg: 0, pf: 0, pa: 0, tot: new Array(19).fill(0) };
      teamsIn.forEach(function (x) { L.sg += x.sg; L.pf += x.pf; L.pa += x.pa; for (var i = 2; i < 19; i++) L.tot[i] += x.tot[i]; });
      var avgRow = function (c) {
        var v = perfValue(c, s), all = teamsIn.map(function (o) { return perfValue(c, o); });
        var rank = 1 + all.filter(function (ov) { return c.low ? ov < v : ov > v; }).length;
        var cupV = c.cup ? c.cup(L) : perfValue(c, L);
        var show = function (x, tt) { return c.m ? pct1(c.m(tt), c.a(tt)) : fmt1(x); };
        var sub = c.m ? '<small>' + fmt1(c.m(s) / s.sg) + '/' + fmt1(c.a(s) / s.sg) + ' spēlē</small>' : '';
        return '<div class="tm-avg-row' + (rank <= 3 ? ' is-top' : '') + '"><span class="tm-avg-k">' + esc(c.k) + sub + '</span>' +
          '<span class="tm-avg-v">' + show(v, s) + '</span><span class="tm-avg-c">' + show(cupV, L) + '</span>' +
          '<span class="tm-avg-r"><span class="tm-rank">' + rank + '. no ' + teamsIn.length + '</span></span></div>';
      };
      var head = '<div class="tm-avg-head"><span>Rādītājs</span><span>Komanda</span><span>Kausa vidējais</span><span>Vieta kausā</span></div>';
      var col = function (groups) {
        return '<div class="tm-avg-col">' + head + groups.map(function (gp) {
          return '<p class="tm-avg-g">' + esc(gp.group) + '</p>' + gp.rows.map(avgRow).join('');
        }).join('') + '</div>';
      };
      html += '<section class="tm-sec" aria-labelledby="tm-perf"><h2 class="g-title" id="tm-perf">Komandas sniegums <small>vidēji spēlē</small></h2>' +
        '<div class="tm-avg">' + col(PERF.slice(0, 2)) + col(PERF.slice(2)) + '</div>' +
        '<p class="note">Kausa vidējais — visu šī kausa komandu vidējais rādītājs. Vieta kausā — komandas vieta šajā rādītājā starp ' + teamsIn.length + ' komandām, kas kausā aizvadījušas spēles.</p></section>';

      // 2) Leaders: top 3 per category, per game, at least half of the team's games.
      var minGp = Math.ceil(s.sg / 2);
      var pool = Object.keys(s.players).map(function (k) { return s.players[k]; }).filter(function (p) { return p.gp >= minGp; });
      html += '<section class="tm-sec" aria-labelledby="tm-ldr"><h2 class="g-title" id="tm-ldr">Līderi <small>vidēji spēlē · vismaz ' + games(minGp) + '</small></h2><div class="tm-ldrs">' +
        LEADS.map(function (l) {
          var top = pool.slice().sort(function (x, y) { return psum(y, l.i) / y.gp - psum(x, l.i) / x.gp || psum(y, l.i) - psum(x, l.i); }).slice(0, 3);
          if (!top.length) return '';
          var nm = function (p) { return t.players[p.idx].name; };
          var val = function (p) { return fmt1(psum(p, l.i) / p.gp); };
          return '<article class="tm-ldr"><p class="mvp-k">' + esc(l.k) + '</p>' +
            '<div class="tm-ldr-1"><p class="tm-ldr-name">' + esc(nm(top[0])) + '</p><p class="tm-ldr-v">' + val(top[0]) + '</p></div>' +
            (top.length > 1 ? '<ol class="tm-ldr-rest" start="2">' + top.slice(1).map(function (p, i) {
              return '<li><span class="n">' + (i + 2) + '.</span><span class="nm">' + esc(nm(p)) + '</span><b>' + val(p) + '</b></li>';
            }).join('') + '</ol>' : '') + '</article>';
        }).join('') + '</div></section>';

      // 3) Roster: per-game averages and shooting percentages (no shirt numbers — they can change).
      var roster = t.players.map(function (pl, i) { return { pl: pl, p: s.players[i] || null }; });
      roster.sort(function (x, y) { return (y.p ? y.p.sum[3] / y.p.gp : -1) - (x.p ? x.p.sum[3] / x.p.gp : -1); });
      var avg = function (p, i) { return fmt1(p.sum[i] / p.gp); };
      html += '<section class="tm-sec" aria-labelledby="tm-rost"><h2 class="g-title" id="tm-rost">Sastāvs</h2><div class="bx-card"><div class="bx-scroll"><table class="bx bx--roster"><thead><tr>' +
        '<th class="pl" scope="col">Spēlētājs</th><th scope="col" title="Aizvadītās spēles">S</th><th scope="col" title="Punkti spēlē">Pkt</th><th scope="col" title="Atlēkušās bumbas spēlē">AB</th>' +
        '<th scope="col" title="Rezultatīvas piespēles spēlē">RP</th><th scope="col" title="Metieni no spēles">Met%</th><th scope="col" title="Divpunktu metieni">2P%</th><th scope="col" title="Trīspunktu metieni">3P%</th>' +
        '<th scope="col" title="Pārķertās bumbas spēlē">PK</th><th scope="col" title="Bloķētie metieni spēlē">BL</th><th scope="col" title="Efektivitāte spēlē">EF</th></tr></thead><tbody>' +
        roster.map(function (r) {
          var head = '<td class="pl"><span class="row"><span class="nm">' + esc(r.pl.name) + '</span></span></td>';
          if (!r.p) return '<tr class="dnp">' + head + '<td>0</td><td colspan="9">Šajā kausā nav spēlējis</td></tr>';
          var p = r.p;
          return '<tr>' + head + '<td>' + p.gp + '</td><td class="pts">' + avg(p, 3) + '</td><td>' + fmt1((p.sum[10] + p.sum[11]) / p.gp) + '</td><td>' + avg(p, 12) + '</td>' +
            '<td>' + pct(p.sum[4] + p.sum[6], p.sum[5] + p.sum[7]) + '</td><td>' + pct(p.sum[4], p.sum[5]) + '</td><td>' + pct(p.sum[6], p.sum[7]) + '</td>' +
            '<td>' + avg(p, 13) + '</td><td>' + avg(p, 14) + '</td><td>' + avg(p, 17) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<p class="note">Vidēji spēlē. S — aizvadītās spēles, Pkt — punkti, AB — atlēkušās bumbas, RP — rezultatīvas piespēles, Met% — metieni no spēles (divpunktu un trīspunktu kopā), 2P% / 3P% — divpunktu / trīspunktu metieni, PK — pārķertās bumbas, BL — bloķētie metieni, EF — efektivitāte.' +
        (s.sg < s.list.length ? ' Spēles ar tehnisko rezultātu statistikā netiek ieskaitītas.' : '') + '</p></section>';
    }

    // 4) Next games (both cups), 5) all results in this cup, newest first.
    html += nextHtml + '<section class="tm-sec" aria-labelledby="tm-res"><h2 class="g-title" id="tm-res">Rezultāti</h2><ul class="tm-list">' +
      s.list.slice().reverse().map(function (x) { return teamRow(x, {}); }).join('') + '</ul></section>';
    $('teams-view').innerHTML = html;
    makeSortable($('teams-view'), 2);   // roster starts sorted by points
  }

  // ---------- Sponsori page (same on both cups) ----------
  // Data comes from the season sheet's "Sponsori" tab: level, order,
  // description and links; an empty link means no button.
  var SPONSORS = JSON.parse(document.getElementById('sponsor-data').textContent);
  var LEVELS = [
    { key: 'Ģenerālsponsors', title: 'Ģenerālsponsori', cls: 'sp-grid--main', area: 15000, max: [250, 110] },
    { key: 'Atbalstītājs', title: 'Atbalstītāji', cls: '', area: 7600, max: [170, 76] }
  ];
  var LINKS = [
    { key: 'website', label: 'Mājaslapa', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' },
    { key: 'facebook', label: 'Facebook', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z"/></svg>' },
    { key: 'instagram', label: 'Instagram', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM16.8 3H7.2A4.2 4.2 0 0 0 3 7.2v9.6A4.2 4.2 0 0 0 7.2 21h9.6a4.2 4.2 0 0 0 4.2-4.2V7.2A4.2 4.2 0 0 0 16.8 3zm2.5 13.8a2.5 2.5 0 0 1-2.5 2.5H7.2a2.5 2.5 0 0 1-2.5-2.5V7.2a2.5 2.5 0 0 1 2.5-2.5h9.6a2.5 2.5 0 0 1 2.5 2.5v9.6z"/></svg>' },
    { key: 'tiktok', label: 'TikTok', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 3c.3 2.2 1.6 3.6 3.7 3.8v3.1a6.7 6.7 0 0 1-3.6-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7l.9.1v3.2a2.6 2.6 0 1 0 1.7 2.4V3h3z"/></svg>' }
  ];
  // Same visual weight for every logo of a level (like the footer).
  function spLogoSize(sp, lv) {
    var r = sp.w / sp.h, h = Math.sqrt(lv.area / r) * (sp.scale || 1), w = h * r;
    if (h > lv.max[1]) { h = lv.max[1]; w = h * r; }
    if (w > lv.max[0]) { w = lv.max[0]; h = w / r; }
    return { w: Math.round(w), h: Math.round(h) };
  }
  function renderSponsors() {
    var html = '<div class="page-head"><p class="eyebrow">Sezona ' + esc(SEASON_LABEL) + '</p><h1 class="page-title">Sponsori</h1>' +
      (SET.sponsorsText ? '<p class="page-sub">' + esc(SET.sponsorsText) + '</p>' : '') + '</div>';
    LEVELS.forEach(function (lv) {
      var list = SPONSORS.filter(function (sp) { return sp.level === lv.key; });
      if (!list.length) return;
      html += '<section class="sp-sec" aria-labelledby="sp-' + lv.cls + '"><h2 class="g-title" id="sp-' + lv.cls + '">' + esc(lv.title) + '</h2>' +
        '<div class="sp-grid ' + lv.cls + '">' + list.map(function (sp) {
          var z = spLogoSize(sp, lv);
          return '<button type="button" class="sp-tile" data-sponsor="' + esc(sp.id) + '" aria-haspopup="dialog">' +
            '<span class="sp-logo"><img src="' + esc(sp.src) + '" alt="" style="--w:' + z.w + ';--h:' + z.h + '" loading="lazy"></span>' +
            '<span class="sp-name">' + esc(sp.name) + '</span></button>';
        }).join('') + '</div></section>';
    });
    $('sponsors-view').innerHTML = html;
  }
  function openSponsor(id, trigger) {
    var sp = SPONSORS.filter(function (x) { return x.id === id; })[0];
    if (!sp) return;
    sheetReturn = trigger || null;
    var links = LINKS.filter(function (l) { return sp.links[l.key]; }).map(function (l) {
      return '<a class="sp-link" href="' + esc(sp.links[l.key]) + '" target="_blank" rel="noopener">' + l.icon + esc(l.label) + '</a>';
    }).join('');
    var desc = sp.description ? '<p class="sp-desc">' + esc(sp.description) + '</p>' : '';
    // Prototype only: show where the sheet's text and links will appear.
    if (SHOW_DEMO && !desc) desc = '<p class="sp-desc sp-ph">Šeit būs sponsora apraksts no Google tabulas cilnes „Sponsori”.</p>';
    if (SHOW_DEMO && !links) links = LINKS.map(function (l) { return '<span class="sp-link sp-ph">' + l.icon + esc(l.label) + '</span>'; }).join('');
    $('sheet').classList.add('sheet--sponsor');
    $('sheet').innerHTML = '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2 id="sheet-title">' + esc(sp.name) + '</h2>' +
      '<button type="button" class="icon-btn" data-sheet-close aria-label="Aizvērt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="sheet-body"><div class="sp-pop-logo"><img src="' + esc(sp.src) + '" alt="' + esc(sp.name) + '"></div>' +
      '<p class="eyebrow">' + esc(sp.level) + '</p>' + desc +
      (links ? '<div class="sp-links">' + links + '</div>' : '') + '</div>';
    $('sheet').hidden = false; $('sheet-scrim').hidden = false;
    document.body.classList.add('no-scroll');
    var cl = $('sheet').querySelector('[data-sheet-close]');
    if (cl) cl.focus();
  }

  // ---------- Routing ----------
  // #dobele / #jelgava = cup home; #spele-g12 = a single game.
  function route() {
    var h = (window.location.hash || '').replace('#', '');
    var m = /^spele-(g\d+)$/.exec(h);
    if (m && RAW[m[1]]) {
      state.view = 'game'; state.gameId = m[1]; state.cup = RAW[m[1]].comp;
    } else if (h === 'kalendars') {
      state.view = 'calendar'; state.gameId = null;
    } else if ((m = /^(dobele|jelgava)-komandas$/.exec(h))) {
      state.view = 'teams'; state.gameId = null; state.teamId = null;
      state.cup = m[1] === 'jelgava' ? 'jssc' : 'dbck';
    } else if ((m = /^(dobele|jelgava)-komanda-([a-z0-9-]+)$/.exec(h)) && DATA.teams.some(function (t) { return t.id === m[2]; })) {
      state.view = 'team'; state.gameId = null; state.teamId = m[2];
      state.cup = m[1] === 'jelgava' ? 'jssc' : 'dbck';
    } else if ((m = /^(dobele|jelgava)-sponsori$/.exec(h))) {
      state.view = 'sponsors'; state.gameId = null;
      state.cup = m[1] === 'jelgava' ? 'jssc' : 'dbck';
    } else if ((m = /^(dobele|jelgava)-kopvertejums(?:-(\d{4}-\d{2}))?$/.exec(h))) {
      state.view = 'standings'; state.gameId = null;
      state.cup = m[1] === 'jelgava' ? 'jssc' : 'dbck';
      state.std.season = m[2] || null;
    } else {
      state.view = 'home'; state.gameId = null;
      if (h === 'jelgava') state.cup = 'jssc';
      else if (h === 'dobele') state.cup = 'dbck';
    }
  }

  // ---------- Render ----------
  function render() {
    ctx = window.Engine.create(DATA, SHOW_DEMO ? (DEMO[state.demo] || DEMO.group) : FIXED_TODAY);
    document.documentElement.setAttribute('data-cup', state.cup);
    document.querySelectorAll('a[data-cup]').forEach(function (a) {
      if (a.getAttribute('data-cup') === state.cup) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('.demo [data-demo]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-demo') === state.demo));
    });
    var hero = document.querySelector('.hero');
    var NAVV = { home: ['home'], cal: ['calendar'], std: ['standings'], sp: ['sponsors'], tm: ['teams', 'team'] };
    document.querySelectorAll('[data-nav]').forEach(function (n) {
      if ((NAVV[n.getAttribute('data-nav')] || []).indexOf(state.view) >= 0) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    var stdLink = $('nav-std'); if (stdLink) stdLink.setAttribute('href', '#' + CUPS[state.cup].hash + '-kopvertejums');
    var spLink = $('nav-sp'); if (spLink) spLink.setAttribute('href', '#' + CUPS[state.cup].hash + '-sponsori');
    var tmLink = $('nav-tm'); if (tmLink) tmLink.setAttribute('href', '#' + CUPS[state.cup].hash + '-komandas');
    var team = state.view === 'teams' || state.view === 'team';
    $('sponsors-view').hidden = state.view !== 'sponsors';
    $('teams-view').hidden = !team;
    if (!team) $('teams-view').innerHTML = '';
    if (state.view === 'sponsors' || team) {
      hero.hidden = true; $('main').hidden = true; $('game-view').hidden = true;
      $('calendar-view').hidden = true; $('standings-view').hidden = true; $('standings-view').innerHTML = '';
      if (state.view === 'sponsors') renderSponsors();
      else if (state.view === 'teams') renderTeams();
      else renderTeam(state.teamId);
      return;
    }
    $('calendar-view').hidden = state.view !== 'calendar';
    $('standings-view').hidden = state.view !== 'standings';
    if (state.view !== 'standings') $('standings-view').innerHTML = '';
    if (state.view !== 'home') { $('block-stage').innerHTML = ''; $('block-extra').innerHTML = ''; }
    if (state.view === 'standings') {
      hero.hidden = true; $('main').hidden = true; $('game-view').hidden = true;
      renderStandings();
      return;
    }
    if (state.view === 'calendar') {
      hero.hidden = true; $('main').hidden = true; $('game-view').hidden = true;
      renderCalendar();
      if (state.cal.open) renderSheet();
      return;
    }
    if (state.view === 'game') {
      if (renderGame(state.gameId)) {
        hero.hidden = true; $('main').hidden = true; $('game-view').hidden = false;
        return;
      }
      // Game not played at this point of the (demo) season: go back home.
      state.view = 'home';
      window.location.hash = CUPS[state.cup].hash;
      return;
    }
    hero.hidden = false; $('main').hidden = false; $('game-view').hidden = true; $('game-view').innerHTML = '';
    var lr = ctx.lastRound(state.cup);
    renderHero();
    renderLast(lr);
    renderMvp(lr);
    renderNext();
    renderStage();
  }

  // ---------- Events ----------
  window.addEventListener('hashchange', function () {
    route();
    closeSheet();
    closeDrawer();
    render();
    window.scrollTo(0, 0);
  });

  document.addEventListener('click', function (e) {
    var demo = e.target.closest('[data-demo]');
    if (demo) { state.demo = demo.getAttribute('data-demo'); state.tabs = {}; state.cal.month = null; closeSheet(); save('demo', state.demo); render(); return; }
    var nav = e.target.closest('[data-cal-nav]');
    if (nav) { state.cal.month = addMonth(state.cal.month, +nav.getAttribute('data-cal-nav')); renderCalendar(); return; }
    var cf = e.target.closest('[data-cupf]');
    if (cf) { state.cal.cup = cf.getAttribute('data-cupf'); state.cal.month = null; renderCalendar(); return; }
    var day = e.target.closest('[data-day]');
    if (day) { openSheet(day.getAttribute('data-day'), day); return; }
    if (e.target.closest('[data-sheet-close]') || e.target.id === 'sheet-scrim') { closeSheet(); return; }
    if (e.target.closest('[data-sheet-all]')) { state.cal.showAll = true; renderSheet(); return; }
    var sr = e.target.closest('[data-share-round]');
    if (sr) { openShare(sr, 'next'); return; }
    var sres = e.target.closest('[data-share-results]');
    if (sres) { openShare(sres, 'results'); return; }
    var ps = e.target.closest('[data-poster-share]');
    if (ps) { sharePoster(ps.getAttribute('data-poster-share')); return; }
    var pd = e.target.closest('[data-poster-dl]');
    if (pd && pd.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    var tab = e.target.closest('[data-bk]');
    if (tab) {
      var tid = tab.getAttribute('data-tree'), key = tab.getAttribute('data-bk');
      state.tabs[tid] = key;
      $(tid).setAttribute('data-active', key);
      document.querySelectorAll('.tree-tab[data-tree="' + tid + '"]').forEach(function (b) { b.setAttribute('aria-selected', String(b === tab)); });
      return;
    }
    if (e.target.closest('[data-nav="home"]')) {
      closeDrawer();
      if (state.view !== 'home') window.location.hash = CUPS[state.cup].hash;
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var sb = e.target.closest('[data-sort]');
    if (sb) { sortTable(sb); return; }
    var tc = e.target.closest('[data-team-cup]');
    if (tc) {
      var tid = tc.getAttribute('data-team-id');
      window.location.hash = CUPS[tc.getAttribute('data-team-cup')].hash + (tid ? '-komanda-' + tid : '-komandas');
      return;
    }
    var spt = e.target.closest('[data-sponsor]');
    if (spt) { openSponsor(spt.getAttribute('data-sponsor'), spt); return; }
    if (e.target.closest('[data-nav="cal"]') || e.target.closest('[data-nav="std"]') || e.target.closest('[data-nav="sp"]') || e.target.closest('[data-nav="tm"]')) closeDrawer();
    // On the standings, sponsors and team pages the header logos switch the cup but stay on the page.
    var cupLink = e.target.closest('.cup-switch a[data-cup]');
    var STAY = { standings: '-kopvertejums', sponsors: '-sponsori', teams: '-komandas', team: '-komanda-' + state.teamId };
    if (cupLink && STAY[state.view]) {
      e.preventDefault();
      window.location.hash = CUPS[cupLink.getAttribute('data-cup')].hash + STAY[state.view];
      return;
    }
    if (e.target.closest('.drawer a[data-cup]')) closeDrawer();
  });

  // Drawer
  var drawer = $('drawer'), scrim = $('scrim'), openBtn = $('menu-open');
  function openDrawer() {
    drawer.classList.add('is-open');
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    $('menu-close').focus();
  }
  function closeDrawer() {
    if (!drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  }
  openBtn.addEventListener('click', openDrawer);
  $('menu-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('sheet').hidden) closeSheet(); else closeDrawer();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'season-pick') {
      var cur = SEASONS.filter(function (x) { return x.current; })[0];
      window.location.hash = CUPS[state.cup].hash + '-kopvertejums' + (e.target.value === cur.id ? '' : '-' + e.target.value);
      return;
    }
    if (e.target.id === 'team-filter') {
      state.cal.team = e.target.value; state.cal.month = null;
      save('team', state.cal.team);
      renderCalendar();
      var sel = $('team-filter'); if (sel) sel.focus();
    }
  });

  if (!SHOW_DEMO) {
    document.querySelector('.demo').hidden = true;
    document.documentElement.classList.add('no-demo');
  }
  route();
  render();
})();
