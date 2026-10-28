/* YouTube feed — build time only (tools/prerender.py runs this inside the
   pre-rendered site page, so it uses the site's own data, engine and poster code).

   Writes, through prerender.py:
     dist/youtube/speles.json   every game that isn't played yet: start time (UTC),
                                title, description, whether both teams are known,
                                whether the game is needed, thumbnail address
     dist/youtube/<id>.jpg      1280×720 thumbnail for each game whose teams are known

   The season sheet's Apps Script (apps-script/youtube.gs) reads the feed and
   creates or updates one scheduled YouTube stream per game. All wording lives
   here, so titles and descriptions change with a site update — the script in
   the sheet never needs editing for that.

   Title rules (decided 28 Oct 2026):
     <home short> - <away short> | <year>. gada <cup> - <stage>[, <n>. spēle]
     · Dobele cup: "Dobeles basketbola čempionu kauss"; Jelgava cup: "JSSC Izaicinājuma kauss"
     · stage, not the round; the game number only for two-game ties and best-of-3
       series, and only while the title stays within YouTube's 100 characters
     · still too long → "Dobeles čempionu kauss" (drops "basketbola") */
(function () {
  'use strict';
  var TITLE_MAX = 100;            // YouTube: 1–100 characters
  var DESC_MAX_BYTES = 5000;      // YouTube: up to 5000 bytes, no < or >
  var WEEKDAYS = ['Svētdiena', 'Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena'];
  var PLAYLISTS = { dbck: 'Dobeles Champion Cup 2026-2027', jssc: 'Jelgava Challenger Cup 2026-2027' };
  var HASHTAGS = { dbck: '#DobelesBasketbols #basketbols #ČempionuKauss', jssc: '#DobelesBasketbols #basketbols #IzaicinājumaKauss' };
  var CUP_PATH = { dbck: 'dobele', jssc: 'jelgava' };
  var CUP_LOGO = { dbck: 'assets/dbck-logo.webp', jssc: 'assets/jssc-logo.webp' };

  var state = null;

  function clean(s) { return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+$/g, ''); }
  function bytes(s) { return new TextEncoder().encode(s).length; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function initials(s) { return String(s).replace(/[^A-Za-zĀ-ž]/g, '').slice(0, 2).toUpperCase(); }

  // Cup names: title (short form for YouTube's limit), description, thumbnail band.
  function cupNames(comp, year) {
    if (comp === 'jssc') {
      return { title: [year + '. gada JSSC Izaicinājuma kauss'],
               desc: year + '. gada Jelgavas Sporta servisa centra Izaicinājuma kauss' };
    }
    return { title: [year + '. gada Dobeles basketbola čempionu kauss', year + '. gada Dobeles čempionu kauss'],
             desc: year + '. gada Dobeles basketbola čempionu kauss' };
  }

  // Stage words. title: lower case as agreed; thumb: the pill on the thumbnail.
  function stageOf(g, team) {
    var tie = g.tie || '', n = g.n || 0, multi = false, title = '', desc = '', pill = '';
    if (g.stage === 'group') {
      var grp = (team(g.home) || {}).group;
      title = 'grupu turnīrs';
      desc = 'grupu turnīrs' + (grp ? ', ' + grp + ' grupa' : '');
      pill = 'grupu turnīrs' + (grp ? ' · ' + grp + ' grupa' : '');
    } else if (g.stage === 'k') {
      title = 'K grupa'; desc = 'Playoff kvalifikācijas grupa';
    } else if (g.stage === 'hope') {
      title = desc = tie === 'HF' ? 'Cerību kausa fināls' : 'Cerību kausa pusfināls';
    } else if (g.stage === 'playoff') {
      if (tie === 'GOLD') title = 'zelta fināls';
      else if (tie === 'BRONZE') title = 'bronzas fināls';
      else { title = 'pusfināls'; multi = true; }
      desc = title;
    } else if (g.stage === 'cup') {
      if (/^R16/.test(tie)) { title = 'astotdaļfināls'; multi = true; }
      else if (/^QF/.test(tie)) { title = 'ceturtdaļfināls'; multi = true; }
      else if (/^SF/.test(tie)) title = 'pusfināls';
      else title = 'fināls';
      desc = title;
    }
    var num = multi && n ? ', ' + n + '. spēle' : '';
    return { title: title, num: num, desc: desc + num, thumb: pill || (desc + num).replace(', ', ' · ') };
  }

  function makeTitle(home, away, cups, stage) {
    var tries = [];
    cups.forEach(function (cup, i) {
      if (i === 0 && stage.num) tries.push(home + ' - ' + away + ' | ' + cup + ' - ' + stage.title + stage.num);
      tries.push(home + ' - ' + away + ' | ' + cup + ' - ' + stage.title);
    });
    for (var i = 0; i < tries.length; i++) if (Array.from(tries[i]).length <= TITLE_MAX) return clean(tries[i]);
    return clean(Array.from(tries[tries.length - 1]).slice(0, TITLE_MAX).join(''));   // never expected
  }

  function feed(opts) {
    var D = window.SITE_DATA.season, site = opts.site, links = opts.links || {};
    var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Riga' });
    var ctx = window.Engine.create(D, today);
    var team = function (id) { return ctx.team(id); };
    var seasonId = String(D.settings.season || D.season).replace('/', '-');
    var year = String(D.settings.season || D.season).slice(0, 4);
    var games = [], thumbs = {};

    // Same photo for every game on a day, the next one for the next game day.
    var pool = ((window.SITE_DATA.poster || {}).photos || []).filter(function (p) { return (p.use || ['next']).indexOf('next') >= 0; });
    var days = [];
    D.rounds.forEach(function (r) { if (days.indexOf(r.date) < 0) days.push(r.date); });
    days.sort();
    function photoFor(date) { return pool.length ? pool[Math.max(0, days.indexOf(date)) % pool.length] : null; }

    // A third semifinal game is needed only when the series stands 1–1 after two games.
    function needed(g) {
      if (!g.ifNeeded) return true;
      var st = ctx.tieState(g.comp, g.tie);
      var firstTwo = st.games.filter(function (x) { return x.n < g.n; });
      return firstTwo.length === 2 && firstTwo.every(function (x) { return x.final; }) && !st.decided;
    }

    ctx.games().forEach(function (g) {
      if (g.final) return;                                   // played: nothing to schedule
      var h = ctx.resolve(g.comp, g.home).team, a = ctx.resolve(g.comp, g.away).team;
      var H = h && team(h), A = a && team(a);
      var known = !!(H && A);
      var stage = stageOf(g, team), cups = cupNames(g.comp, year);
      var venue = ctx.venue(g.venue) || { name: '' };
      var start = new Date(g.date + 'T' + (g.time || '00:00') + ':00');   // the page runs in Europe/Riga
      var day = new Date(g.date + 'T12:00:00');
      var ymd = g.date.split('-');
      var dateLv = ymd[2] + '.' + ymd[1] + '.' + ymd[0] + '.';
      var page = site + '/speles/' + seasonId + '/' + g.id + '/';
      var cupPath = CUP_PATH[g.comp];
      var item = {
        id: g.id, comp: g.comp, date: g.date, time: g.time, start: start.toISOString(),
        teamsKnown: known, needed: needed(g),
        home: H ? H.name : null, away: A ? A.name : null,
        playlist: PLAYLISTS[g.comp], page: page
      };
      if (known) {
        item.title = makeTitle(clean(H.short), clean(A.short), cups.title, stage);
        var lines = [
          clean(H.name) + ' - ' + clean(A.name),
          cups.desc + ' · ' + stage.desc,
          WEEKDAYS[day.getDay()] + ', ' + dateLv + ', plkst. ' + String(g.time || '').replace(':', '.') + ' · ' + clean(venue.name),
          '',
          'Rezultāts, statistika un spēles lapa:',
          page,
          '',
          'Kalendārs: ' + site + '/kalendars/',
          'Turnīra tabula: ' + site + '/' + cupPath + '/kopvertejums/',
          'Turnīra atbalstītāji: ' + site + '/' + cupPath + '/sponsori/'
        ];
        var social = [['Facebook', links.facebook], ['Instagram', links.instagram]].filter(function (x) { return x[1]; });
        if (social.length) {
          lines.push('', 'Seko mums:');
          social.forEach(function (x) { lines.push(x[0] + ': ' + x[1]); });
        }
        lines.push('', HASHTAGS[g.comp]);
        item.description = lines.map(clean).join('\n');
        if (bytes(item.description) > DESC_MAX_BYTES) throw new Error(g.id + ': description over 5000 bytes');
        item.thumb = site + '/youtube/' + g.id + '.jpg';
        var photo = photoFor(g.date);
        thumbs[g.id] = {
          cup: g.comp, seed: g.comp + g.date,
          logoSrc: CUP_LOGO[g.comp],
          stage: stage.thumb,
          weekday: WEEKDAYS[day.getDay()], date: ymd[2] + '.' + ymd[1] + '.' + ymd[0],
          time: g.time, hall: venue.name,
          cupName: (D.settings.cups[g.comp] || {}).name || cups.desc,
          home: { src: H.logo || '', initials: initials(H.short), color: H.color, name: H.short },
          away: { src: A.logo || '', initials: initials(A.short), color: A.color, name: A.short },
          photoSrc: photo ? photo.src : '', photoFocus: photo ? photo.focus : null, photoFocusX: photo ? photo.focusX : null
        };
      }
      games.push(item);
    });
    games.sort(function (x, y) { return x.start < y.start ? -1 : x.start > y.start ? 1 : 0; });
    state = { thumbs: thumbs };
    return { version: 1, generated: new Date().toISOString(), season: D.settings.season || D.season,
             site: site, games: games };
  }

  // One thumbnail as a JPEG data URL (prerender.py saves it).
  function thumb(id) {
    var s = state && state.thumbs[id];
    if (!s) return Promise.resolve(null);
    var srcs = [s.logoSrc, s.home.src, s.away.src, s.photoSrc].filter(Boolean);
    return window.Poster.prepare(srcs).then(function (imgs) {
      var img = function (src) { var i = srcs.indexOf(src); return src && i >= 0 ? imgs[i] : null; };
      var spec = {
        cup: s.cup, seed: s.seed, logo: img(s.logoSrc), stage: s.stage, weekday: s.weekday, date: s.date,
        time: s.time, hall: s.hall, cupName: s.cupName,
        home: Object.assign({}, s.home, { img: img(s.home.src) }),
        away: Object.assign({}, s.away, { img: img(s.away.src) }),
        photo: s.photoSrc && img(s.photoSrc) ? { img: img(s.photoSrc), focus: s.photoFocus, focusX: s.photoFocusX } : null
      };
      return window.Poster.renderThumb(spec).toDataURL('image/jpeg', 0.9);
    });
  }

  window.YouTubeFeed = { feed: feed, thumb: thumb };
})();
