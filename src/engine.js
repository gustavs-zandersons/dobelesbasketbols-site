/*
 * Tournament engine for the 2026/27 Dobele Champions Cup (DBČK) and the
 * Jelgava Sports Service Centre Challenge Cup (JSSC Izaicinājuma kauss).
 *
 * Pure functions only: takes the season data (teams, games, rounds) and a
 * "today" date, and derives everything else — tables, tiebreakers, K group,
 * playoff series, two-leg ties and the (projected) Challenge Cup bracket.
 * Standings are never typed in by hand; they are calculated from results.
 *
 * Rules implemented (Nolikums 2026/27):
 *  - 8.5  win = 2, loss = 1, no-show = 0 (no-show result is 20:0)
 *  - 8.6  ties: head-to-head points, then head-to-head point difference,
 *         then head-to-head points scored, then lot. Applied FIBA-style:
 *         when a criterion separates a tied group, the still-tied subgroups
 *         restart from the first criterion using only their own games.
 *  - 8.4  K group: top 4 of A and B; results against own-group qualifiers
 *         are carried over; each team plays the 4 qualifiers of the other group.
 *  - 8.7  Hope Cup: A5–B6, B5–A6, single games, then final.
 *  - 8.8  Semifinals K1–K4, K2–K3, best of three. 8.9 Gold and bronze finals.
 *  - 9.x  Challenge Cup: A1, A2, B1, B2 straight to quarterfinals; R16, QF and
 *         SF decided on two-game aggregate (overtime in leg 2 if level);
 *         single-game final.
 */
(function (root) {
  'use strict';

  var STRUCTURE = {
    dbck: {
      ties: {
        SF1: { type: 'bo3', a: 'K1', b: 'K4', label: '1. pusfināls' },
        SF2: { type: 'bo3', a: 'K2', b: 'K3', label: '2. pusfināls' },
        GOLD: { type: 'single', a: 'W:SF1', b: 'W:SF2', label: 'Zelta fināls' },
        BRONZE: { type: 'single', a: 'L:SF1', b: 'L:SF2', label: 'Bronzas fināls' },
        H1: { type: 'single', a: 'A5', b: 'B6', label: '1. pusfināls' },
        H2: { type: 'single', a: 'B5', b: 'A6', label: '2. pusfināls' },
        HF: { type: 'single', a: 'W:H1', b: 'W:H2', label: 'Fināls' }
      }
    },
    jssc: {
      // Order = bracket order: left half (R16_1, R16_2 → QF1, QF2 → SF1),
      // right half (R16_3, R16_4 → QF3, QF4 → SF2), then final.
      ties: {
        R16_1: { type: 'twoleg', a: 'B4', b: 'A5', round: 'R16' },
        R16_2: { type: 'twoleg', a: 'A3', b: 'B6', round: 'R16' },
        R16_3: { type: 'twoleg', a: 'A4', b: 'B5', round: 'R16' },
        R16_4: { type: 'twoleg', a: 'B3', b: 'A6', round: 'R16' },
        QF1: { type: 'twoleg', a: 'A1', b: 'W:R16_1', round: 'QF' },
        QF2: { type: 'twoleg', a: 'B2', b: 'W:R16_2', round: 'QF' },
        QF3: { type: 'twoleg', a: 'B1', b: 'W:R16_3', round: 'QF' },
        QF4: { type: 'twoleg', a: 'A2', b: 'W:R16_4', round: 'QF' },
        SF1: { type: 'single', a: 'W:QF1', b: 'W:QF2', round: 'SF' },
        SF2: { type: 'single', a: 'W:QF3', b: 'W:QF4', round: 'SF' },
        F: { type: 'single', a: 'W:SF1', b: 'W:SF2', round: 'F' }
      }
    }
  };

  var SEED_RE = /^([AB])([1-6])$/;
  var K_RE = /^K([1-8])$/;
  var WL_RE = /^([WL]):(.+)$/;

  function create(data, today) {
    var teams = new Map();
    data.teams.forEach(function (t, i) { teams.set(t.id, Object.assign({ order: i }, t)); });

    var games = data.games.map(function (g) {
      var final = g.date < today && g.hs != null && g.as != null;
      return Object.assign({}, g, { final: final });
    });
    var memo = new Map();
    function cached(key, fn) {
      if (!memo.has(key)) memo.set(key, fn());
      return memo.get(key);
    }

    // ---------- Generic table with tiebreakers ----------
    function tally(ids, list) {
      var t = {};
      ids.forEach(function (id) { t[id] = { team: id, gp: 0, w: 0, l: 0, pf: 0, pa: 0, pts: 0 }; });
      list.forEach(function (g) {
        var h = t[g.h], a = t[g.a];
        if (!h || !a) return;
        h.gp++; a.gp++;
        h.pf += g.hs; h.pa += g.as; a.pf += g.as; a.pa += g.hs;
        var homeWon = g.hs > g.as;
        var winner = homeWon ? h : a, loser = homeWon ? a : h;
        winner.w++; loser.l++;
        winner.pts += 2;
        var loserForfeited = (g.forfeit === 'home' && loser === h) || (g.forfeit === 'away' && loser === a);
        loser.pts += loserForfeited ? 0 : 1;
      });
      return t;
    }

    function groupByValue(ids, val) {
      var sorted = ids.slice().sort(function (x, y) { return val(y) - val(x); });
      var out = [];
      sorted.forEach(function (id) {
        var last = out[out.length - 1];
        if (last && val(last[0]) === val(id)) last.push(id); else out.push([id]);
      });
      return out;
    }

    function breakTie(ids, list, orderOf) {
      if (ids.length < 2) return ids;
      var mini = tally(ids, list.filter(function (g) { return ids.indexOf(g.h) >= 0 && ids.indexOf(g.a) >= 0; }));
      var crits = [
        function (id) { return mini[id].pts; },
        function (id) { return mini[id].pf - mini[id].pa; },
        function (id) { return mini[id].pf; }
      ];
      for (var i = 0; i < crits.length; i++) {
        var groups = groupByValue(ids, crits[i]);
        if (groups.length > 1) {
          return groups.reduce(function (acc, gr) {
            return acc.concat(gr.length > 1 ? breakTie(gr, list, orderOf) : gr);
          }, []);
        }
      }
      // 8.6.4 — lot. Until a lot is drawn, keep the draw order.
      return ids.slice().sort(function (x, y) { return orderOf(x) - orderOf(y); });
    }

    function table(ids, list, orderOf) {
      var t = tally(ids, list);
      var byPts = groupByValue(ids, function (id) { return t[id].pts; });
      var ranked = byPts.reduce(function (acc, gr) {
        return acc.concat(gr.length > 1 ? breakTie(gr, list, orderOf) : gr);
      }, []);
      return ranked.map(function (id, i) {
        var r = t[id];
        return Object.assign({ pos: i + 1, diff: r.pf - r.pa }, r);
      });
    }

    // ---------- Group stage ----------
    function groupIds(grp) {
      return data.teams.filter(function (t) { return t.group === grp; }).map(function (t) { return t.id; });
    }
    function stageGames(comp, stage) {
      return games.filter(function (g) { return g.comp === comp && g.stage === stage; });
    }
    function plain(g) { return { h: g.h, a: g.a, hs: g.hs, as: g.as, forfeit: g.forfeit }; }

    function groupStarted() {
      return stageGames('dbck', 'group').some(function (g) { return g.final; });
    }
    function groupComplete() {
      var gs = stageGames('dbck', 'group');
      return gs.length > 0 && gs.every(function (g) { return g.final; });
    }
    function groupTable(grp) {
      return cached('group:' + grp, function () {
        var ids = groupIds(grp);
        var list = stageGames('dbck', 'group').filter(function (g) {
          return g.final && ids.indexOf(g.home) >= 0;
        }).map(function (g) { return plain({ h: g.home, a: g.away, hs: g.hs, as: g.as, forfeit: g.forfeit }); });
        return table(ids, list, orderOf).map(function (r) {
          r.seed = grp + r.pos;
          return r;
        });
      });
    }
    function orderOf(id) { return teams.get(id).order; }

    // ---------- Reference resolution ----------
    // A ref is a team id, a group seed (A1..B6), a K seed (K1..K8) or the
    // winner/loser of a tie (W:SF1, L:SF1). opts.project = use current
    // standings for group seeds before the group stage is over.
    function resolve(comp, ref, opts) {
      opts = opts || {};
      if (teams.has(ref)) return { team: ref, ref: ref, projected: false };
      var m = SEED_RE.exec(ref);
      if (m) {
        if (groupComplete()) return { team: groupTable(m[1])[+m[2] - 1].team, ref: ref, seed: ref, projected: false };
        if (opts.project && groupStarted()) return { team: groupTable(m[1])[+m[2] - 1].team, ref: ref, seed: ref, projected: true };
        return { team: null, ref: ref, seed: ref, placeholder: ref };
      }
      m = K_RE.exec(ref);
      if (m) {
        if (kComplete()) return { team: kTable()[+m[1] - 1].team, ref: ref, seed: ref, projected: false };
        return { team: null, ref: ref, seed: ref, placeholder: ref };
      }
      m = WL_RE.exec(ref);
      if (m) {
        var st = tieState(comp, m[2], opts);
        if (st.decided) {
          var side = m[1] === 'W' ? st.winner : (st.winner === 'a' ? 'b' : 'a');
          return { team: st[side].team, ref: ref, projected: st[side].projected };
        }
        return { team: null, ref: ref, placeholder: placeholderFor(comp, m[1], m[2], opts) };
      }
      return { team: null, ref: ref, placeholder: ref };
    }

    function placeholderFor(comp, wl, tieId, opts) {
      var def = STRUCTURE[comp].ties[tieId];
      // Winner of a first-round tie: name both possible seeds, e.g. "B4 / A5".
      if (wl === 'W' && SEED_RE.test(def.a) && SEED_RE.test(def.b)) {
        return def.a + ' / ' + def.b;
      }
      return wl === 'W' ? 'Uzvarētājs' : 'Zaudētājs';
    }

    // ---------- K group ----------
    function kQualifiers() {
      return ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'].map(function (s) {
        return { seed: s, team: groupTable(s[0])[+s[1] - 1].team };
      });
    }
    function kGamesResolved() {
      return stageGames('dbck', 'k').map(function (g) {
        return Object.assign({}, g, { h: resolve('dbck', g.home).team, a: resolve('dbck', g.away).team });
      });
    }
    function kComplete() {
      if (!groupComplete()) return false;
      var ks = stageGames('dbck', 'k');
      return ks.length > 0 && ks.every(function (g) { return g.final; });
    }
    function kStarted() {
      return groupComplete();
    }
    function kTable() {
      return cached('k', function () {
        if (!groupComplete()) return null;
        var q = kQualifiers();
        var ids = q.map(function (x) { return x.team; });
        var seedOf = {};
        q.forEach(function (x) { seedOf[x.team] = x.seed; });
        // Carried over: group games between two qualifiers from the same group.
        var carried = stageGames('dbck', 'group').filter(function (g) {
          return g.final && seedOf[g.home] && seedOf[g.away] && seedOf[g.home][0] === seedOf[g.away][0];
        }).map(function (g) { return { h: g.home, a: g.away, hs: g.hs, as: g.as, forfeit: g.forfeit, carried: true }; });
        var kg = kGamesResolved().filter(function (g) { return g.final; }).map(plain);
        var all = carried.concat(kg);
        var kOrder = function (id) { return ['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4'].indexOf(seedOf[id]); };
        var carriedT = tally(ids, carried);
        return table(ids, all, kOrder).map(function (r) {
          r.seed = 'K' + r.pos;
          r.origin = seedOf[r.team];
          r.carriedW = carriedT[r.team].w;
          r.carriedL = carriedT[r.team].l;
          return r;
        });
      });
    }

    // ---------- Ties: single game, best of three, two legs ----------
    function tieState(comp, id, opts) {
      opts = opts || {};
      var key = 'tie:' + comp + ':' + id + ':' + (opts.project ? 'p' : '');
      return cached(key, function () {
        var def = STRUCTURE[comp].ties[id];
        var A = resolve(comp, def.a, opts), B = resolve(comp, def.b, opts);
        var tg = games.filter(function (g) { return g.comp === comp && g.tie === id; })
          .sort(function (x, y) { return (x.n || 0) - (y.n || 0); });
        var winsA = 0, winsB = 0, aggA = 0, aggB = 0;
        var list = tg.map(function (g) {
          var homeIsA = g.home === def.a;
          var aScore = g.final ? (homeIsA ? g.hs : g.as) : null;
          var bScore = g.final ? (homeIsA ? g.as : g.hs) : null;
          if (g.final) {
            aggA += aScore; aggB += bScore;
            if (aScore > bScore) winsA++; else winsB++;
          }
          return Object.assign({}, g, { aScore: aScore, bScore: bScore, homeIsA: homeIsA });
        });
        var decided = false, winner = null;
        if (def.type === 'single') {
          if (list[0] && list[0].final) { decided = true; winner = list[0].aScore > list[0].bScore ? 'a' : 'b'; }
        } else if (def.type === 'bo3') {
          if (winsA === 2 || winsB === 2) { decided = true; winner = winsA === 2 ? 'a' : 'b'; }
        } else if (def.type === 'twoleg') {
          if (list.length === 2 && list.every(function (g) { return g.final; })) {
            decided = true; winner = aggA > aggB ? 'a' : 'b';
          }
        }
        // A third semifinal game is only played if the series is 1–1.
        list.forEach(function (g) {
          g.notNeeded = !!g.ifNeeded && decided && !g.final;
        });
        var anyProjected = !!(A.projected || B.projected);
        return {
          id: id, comp: comp, def: def, type: def.type, label: def.label,
          a: A, b: B, games: list, decided: decided, winner: winner,
          winsA: winsA, winsB: winsB, aggA: aggA, aggB: aggB,
          started: list.some(function (g) { return g.final; }),
          projected: anyProjected
        };
      });
    }

    function bracket(comp, opts) {
      return Object.keys(STRUCTURE[comp].ties).map(function (id) { return tieState(comp, id, opts); });
    }

    // ---------- Rounds ----------
    function compGames(comp) {
      return games.filter(function (g) { return g.comp === comp; });
    }
    function isNeeded(g) {
      if (!g.ifNeeded || g.final) return true;
      return !tieState(g.comp, g.tie).decided;
    }
    function datesOf(list) {
      var s = {};
      list.forEach(function (g) { s[g.date] = true; });
      return Object.keys(s).sort();
    }
    function roundsOnDate(comp, date, list) {
      var ids = [];
      list.forEach(function (g) { if (g.date === date && ids.indexOf(g.round) < 0) ids.push(g.round); });
      return data.rounds.filter(function (r) { return r.comp === comp && ids.indexOf(r.id) >= 0; });
    }
    function lastRound(comp) {
      var played = compGames(comp).filter(function (g) { return g.final; });
      if (!played.length) return null;
      var date = datesOf(played).pop();
      var list = played.filter(function (g) { return g.date === date; });
      return { date: date, rounds: roundsOnDate(comp, date, list), games: list, mvp: mvp(comp, date) };
    }
    function nextRound(comp) {
      var upcoming = compGames(comp).filter(function (g) { return !g.final && g.date >= today && isNeeded(g); });
      if (!upcoming.length) return null;
      var date = datesOf(upcoming)[0];
      var list = upcoming.filter(function (g) { return g.date === date; });
      return { date: date, rounds: roundsOnDate(comp, date, list), games: list };
    }
    function mvp(comp, date) {
      return (data.mvps || []).filter(function (m) { return m.comp === comp && m.date === date; })[0] || null;
    }

    // ---------- Current stage (drives the home page) ----------
    function dbckStage() {
      if (!groupStarted()) return 'preseason';
      if (!groupComplete()) return 'group';
      if (!kComplete()) return 'k';
      var gold = tieState('dbck', 'GOLD');
      return gold.decided ? 'done' : 'playoff';
    }
    function jsscStage() {
      if (!groupComplete()) return 'projected';
      var f = tieState('jssc', 'F');
      return f.decided ? 'done' : 'live';
    }

    return {
      today: today,
      team: function (id) { return teams.get(id) || null; },
      teams: function () { return data.teams.slice(); },
      venue: function (id) { return (data.venues || []).filter(function (v) { return v.id === id; })[0] || null; },
      round: function (id) { return data.rounds.filter(function (r) { return r.id === id; })[0] || null; },
      groupTable: groupTable,
      groupStarted: groupStarted,
      groupComplete: groupComplete,
      kTable: kTable,
      kStarted: kStarted,
      kComplete: kComplete,
      resolve: resolve,
      tieState: tieState,
      bracket: bracket,
      lastRound: lastRound,
      nextRound: nextRound,
      dbckStage: dbckStage,
      jsscStage: jsscStage,
      games: function () { return games.slice(); }
    };
  }

  var Engine = { create: create, STRUCTURE: STRUCTURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : this);
