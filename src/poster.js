/* Round posters for social media, drawn on a canvas in the browser.
   Follows the layout of the 2025/26 Dobele posters: darkened action photo →
   jagged edge → coloured panel with title, date + hall, stage → games
   (home · time box · away) → white sponsor band → black notice bar.

   Poster.render(spec) returns a <canvas>. spec = {
     cup: 'dbck' | 'jssc', format: 'feed' (1080×1350) | 'story' (1080×1920),
     seed, title, date, hall, stage,
     games: [{ time, home, away, tag }],
     names: every team name in the cup (the name size is set by the longest,
            so all posters of the season use the same size),
     photo: { img, focus } | null, sponsors: [{ img, w, h, scale }], notice }
   Text is passed in already; this file only knows how to draw. */
(function () {
  'use strict';

  // DIN Condensed (built into iPhones and Macs); elsewhere Barlow Condensed,
  // a free DIN-style face with all Latvian letters, served by the site (assets/fonts).
  var FONT = '"DIN Condensed", "Barlow Condensed", "Arial Narrow", sans-serif';

  // Sizes in poster pixels. The story format keeps everything inside a
  // centre column (side) because Instagram trims the edges on tall phones
  // and puts its buttons on the right.
  var FORMATS = {
    feed: {
      w: 1080, h: 1350, side: 64, photo: 384, ridge: 46, sponsorTop: 1066, bar: 54,
      title: 54, titleMin: 38, date: 35, stage: 28, team: 54, timeBox: [150, 62], row: [96, 122], headTop: 30,
      logoRows: [7, 6], logoArea: 7600, logoMax: [150, 92], logoGap: 26, notice: 25
    },
    story: {
      w: 1080, h: 1920, side: 104, photo: 500, ridge: 50, sponsorTop: 1446, bar: 62,
      title: 62, titleMin: 50, date: 39, stage: 30, team: 58, timeBox: [144, 64], row: [130, 140], headTop: 84,
      logoRows: [4, 5, 4], logoArea: 8600, logoMax: [180, 100], logoGap: 34, notice: 26,
      logoSide: 190   // sponsor logos stay well inside the edges (Reels previews crop the sides)
    }
  };

  // Colours per cup. Dobele is last season's poster; Jelgava uses its site
  // colours. The three header lines share one colour: black / white.
  var THEMES = {
    dbck: {
      panel: '#E9B716', head: '#111111',
      team: '#01509F', box: '#01509F', boxText: '#E9B716', line: '#111111', tag: '#111111'
    },
    jssc: {
      panel: '#9C213D', head: '#FFFFFF',
      team: '#FFFFFF', box: '#1E47B5', boxText: '#FFFFFF', line: 'rgba(255,255,255,0.55)', tag: '#FFFFFF'
    }
  };

  // ---------- helpers ----------
  function rng(seed) {
    var s = 0;
    for (var i = 0; i < String(seed).length; i++) s = (s * 31 + String(seed).charCodeAt(i)) >>> 0;
    s = s || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function up(t) { return String(t || '').toLocaleUpperCase('lv'); }
  function font(g, px) { g.font = '700 ' + px + 'px ' + FONT; }
  function width(g, text, px) { font(g, px); return g.measureText(text).width; }
  // Largest size ≤ px at which text fits maxW (never below min).
  function fit(g, text, px, maxW, min) {
    var w = width(g, text, px);
    return w <= maxW ? px : Math.max(min || 0, Math.floor(px * maxW / w));
  }
  function capHeight(g, px) { font(g, px); var m = g.measureText('H'); return m.actualBoundingBoxAscent || px * 0.7; }
  // Draws text vertically centred on cy (by cap height).
  function text(g, t, x, cy, px, color, align) {
    font(g, px);
    g.fillStyle = color;
    g.textAlign = align || 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(t, x, cy + capHeight(g, px) / 2);
  }
  // Splits text into two lines of similar width (at " / " first, then spaces).
  function twoLines(g, t, px) {
    var parts = t.indexOf(' / ') > 0 ? t.split(' / ').map(function (p, i, a) { return i < a.length - 1 ? p + ' /' : p; }) : t.split(' ');
    if (parts.length < 2) return [t];
    var best = null;
    for (var i = 1; i < parts.length; i++) {
      var a = parts.slice(0, i).join(' '), b = parts.slice(i).join(' ');
      var m = Math.max(width(g, a, px), width(g, b, px));
      if (!best || m < best.m) best = { m: m, lines: [a, b] };
    }
    return best.lines;
  }

  // Jagged "mountain" edge from the posters, filled downwards to yEnd.
  function ridge(g, W, yBase, amp, yEnd, color, rnd) {
    g.beginPath();
    g.moveTo(0, yEnd);
    g.lineTo(0, yBase - amp * 0.3);
    var x = 0, i = 0;
    while (x < W) {
      x = Math.min(W, x + 18 + rnd() * 46);
      var peak = i % 2 === 0;
      var h = peak ? amp * (0.2 + 0.8 * rnd() * rnd()) * (rnd() < 0.14 ? 1.7 : 1) : amp * rnd() * 0.18;
      g.lineTo(x, yBase - Math.min(h, amp * 1.7));
      i++;
    }
    g.lineTo(W, yEnd);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  function drawPhoto(g, photo, W, H, theme) {
    if (photo && photo.img) {
      var img = photo.img, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var s = Math.max(W / iw, H / ih), sw = W / s, sh = H / s;
      var focus = photo.focus == null ? 0.4 : photo.focus;
      var sx = (iw - sw) / 2, sy = Math.max(0, Math.min(ih - sh, ih * focus - sh / 2));
      g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      g.fillStyle = 'rgba(8, 10, 16, 0.55)';
      g.fillRect(0, 0, W, H);
      return;
    }
    // No photos yet: dark court-coloured background with a centre circle.
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0E1424'); gr.addColorStop(1, theme.box);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 6;
    g.beginPath(); g.arc(W / 2, H * 0.62, H * 0.38, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, H * 0.62); g.lineTo(W, H * 0.62); g.stroke();
  }

  // Logos sized to the same visual area, laid out in centred rows.
  function logoBox(l, F, k) {
    var r = l.w / l.h, h = Math.sqrt(F.logoArea / r) * (l.scale || 1), w = h * r;
    if (h > F.logoMax[1]) { h = F.logoMax[1]; w = h * r; }
    if (w > F.logoMax[0]) { w = F.logoMax[0]; h = w / r; }
    return { w: w * k, h: h * k };
  }
  function drawSponsors(g, list, F, top, bottom) {
    if (!list.length) return;
    var rows = [], i = 0;
    F.logoRows.forEach(function (n) { if (i < list.length) { rows.push(list.slice(i, i + n)); i += n; } });
    if (i < list.length) rows[rows.length - 1] = rows[rows.length - 1].concat(list.slice(i));
    var avail = F.w - 2 * (F.logoSide || F.side) + (F.logoSide ? 0 : 40), k = 1, gapY = F.logoGap * 0.9;
    // Shrink everything until each row fits the width and all rows fit the height.
    for (var tries = 0; tries < 30; tries++) {
      var tooWide = rows.some(function (row) {
        var sum = row.reduce(function (a, l) { return a + logoBox(l, F, k).w; }, 0);
        return sum + F.logoGap * k * (row.length - 1) > avail;
      });
      var hTot = rows.reduce(function (a, row) { return a + Math.max.apply(null, row.map(function (l) { return logoBox(l, F, k).h; })); }, 0) + gapY * (rows.length - 1);
      if (!tooWide && hTot <= bottom - top) break;
      k *= 0.95;
    }
    var heights = rows.map(function (row) { return Math.max.apply(null, row.map(function (l) { return logoBox(l, F, k).h; })); });
    var total = heights.reduce(function (a, b) { return a + b; }, 0) + gapY * (rows.length - 1);
    var y = top + (bottom - top - total) / 2;
    rows.forEach(function (row, ri) {
      var boxes = row.map(function (l) { return logoBox(l, F, k); });
      var sum = boxes.reduce(function (a, b) { return a + b.w; }, 0);
      var gap = Math.min(F.logoGap * 2.2, (avail - sum) / Math.max(1, row.length - 1));
      var x = (F.w - (sum + gap * (row.length - 1))) / 2;
      row.forEach(function (l, j) {
        var b = boxes[j];
        if (l.img) g.drawImage(l.img, x, y + (heights[ri] - b.h) / 2, b.w, b.h);
        x += b.w + gap;
      });
      y += heights[ri] + gapY;
    });
  }

  // Largest size at which a name fits its column, on one line or split in two.
  function nameFit(g, name, F, maxW, rowH) {
    var single = fit(g, name, F.team, maxW, 1);
    var lines = twoLines(g, name, F.team);
    // Short names stay on one line; only long ones (sponsor names) wrap.
    if (lines.length < 2 || single >= F.team * 0.8) return single;
    var two = Math.min.apply(null, lines.map(function (l) { return fit(g, l, F.team, maxW, 1); }));
    return Math.max(single, Math.min(two, Math.floor(rowH * 0.38)));
  }
  // All names on a poster share one size (like last season's posters); long
  // names that don't fit on one line at that size wrap onto two lines.
  function teamLayout(g, name, px, maxW) {
    return width(g, name, px) <= maxW ? { lines: [name], px: px } : { lines: twoLines(g, name, px), px: px };
  }
  function drawTeam(g, t, x, cy, align, color) {
    var lh = t.px * 0.98;
    var y0 = cy - (t.lines.length - 1) * lh / 2;
    t.lines.forEach(function (l, i) { text(g, l, x, y0 + i * lh, t.px, color, align); });
  }

  // ---------- main ----------
  function render(spec) {
    var F = FORMATS[spec.format] || FORMATS.feed, T = THEMES[spec.cup] || THEMES.dbck;
    var W = F.w, H = F.h;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var rnd = rng(spec.seed || spec.date);

    // Photo, coloured panel, white sponsor band, notice bar.
    drawPhoto(g, spec.photo, W, F.photo + F.ridge, T);
    ridge(g, W, F.photo + F.ridge * 0.4, F.ridge, F.sponsorTop + 4, T.panel, rnd);
    ridge(g, W, F.sponsorTop, F.ridge * 0.75, H, '#FFFFFF', rnd);
    g.fillStyle = '#000000';
    g.fillRect(0, H - F.bar, W, F.bar);
    var notice = up(spec.notice);
    if (notice) text(g, notice, W / 2, H - F.bar / 2, fit(g, notice, F.notice, W - 40, 14), '#FFFFFF');

    // Header lines.
    var maxW = W - 2 * F.side;
    var title = up(spec.title);
    var tPx = fit(g, title, F.title, maxW, 1), tLines = [title];
    if (tPx < F.titleMin) {
      tLines = twoLines(g, title, F.title);
      tPx = Math.min.apply(null, tLines.map(function (l) { return fit(g, l, F.title, maxW, 1); }));
    }
    var sub = up([spec.date, spec.hall].filter(Boolean).join(', '));
    var sPx = fit(g, sub, F.date, maxW, 20);
    var stage = up(spec.stage);
    var tLh = tPx * 1.02;
    var headH = tLines.length * tLh + 8 + sPx;

    // Game rows fill the rest of the panel.
    var list = spec.games || [];
    var story = spec.format === 'story';
    var zoneTop = F.photo + F.ridge * 0.4 + F.headTop;      // air under the photo edge
    var zoneBottom = F.sponsorTop - F.ridge * 1.5 - 10;
    var gapHead = story ? 72 : 34;   // header (cup, date + hall) → stage label; the tall story gets more air
    var n = Math.max(1, list.length);
    // A labelled game (the Hope Cup game in a K group round) is its own section
    // at the bottom: extra space above it, no line, the label tight on top.
    var tagPx = story ? 25 : 23, secGap = story ? 40 : 26, tagGap = story ? 24 : 20;
    // Stage labels — the stage + round line above the games and the Hope Cup
    // label above its game — are as big as the date + hall line (smaller only
    // if one doesn't fit), with the same air under each.
    var stagePx = stage ? fit(g, stage, sPx, W - 2 * F.side, 14) : 0;
    var stageGap = tagGap + (story ? 12 : 10);
    var stageFixed = stage ? capHeight(g, stagePx) + stageGap + 6 : 0;
    var tagged = list.filter(function (gm) { return gm.tag; }).length;
    var tagFixed = secGap + capHeight(g, sPx) + stageGap + 10;
    // Rows use their preferred height when there is room and shrink (never
    // overflow into the sponsor band) when the panel is full.
    var rowH = Math.min(F.row[1], (zoneBottom - zoneTop - headH - gapHead - stageFixed - tagged * tagFixed) / (n - tagged * 0.2));
    rowH = Math.max(rowH, 70);
    var block = headH + gapHead + stageFixed + rowH * (list.length - tagged * 0.2) + tagged * tagFixed;
    // The story poster sits the text a bit lower (more air under the photo).
    var free = Math.max(0, zoneBottom - zoneTop - block);
    // Labelled rows end up shorter than the estimate above (the label sits
    // tight on its game); on the story that left a gap above the sponsors, so
    // hand most of it back to the layout.
    if (story) {
      var bhEst = Math.min(F.timeBox[1], rowH * 0.6);
      free += 0.6 * ((stage ? Math.max(0, (rowH - bhEst) / 2) : 0) + tagged * Math.max(0, 0.8 * rowH - bhEst));
    }
    // The story has spare height: part of it goes above the header, more of it
    // between the header and the games, so the games sit lower (closer to
    // the sponsors) and the header keeps its place under the photo.
    var extraGap = story ? free * 0.45 : 0;
    var y = zoneTop + free * (story ? 0.33 : 0.5);

    tLines.forEach(function (l, i) { text(g, l, W / 2, y + tLh * i + tPx / 2, tPx, T.head); });
    y += tLines.length * tLh + 8;
    text(g, sub, W / 2, y + sPx / 2, sPx, T.head);
    y += sPx;
    y += gapHead + extraGap;

    // The time box is one of the elements, not the biggest one.
    var bw = F.timeBox[0], bh = Math.min(F.timeBox[1], rowH * 0.6);
    var nameW = (W - bw) / 2 - F.side + (story ? 6 : 0) - 26;
    // One name size for the whole season and both cups: the longest names set
    // it (at the standard row height), not only the teams playing this round.
    var names = (spec.names || []).concat(list.map(function (gm) { return gm.home; }), list.map(function (gm) { return gm.away; }));
    var namePx = names.reduce(function (px, nm) { return Math.min(px, nameFit(g, up(nm), F, nameW, F.row[0])); }, F.team);
    namePx = Math.max(namePx, 24);
    var timePx = Math.min(Math.round(bh * 0.66), Math.round(namePx * 1.05));

    function drawGame(gm, cy, home, away) {
      g.fillStyle = T.box;
      g.fillRect(W / 2 - bw / 2, cy - bh / 2, bw, bh);
      var tm = String(gm.time || '');
      text(g, tm, W / 2, cy, fit(g, tm, timePx, bw - 24, 20), T.boxText);   // digits ≈ name size
      drawTeam(g, home, W / 2 - bw / 2 - 26, cy, 'right', T.team);
      drawTeam(g, away, W / 2 + bw / 2 + 26, cy, 'left', T.team);
    }
    var top = y;
    list.forEach(function (gm, i) {
      var home = teamLayout(g, up(gm.home), namePx, nameW), away = teamLayout(g, up(gm.away), namePx, nameW);
      // Half the visible height of this row's content (time box or names).
      var lines = Math.max(home.lines.length, away.lines.length);
      var half = Math.max(bh, (lines - 1) * namePx * 0.98 + capHeight(g, namePx)) / 2;
      if (i === 0 && stage && !gm.tag) {
        text(g, stage, W / 2, top + capHeight(g, stagePx) / 2, stagePx, T.tag);
        var cy0 = top + capHeight(g, stagePx) + stageGap + half;
        drawGame(gm, cy0, home, away);
        top = cy0 + rowH / 2;
        return;
      }
      if (gm.tag) {
        var tag = up(gm.tag), tPxTag = fit(g, tag, sPx, W - 2 * F.side, 14);
        top += secGap;
        text(g, tag, W / 2, top + capHeight(g, tPxTag) / 2, tPxTag, T.tag);
        var cyTag = top + capHeight(g, tPxTag) + stageGap + half;
        drawGame(gm, cyTag, home, away);
        top = cyTag + half + 10;
        return;
      }
      if (i > 0) {
        g.fillStyle = T.line;
        g.fillRect(W * 0.15, top - 1.5, W * 0.7, 3);
      }
      drawGame(gm, top + rowH / 2, home, away);
      top += rowH;
    });

    // Sponsors inside the white band (below its jagged edge).
    drawSponsors(g, spec.sponsors || [], F, F.sponsorTop + 30, H - F.bar - 30);
    return c;
  }

  // ---------- results poster ----------
  // Last season's results poster: the whole photo under a see-through cup
  // tint (gold for Dobele, red for Jelgava). Header: cup logo in the top-right
  // corner, title + date of the games (+ optional rule line) centred.
  // Then one row per game: home logo · score · away logo (no names), white
  // sponsor band and notice. The compact header leaves room for big logos.
  //
  // spec = { cup, format, seed, logo: img, title, sub, rule,
  //          games: [{ home: crest, away: crest, hs, as, info, tag }],
  //          photo, sponsors, notice }   crest = { img } or { initials, color }
  var TINTS = { dbck: 'rgb(233, 183, 22)', jssc: 'rgb(222, 70, 92)' };
  var RES = {
    // logo: [top, size, right margin] — the cup logo in the top-right corner.
    // headMid: vertical centre of the title + date (the story keeps them below
    // Instagram's name bar).
    // sideX: where the team logos sit (share of the width); 'near' = right
    // next to the score instead (feed).
    feed: { logo: [52, 150, 64], headMid: 167, title: 84, sub: 44, rule: 30, rowMax: 250, crest: 230, score: 124, info: 32, sideX: 'near', tag: 28 },
    story: { logo: [64, 170, 64], headMid: 261, title: 88, sub: 48, rule: 34, rowMax: 260, crest: 240, score: 130, info: 34, sideX: 0.25, tag: 31 }
  };

  var PILL = { dbck: ['#E9B716', '#111111'], jssc: ['#FFFFFF', '#9C213D'] };
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
    g.closePath(); g.fill();
  }
  function drawCover(g, photo, W, H) {
    var img = photo.img, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.max(W / iw, H / ih), sw = W / s, sh = H / s;
    var fy = photo.focus == null ? 0.45 : photo.focus, fx = photo.focusX == null ? 0.5 : photo.focusX;
    var sx = Math.max(0, Math.min(iw - sw, iw * fx - sw / 2));
    var sy = Math.max(0, Math.min(ih - sh, ih * fy - sh / 2));
    g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }
  // Darken, then multiply with the cup colour: the photo stays visible.
  function tint(g, cup, W, H) {
    g.fillStyle = 'rgba(0, 0, 0, 0.66)';
    g.fillRect(0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.85;
    g.fillStyle = TINTS[cup] || TINTS.dbck;
    g.fillRect(0, 0, W, H);
    g.restore();
    var gr = g.createLinearGradient(0, 0, 0, H * 0.4);   // extra shade behind the header
    gr.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H * 0.4);
  }
  function drawContain(g, img, cx, cy, size, shadow) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = size / Math.max(iw, ih), w = iw * s, h = ih * s;
    g.save();
    if (shadow) { g.shadowColor = 'rgba(0, 0, 0, 0.45)'; g.shadowBlur = 18; g.shadowOffsetY = 4; }
    g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    g.restore();
  }
  function drawCrest(g, t, cx, cy, size) {
    if (t && t.img) { drawContain(g, t.img, cx, cy, size, true); return; }
    var r = size * 0.42;   // no logo yet: round badge with initials
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.45)'; g.shadowBlur = 18;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = (t && t.color) || '#5B6478'; g.fill();
    g.restore();
    g.lineWidth = Math.max(3, size * 0.025); g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    text(g, up((t && t.initials) || '?'), cx, cy, Math.round(r * 0.8), '#FFFFFF');
  }
  // "93:95" — the winner's number in white, the loser's a little dimmer.
  function drawScore(g, hs, as, cx, cy, px) {
    var a = String(hs), b = String(as), hi = '#FFFFFF', lo = 'rgba(255, 255, 255, 0.6)';
    font(g, px);
    var wa = g.measureText(a).width, wc = g.measureText(':').width, wb = g.measureText(b).width, pad = px * 0.06;
    var x = cx - (wa + wc + wb + 2 * pad) / 2;
    text(g, a, x, cy, px, hs >= as ? hi : lo, 'left');
    text(g, ':', x + wa + pad, cy - px * 0.04, px, lo, 'left');
    text(g, b, x + wa + wc + 2 * pad, cy, px, as >= hs ? hi : lo, 'left');
  }

  function renderResults(spec) {
    var F = FORMATS[spec.format] || FORMATS.feed, R = RES[spec.format] || RES.feed;
    var W = F.w, H = F.h, story = spec.format === 'story';
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var rnd = rng(spec.seed || spec.title);

    // The photo only has to fill the part above the sponsor band (the band is
    // white), so it is zoomed out as far as it can go while still covering it.
    if (spec.photo && spec.photo.img) drawCover(g, spec.photo, W, F.sponsorTop);
    else { g.fillStyle = '#1B1A14'; g.fillRect(0, 0, W, H); }
    tint(g, spec.cup, W, H);
    ridge(g, W, F.sponsorTop, F.ridge * 0.75, H, '#FFFFFF', rnd);
    g.fillStyle = '#000000';
    g.fillRect(0, H - F.bar, W, F.bar);
    var notice = up(spec.notice);
    if (notice) text(g, notice, W / 2, H - F.bar / 2, fit(g, notice, F.notice, W - 40, 14), '#FFFFFF');

    // Header: cup logo in the top-right corner, a little see-through; title,
    // date (and rule line) centred across the poster, level with the logo.
    var logoTop = R.logo[0], logoSize = R.logo[1], logoRight = R.logo[2];
    if (spec.logo) {
      g.save(); g.globalAlpha = 0.6;
      drawContain(g, spec.logo, W - logoRight - logoSize / 2, logoTop + logoSize / 2, logoSize, true);
      g.restore();
    }
    var x0 = W / 2, maxW = W - 2 * (logoRight + (spec.logo ? logoSize + 32 : 0));
    var title = up(spec.title), tPx = fit(g, title, R.title, maxW, 36);
    var sub = up(spec.sub), sPx = sub ? fit(g, sub, R.sub, maxW, 18) : 0;
    var rule = spec.rule ? '( ' + up(spec.rule) + ' )' : '', rPx = rule ? fit(g, rule, R.rule, maxW, 16) : 0;
    var gap1 = Math.round(tPx * 0.32);                   // room for Ļ, Ņ, Ģ under the title
    var blockH = capHeight(g, tPx) + (sub ? gap1 + capHeight(g, sPx) : 0) + (rule ? 14 + capHeight(g, rPx) : 0);
    var y = R.headMid - blockH / 2;
    text(g, title, x0, y + capHeight(g, tPx) / 2, tPx, '#FFFFFF');
    y += capHeight(g, tPx);
    if (sub) {
      y += gap1;
      text(g, sub, x0, y + capHeight(g, sPx) / 2, sPx, 'rgba(255, 255, 255, 0.9)');
      y += capHeight(g, sPx);
    }
    if (rule) {
      y += 14;
      text(g, rule, x0, y + capHeight(g, rPx) / 2, rPx, 'rgba(255, 255, 255, 0.72)');
      y += capHeight(g, rPx);
    }
    y = Math.max(y, spec.logo ? logoTop + logoSize : y);

    // Games, centred in the space between the header and the sponsor band.
    var list = spec.games || [];
    var zoneTop = y + (story ? 36 : 24);
    var zoneBottom = F.sponsorTop - F.ridge * 1.5 - 10;
    var tagPx = R.tag, tagH = Math.round(tagPx * 1.55) + (story ? 22 : 16);
    var tagged = list.filter(function (gm) { return gm.tag; }).length;
    var n = Math.max(1, list.length);
    var rowH = Math.min(R.rowMax, (zoneBottom - zoneTop - tagged * tagH) / n);
    var crest = Math.min(R.crest, rowH * 0.84);
    var scorePx = Math.min(R.score, Math.round(rowH * 0.5));
    // Team logos: either at fixed points across the width, or ('near') right
    // next to the widest usual score, so logos and score read as one unit.
    var sideD = R.sideX === 'near'
      ? Math.min(W / 2 - F.side - crest / 2, width(g, '88:88', scorePx) / 2 + crest * 0.34 + crest / 2)
      : W * (0.5 - R.sideX);
    var infoPx = Math.min(R.info, Math.round(rowH * 0.17));
    var top = zoneTop + Math.max(0, (zoneBottom - zoneTop - rowH * list.length - tagged * tagH) / 2);
    list.forEach(function (gm) {
      if (gm.tag) {
        // Stage label in a pill (cup colour) above each round's games.
        var tag = up(gm.tag), px = fit(g, tag, tagPx, W * 0.6, 14);
        var tw = width(g, tag, px) + px * 1.4, th = Math.round(px * 1.55), ty = top + (tagH - th) / 2;
        g.fillStyle = PILL[spec.cup] ? PILL[spec.cup][0] : PILL.dbck[0];
        roundRect(g, W / 2 - tw / 2, ty, tw, th, th / 2);
        text(g, tag, W / 2, ty + th / 2, px, PILL[spec.cup] ? PILL[spec.cup][1] : PILL.dbck[1]);
        top += tagH;
      }
      var cy = top + rowH / 2;
      drawCrest(g, gm.home, W / 2 - sideD, cy, crest);
      drawCrest(g, gm.away, W / 2 + sideD, cy, crest);
      var info = up(gm.info);
      var sCy = info ? cy - infoPx * 0.75 : cy;
      drawScore(g, gm.hs, gm.as, W / 2, sCy, scorePx);
      if (info) text(g, info, W / 2, sCy + capHeight(g, scorePx) / 2 + infoPx * 1.05, fit(g, info, infoPx, 2 * sideD - crest * 0.9, 14), 'rgba(255, 255, 255, 0.78)');
      top += rowH;
    });

    drawSponsors(g, spec.sponsors || [], F, F.sponsorTop + 30, H - F.bar - 30);
    return c;
  }

  // ---------- loading ----------
  var cache = {};
  function loadImage(src) {
    if (!cache[src]) {
      cache[src] = new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = src;
      });
    }
    return cache[src];
  }
  // Waits for the poster font (incl. Latvian letters) and the given images.
  function prepare(srcs) {
    var fonts = document.fonts && document.fonts.load
      ? document.fonts.load('700 60px "Barlow Condensed"', 'ĀČĒĢĪĶĻŅŠŪŽāčēģīķļņšūž0123456789:/').catch(function () { return []; })
      : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 4000); });
    return Promise.all([Promise.race([fonts, timeout])].concat(srcs.map(loadImage)))
      .then(function (res) { return res.slice(1); });
  }

  window.Poster = { render: render, renderResults: renderResults, prepare: prepare, FORMATS: FORMATS };
})();
