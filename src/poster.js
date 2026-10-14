/* Round posters for social media, drawn on a canvas in the browser.
   Follows the layout of the 2025/26 Dobele posters: darkened action photo →
   jagged edge → coloured panel with title, date + hall, stage → games
   (home · time box · away) → white sponsor band → black notice bar.

   Poster.render(spec) returns a <canvas>. spec = {
     cup: 'dbck' | 'jssc', format: 'feed' (1080×1350) | 'story' (1080×1920),
     seed, title, date, hall, stage,
     games: [{ time, home, away, tag }],
     photo: { img, focus } | null, sponsors: [{ img, w, h, scale }], notice }
   Text is passed in already; this file only knows how to draw. */
(function () {
  'use strict';

  var FONT = '"Bebas Neue", "Barlow Condensed", "Arial Narrow", sans-serif';

  // Sizes in poster pixels. The story format keeps everything inside a
  // centre column (side) because Instagram trims the edges on tall phones
  // and puts its buttons on the right.
  var FORMATS = {
    feed: {
      w: 1080, h: 1350, side: 64, photo: 400, ridge: 46, sponsorTop: 1052, bar: 54,
      title: 66, titleMin: 44, date: 40, stage: 30, team: 54, timeBox: [196, 84], row: [96, 122],
      logoRows: [7, 6], logoArea: 7600, logoMax: [150, 92], logoGap: 26, notice: 25
    },
    story: {
      w: 1080, h: 1920, side: 104, photo: 500, ridge: 50, sponsorTop: 1446, bar: 62,
      title: 66, titleMin: 52, date: 42, stage: 31, team: 58, timeBox: [176, 84], row: [112, 150],
      logoRows: [4, 5, 4], logoArea: 8600, logoMax: [180, 100], logoGap: 34, notice: 26
    }
  };

  // Colours per cup. Dobele is last season's poster; Jelgava uses its site colours.
  var THEMES = {
    dbck: {
      panel: '#E9B716', title: '#111111', sub: '#111111', stage: '#01509F',
      team: '#01509F', box: '#01509F', boxText: '#E9B716', line: '#111111', tag: '#111111'
    },
    jssc: {
      panel: '#9C213D', title: '#FFFFFF', sub: '#FFFFFF', stage: '#B7CAFF',
      team: '#FFFFFF', box: '#1E47B5', boxText: '#FFFFFF', line: 'rgba(255,255,255,0.55)', tag: '#B7CAFF'
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
  function font(g, px) { g.font = '400 ' + px + 'px ' + FONT; }
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
    var avail = F.w - 2 * F.side + 40, k = 1, gapY = F.logoGap * 0.9;
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
    return Math.max(single, Math.min(two, Math.floor(rowH * 0.44)));
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
    var stPx = stage ? fit(g, stage, F.stage, maxW, 18) : 0;
    var tLh = tPx * 1.02;
    var headH = tLines.length * tLh + 12 + sPx + (stage ? 14 + stPx : 0);

    // Game rows fill the rest of the panel, centred as one block.
    var list = spec.games || [];
    var zoneTop = F.photo + F.ridge * 0.4 + 30;
    var zoneBottom = F.sponsorTop - F.ridge * 1.5 - 10;
    var gapHead = spec.format === 'story' ? 50 : 34;
    var n = Math.max(1, list.length);
    // A row with a label (e.g. the Hope Cup game) gets an extra strip on top.
    var tagPx = spec.format === 'story' ? 25 : 23, tagExtra = tagPx + 16;
    var tagged = list.filter(function (gm) { return gm.tag; }).length;
    // Rows use their preferred height when there is room and shrink (never
    // overflow into the sponsor band) when the panel is full.
    var rowH = Math.min(F.row[1], (zoneBottom - zoneTop - headH - gapHead - tagged * tagExtra) / n);
    rowH = Math.max(rowH, 70);
    var block = headH + gapHead + rowH * list.length + tagged * tagExtra;
    var y = zoneTop + Math.max(0, (zoneBottom - zoneTop - block) / 2);

    tLines.forEach(function (l, i) { text(g, l, W / 2, y + tLh * i + tPx / 2, tPx, T.title); });
    y += tLines.length * tLh + 12;
    text(g, sub, W / 2, y + sPx / 2, sPx, T.sub);
    y += sPx;
    if (stage) { y += 14; text(g, stage, W / 2, y + stPx / 2, stPx, T.stage); y += stPx; }
    y += gapHead;

    var bw = F.timeBox[0], bh = Math.min(F.timeBox[1], rowH * 0.7);
    var nameW = (W - bw) / 2 - F.side + (spec.format === 'story' ? 6 : 0) - 26;
    var namePx = list.reduce(function (px, gm) {
      return Math.min(px, nameFit(g, up(gm.home), F, nameW, rowH), nameFit(g, up(gm.away), F, nameW, rowH));
    }, F.team);
    namePx = Math.max(namePx, 24);
    var top = y;
    list.forEach(function (gm, i) {
      if (i > 0) {
        g.fillStyle = T.line;
        g.fillRect(W * 0.15, top - 1.5, W * 0.7, 3);
      }
      if (gm.tag) {
        var tag = up(gm.tag);
        text(g, tag, W / 2, top + tagExtra / 2 + 6, fit(g, tag, tagPx, W - 2 * F.side, 14), T.tag);
        top += tagExtra;
      }
      var cy = top + rowH / 2;
      // time box
      g.fillStyle = T.box;
      g.fillRect(W / 2 - bw / 2, cy - bh / 2, bw, bh);
      var tm = String(gm.time || '');
      text(g, tm, W / 2, cy, fit(g, tm, Math.round(bh * 0.8), bw - 24, 20), T.boxText);
      // teams
      drawTeam(g, teamLayout(g, up(gm.home), namePx, nameW), W / 2 - bw / 2 - 26, cy, 'right', T.team);
      drawTeam(g, teamLayout(g, up(gm.away), namePx, nameW), W / 2 + bw / 2 + 26, cy, 'left', T.team);
      top += rowH;
    });

    // Sponsors inside the white band (below its jagged edge).
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
      ? document.fonts.load('400 60px "Bebas Neue"', 'ĀČĒĢĪĶĻŅŠŪŽāčēģīķļņšūž0123456789:/').catch(function () { return []; })
      : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 4000); });
    return Promise.all([Promise.race([fonts, timeout])].concat(srcs.map(loadImage)))
      .then(function (res) { return res.slice(1); });
  }

  window.Poster = { render: render, prepare: prepare, FORMATS: FORMATS };
})();
