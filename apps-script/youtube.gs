/**
 * Dobeles basketbols — YouTube streams from the season sheet.
 *
 * Lives in the season Google Sheet (Extensions → Apps Script). Every Monday at
 * 09:00 (Riga) it reads the site's YouTube feed
 *   https://dobelesbasketbols.lv/youtube/speles.json
 * and, for every game in the next 7 days, makes sure the channel has one
 * scheduled live stream with the agreed title, description, start time,
 * thumbnail (https://dobelesbasketbols.lv/youtube/<game>.jpg) and playlist.
 * The stream's link goes into Kalendārs → "YouTube saite" (the column is added
 * if missing), and a short report is emailed.
 *
 * Wording, thumbnails and playlist names come from the site (tools/youtube_feed.js),
 * so they change with a site update; this script only does the YouTube side.
 *
 * Menu "YouTube" in the sheet:
 *   Izveidot straumes tagad   – the same run as on Mondays, at once
 *   Testa straume             – one unlisted test stream (check it in OBS), then delete it
 *   Ieslēgt / Izslēgt pirmdienu palaišanu
 *
 * Safe to run again at any time: a game that already has a stream is updated,
 * never duplicated. Streams that are live or finished are never touched.
 * A stream is deleted only if it never went live and its game is cancelled,
 * already past, or no longer needed.
 *
 * Source: github.com/gustavs-zandersons/dobelesbasketbols-site, apps-script/youtube.gs
 */

var CONFIG = {
  FEED_URL: 'https://dobelesbasketbols.lv/youtube/speles.json',
  REPORT_EMAIL: '',                 // empty = the Google account that runs the script; several: 'a@x.lv, b@y.lv'
  DAYS_AHEAD: 7,                    // today + the next 6 days
  PRIVACY: 'public',
  CATEGORY_ID: '17',                // Sports
  LANGUAGE: 'lv',
  TIMEZONE: 'Europe/Riga',
  SHEET: 'Kalendārs',
  ID_HEADER: 'Spēles ID',
  LINK_HEADER: 'YouTube saite',
  // Leave empty: OBS picks its own stream key when the game is selected.
  // If OBS can't go live on a stream made by this script, put the name of the
  // stream key used in YouTube Studio here (e.g. "Default stream key").
  STREAM_KEY_NAME: '',
  WEEKLY_HOUR: 9
};

var DONE_STATES = ['live', 'liveStarting', 'testing', 'testStarting', 'complete', 'revoked'];
var NEVER_LIVE = ['created', 'ready'];

// ---------- menu ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('YouTube')
    .addItem('Izveidot straumes tagad (nākamās 7 dienas)', 'menuSyncNow')
    .addSeparator()
    .addItem('Testa straume (neuzskaitīta, pārbaudei OBS)', 'menuTestStream')
    .addItem('Dzēst testa straumi', 'menuDeleteTestStream')
    .addSeparator()
    .addItem('Ieslēgt pirmdienu palaišanu (09:00)', 'menuEnableWeekly')
    .addItem('Izslēgt pirmdienu palaišanu', 'menuDisableWeekly')
    .addToUi();
}

function menuSyncNow() {
  var ui = SpreadsheetApp.getUi();
  var r = syncStreams_({ manual: true });
  ui.alert('YouTube straumes', r.summary + '\n\nPilns pārskats nosūtīts uz ' + reportEmail_() + '.', ui.ButtonSet.OK);
}

function menuEnableWeekly() {
  removeWeeklyTriggers_();
  ScriptApp.newTrigger('weeklyRun').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(CONFIG.WEEKLY_HOUR).nearMinute(0).inTimezone(CONFIG.TIMEZONE).create();
  SpreadsheetApp.getUi().alert('Ieslēgts: katru pirmdienu ap ' + CONFIG.WEEKLY_HOUR + ':00 tiks izveidotas nedēļas straumes.');
}

function menuDisableWeekly() {
  var n = removeWeeklyTriggers_();
  SpreadsheetApp.getUi().alert(n ? 'Izslēgts: pirmdienu palaišana vairs nenotiks.' : 'Pirmdienu palaišana jau bija izslēgta.');
}

function removeWeeklyTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyRun') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

// The Monday trigger calls this.
function weeklyRun() {
  syncStreams_({ manual: false });
}

// ---------- the run ----------

function syncStreams_(opts) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60 * 1000)) throw new Error('Cita palaišana vēl notiek. Mēģini pēc minūtes.');
  var report = { created: [], updated: [], same: [], skipped: [], removed: [], check: [], errors: [], from: '', to: '', feedTime: '' };
  try {
    var now = new Date();
    report.from = ymd_(now);
    report.to = ymd_(new Date(now.getTime() + (CONFIG.DAYS_AHEAD - 1) * 864e5));
    var feed;
    try {
      feed = fetchFeed_();
    } catch (e) {
      report.errors.push({ game: null, text: 'Neizdevās nolasīt vietnes datus (' + CONFIG.FEED_URL + '): ' + e.message });
      return finish_(report, opts);
    }
    report.feedTime = feed.generated || '';
    var sheet = calendarSheet_();
    var props = PropertiesService.getScriptProperties();
    var byId = {};
    feed.games.forEach(function (g) { byId[g.id] = g; });

    // 1. Games in the window, and future games that already have a stream (to follow time changes).
    feed.games.forEach(function (g) {
      var inWindow = g.date >= report.from && g.date <= report.to;
      var entry = entry_(props, g.id);
      if (!inWindow && !(entry && g.date > report.to)) return;
      try { handleGame_(g, entry, inWindow, sheet, props, report); }
      catch (e) { report.errors.push({ game: g, text: errText_(e) }); }
    });

    // 2. Streams whose game is past or no longer in the site's calendar.
    //    Past and never started (e.g. a no-show) → deleted. Still in the future but
    //    gone from the calendar → only reported: deleting is for a person to decide.
    Object.keys(props.getProperties()).forEach(function (key) {
      if (key.indexOf('yt:') !== 0) return;
      var id = key.slice(3), entry = entry_(props, id), g = byId[id];
      if (!entry || entry.done) return;
      if (g && g.date >= report.from) return;           // still upcoming: handled above
      try {
        var bc = getBroadcast_(entry.b);
        if (!bc) { forget_(props, sheet, id); return; }
        var st = bc.status.lifeCycleStatus;
        var past = ymd_(new Date(bc.snippet.scheduledStartTime)) < report.from;
        if (NEVER_LIVE.indexOf(st) >= 0 && past) {
          YouTube.LiveBroadcasts.remove(entry.b);
          forget_(props, sheet, id);
          report.removed.push({ title: bc.snippet.title, why: 'spēles laiks pagājis, straume netika sākta' });
        } else if (NEVER_LIVE.indexOf(st) >= 0) {
          report.check.push({ title: bc.snippet.title, id: bc.id,
                              why: 'spēle vairs nav vietnes kalendārā (atcelta?). Ja atcelta — izdzēs straumi YouTube Studio.' });
        } else if (st === 'complete' || st === 'revoked') {
          entry.done = true;
          props.setProperty('yt:' + id, JSON.stringify(entry));
        }
      } catch (e) { report.errors.push({ game: g || { id: id }, text: errText_(e) }); }
    });
  } finally {
    lock.releaseLock();
  }
  return finish_(report, opts);
}

function handleGame_(g, entry, inWindow, sheet, props, report) {
  if (!g.teamsKnown) {
    if (inWindow) report.skipped.push({ game: g, why: 'komandas vēl nav zināmas' });
    return;
  }
  var bc = null;
  if (!entry) entry = adoptFromSheet_(g, sheet, props);   // a link typed into the sheet by hand
  if (entry) {
    bc = getBroadcast_(entry.b);
    if (!bc) { entry = null; forget_(props, sheet, g.id); }   // deleted in YouTube Studio: make a new one
  }
  if (!g.needed) {
    if (bc && NEVER_LIVE.indexOf(bc.status.lifeCycleStatus) >= 0) {
      YouTube.LiveBroadcasts.remove(bc.id);
      forget_(props, sheet, g.id);
      report.removed.push({ title: bc.snippet.title, why: 'spēle nav vajadzīga (sērija jau izšķirta)' });
    } else if (inWindow && !bc) {
      report.skipped.push({ game: g, why: 'spēle notiks tikai, ja vajadzēs (sērija vēl nav izšķirta)' });
    }
    return;
  }
  if (bc && DONE_STATES.indexOf(bc.status.lifeCycleStatus) >= 0) {
    if (inWindow) report.same.push({ game: g, id: bc.id, note: 'straume jau sākta vai beigusies — netiek mainīta' });
    return;
  }

  if (!bc) {
    bc = YouTube.LiveBroadcasts.insert({
      snippet: { title: g.title, description: g.description, scheduledStartTime: g.start },
      status: { privacyStatus: CONFIG.PRIVACY, selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: false, enableAutoStop: true, enableDvr: true, recordFromStart: true }
    }, 'snippet,status,contentDetails');
    entry = { b: bc.id };
    props.setProperty('yt:' + g.id, JSON.stringify(entry));   // saved at once: a later error never leads to a duplicate
    writeLink_(sheet, g.id, bc.id);
    setVideoDetails_(bc.id, g);
    bindStream_(bc.id);
    addToPlaylist_(g.playlist, bc.id);
    entry.p = true;
    props.setProperty('yt:' + g.id, JSON.stringify(entry));
    setThumbnail_(g, bc.id, entry);
    props.setProperty('yt:' + g.id, JSON.stringify(entry));
    report.created.push({ game: g, id: bc.id });
    return;
  }

  var changed = [];
  var sn = bc.snippet;
  if (Date.parse(sn.scheduledStartTime) !== Date.parse(g.start)) changed.push('laiks');
  if (sn.title !== g.title) changed.push('nosaukums');
  if ((sn.description || '') !== g.description) changed.push('apraksts');
  if (changed.length) {
    YouTube.LiveBroadcasts.update({ id: bc.id, snippet: { title: g.title, description: g.description, scheduledStartTime: g.start } }, 'snippet');
    setVideoDetails_(bc.id, g);
  }
  if (!entry.p) {
    addToPlaylist_(g.playlist, bc.id);
    entry.p = true;
    props.setProperty('yt:' + g.id, JSON.stringify(entry));
  }
  if (entry.t !== g.thumbVersion) { setThumbnail_(g, bc.id, entry); changed.push('attēls'); }
  props.setProperty('yt:' + g.id, JSON.stringify(entry));
  writeLink_(sheet, g.id, bc.id);
  if (changed.length) report.updated.push({ game: g, id: bc.id, note: changed.join(', ') });
  else if (inWindow) report.same.push({ game: g, id: bc.id });
}

// ---------- YouTube ----------

function getBroadcast_(id) {
  var r = YouTube.LiveBroadcasts.list('id,snippet,status,contentDetails', { id: id });
  return r.items && r.items.length ? r.items[0] : null;
}

// Category (Sports), language and tags live on the video, not the broadcast.
// Tags (agreed 28 Oct): "basketbols" plus the cup's town.
function setVideoDetails_(videoId, g) {
  var tags = ['basketbols', g.comp === 'jssc' ? 'Jelgava' : 'Dobele'];
  YouTube.Videos.update({
    id: videoId,
    snippet: { title: g.title, description: g.description, categoryId: CONFIG.CATEGORY_ID,
               defaultLanguage: CONFIG.LANGUAGE, defaultAudioLanguage: CONFIG.LANGUAGE, tags: tags }
  }, 'snippet');
}

function setThumbnail_(g, videoId, entry) {
  if (!g.thumb) return;
  var blob = UrlFetchApp.fetch(g.thumb + '?v=' + encodeURIComponent(g.thumbVersion || '')).getBlob()
    .setName(g.id + '.jpg').setContentType('image/jpeg');
  YouTube.Thumbnails.set(videoId, blob);
  entry.t = g.thumbVersion;
}

function bindStream_(broadcastId) {
  if (!CONFIG.STREAM_KEY_NAME) return;
  var cache = PropertiesService.getScriptProperties(), key = 'stream:' + CONFIG.STREAM_KEY_NAME;
  var streamId = cache.getProperty(key);
  if (!streamId) {
    var page, token = null;
    do {
      page = YouTube.LiveStreams.list('id,snippet', listArgs_(token));
      (page.items || []).forEach(function (s) { if (!streamId && s.snippet.title === CONFIG.STREAM_KEY_NAME) streamId = s.id; });
      token = page.nextPageToken;
    } while (!streamId && token);
    if (!streamId) throw new Error('Nav atrasta straumes atslēga „' + CONFIG.STREAM_KEY_NAME + '”.');
    cache.setProperty(key, streamId);
  }
  YouTube.LiveBroadcasts.bind(broadcastId, 'id,contentDetails', { streamId: streamId });
}

function listArgs_(token) {
  var a = { mine: true, maxResults: 50 };
  if (token) a.pageToken = token;
  return a;
}

function addToPlaylist_(name, videoId) {
  if (!name) return;
  var props = PropertiesService.getScriptProperties(), key = 'pl:' + name;
  var plId = props.getProperty(key);
  if (!plId) {
    var token = null, page;
    do {
      page = YouTube.Playlists.list('id,snippet', listArgs_(token));
      (page.items || []).forEach(function (p) { if (!plId && p.snippet.title === name) plId = p.id; });
      token = page.nextPageToken;
    } while (!plId && token);
    if (!plId) {
      plId = YouTube.Playlists.insert({ snippet: { title: name }, status: { privacyStatus: 'public' } }, 'snippet,status').id;
    }
    props.setProperty(key, plId);
  }
  YouTube.PlaylistItems.insert({ snippet: { playlistId: plId, resourceId: { kind: 'youtube#video', videoId: videoId } } }, 'snippet');
}

// ---------- test stream (check that OBS can use a stream made by the script) ----------

function menuTestStream() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var old = props.getProperty('test');
  if (old && getBroadcast_(old)) {
    ui.alert('Testa straume jau ir: https://www.youtube.com/watch?v=' + old + '\n\nVispirms izdzēs to (YouTube → Dzēst testa straumi).');
    return;
  }
  var feed = fetchFeed_();
  var g = feed.games.filter(function (x) { return x.teamsKnown && x.thumb; })[0];
  if (!g) { ui.alert('Vietnes datos nav nevienas spēles ar zināmām komandām.'); return; }
  var start = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  var title = ('TESTS (dzēst) — ' + g.title).slice(0, 100);
  var bc = YouTube.LiveBroadcasts.insert({
    snippet: { title: title, description: 'Testa straume. Tiks izdzēsta.\n\n' + g.description, scheduledStartTime: start },
    status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    contentDetails: { enableAutoStart: false, enableAutoStop: true, enableDvr: true, recordFromStart: true }
  }, 'snippet,status,contentDetails');
  bindStream_(bc.id);
  setThumbnail_(g, bc.id, {});
  props.setProperty('test', bc.id);
  var check = getBroadcast_(bc.id);
  var locked = check && check.status.privacyStatus !== 'unlisted'
    ? '\n\n⚠ YouTube to iestatīja kā „' + check.status.privacyStatus + '”, nevis „unlisted”. Pastāsti Claude.' : '';
  ui.alert('Testa straume izveidota (neuzskaitīta, ar ' + g.id + ' attēlu):\nhttps://www.youtube.com/watch?v=' + bc.id +
           '\n\nOBS: Pārvaldīt tiešraidi → izvēlies „' + title + '” → sāc straumēt uz minūti → beidz.' +
           '\nPēc tam: YouTube → Dzēst testa straumi.' + locked);
}

function menuDeleteTestStream() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var id = props.getProperty('test');
  if (!id) { ui.alert('Testa straumes nav.'); return; }
  try { YouTube.LiveBroadcasts.remove(id); } catch (e) { /* already gone */ }
  props.deleteProperty('test');
  ui.alert('Testa straume izdzēsta.');
}

// ---------- sheet ----------

function calendarSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET);
  if (!sh) throw new Error('Nav lapas „' + CONFIG.SHEET + '”.');
  var lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var idCol = head.indexOf(CONFIG.ID_HEADER) + 1;
  if (!idCol) throw new Error('Lapā „' + CONFIG.SHEET + '” nav kolonnas „' + CONFIG.ID_HEADER + '”.');
  var linkCol = head.indexOf(CONFIG.LINK_HEADER) + 1;
  if (!linkCol) {
    linkCol = lastCol + 1;
    sh.getRange(1, linkCol).setValue(CONFIG.LINK_HEADER).setFontWeight('bold');
  }
  var rows = {};
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    sh.getRange(2, idCol, n, 1).getValues().forEach(function (r, i) {
      var id = String(r[0]).trim().toLowerCase();
      if (id) rows[id] = i + 2;
    });
  }
  return { sh: sh, rows: rows, linkCol: linkCol };
}

function writeLink_(sheet, gameId, videoId) {
  var row = sheet.rows[gameId];
  if (!row) return;
  var url = videoId ? 'https://www.youtube.com/watch?v=' + videoId : '';
  var cell = sheet.sh.getRange(row, sheet.linkCol);
  if (cell.getValue() !== url) cell.setValue(url);
}

function adoptFromSheet_(g, sheet, props) {
  var row = sheet.rows[g.id];
  if (!row) return null;
  var m = /(?:v=|youtu\.be\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(String(sheet.sh.getRange(row, sheet.linkCol).getValue()));
  if (!m) return null;
  var entry = { b: m[1] };
  props.setProperty('yt:' + g.id, JSON.stringify(entry));
  return entry;
}

function forget_(props, sheet, gameId) {
  props.deleteProperty('yt:' + gameId);
  writeLink_(sheet, gameId, '');
}

function entry_(props, gameId) {
  var v = props.getProperty('yt:' + gameId);
  return v ? JSON.parse(v) : null;
}

// ---------- feed, dates, report ----------

function fetchFeed_() {
  var res = UrlFetchApp.fetch(CONFIG.FEED_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
  var feed = JSON.parse(res.getContentText('UTF-8'));
  if (!feed || !feed.games) throw new Error('nav spēļu saraksta');
  return feed;
}

function reportEmail_() { return CONFIG.REPORT_EMAIL || Session.getEffectiveUser().getEmail(); }

function ymd_(d) { return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'); }

function when_(g) {
  var p = g.date.split('-');
  return p[2] + '.' + p[1] + '. ' + g.time;
}

function errText_(e) {
  var m = String(e && e.message || e);
  if (/quota/i.test(m)) m += ' (YouTube dienas limits — mēģini rīt)';
  return m;
}

function finish_(report, opts) {
  var link = function (id) { return 'https://www.youtube.com/watch?v=' + id; };
  var line = function (x) { return '– ' + (x.game ? x.game.title || (x.game.id + ' (' + when_(x.game) + ')') : x.title) + (x.game && x.game.date ? '  [' + when_(x.game) + ']' : ''); };
  var out = [];
  var range = report.from.split('-').reverse().join('.') + '–' + report.to.split('-').reverse().join('.');
  out.push((opts.manual ? 'Palaists ar roku' : 'Pirmdienas palaišana') + ', spēles ' + range + '.');
  if (report.feedTime) out.push('Vietnes dati atjaunoti: ' + Utilities.formatDate(new Date(report.feedTime), CONFIG.TIMEZONE, 'dd.MM.yyyy HH:mm') + '.');
  var section = function (head, list, fn) {
    if (!list.length) return;
    out.push('', head + ' (' + list.length + '):');
    list.forEach(function (x) { out.push(fn(x)); });
  };
  section('Izveidotas', report.created, function (x) { return line(x) + '\n  ' + link(x.id); });
  section('Atjauninātas', report.updated, function (x) { return line(x) + ' — mainīts: ' + x.note + '\n  ' + link(x.id); });
  section('Bez izmaiņām', report.same, function (x) { return line(x) + (x.note ? ' — ' + x.note : ''); });
  section('Izlaistas', report.skipped, function (x) { return line(x) + ' — ' + x.why; });
  section('Noņemtas', report.removed, function (x) { return '– ' + x.title + ' — ' + x.why; });
  section('Jāpārbauda', report.check, function (x) { return '– ' + x.title + ' — ' + x.why + '\n  ' + link(x.id); });
  section('KĻŪDAS', report.errors, function (x) { return (x.game ? line(x) : '–') + '\n  ' + x.text; });
  if (!report.created.length && !report.updated.length && !report.same.length && !report.errors.length) out.push('', 'Šajā periodā nav spēļu ar zināmām komandām.');

  var counts = report.created.length + ' izveidotas, ' + report.updated.length + ' atjauninātas' +
               (report.errors.length ? ', ' + report.errors.length + ' kļūdas' : '');
  var body = out.join('\n');
  var subject = (report.errors.length ? '⚠ ' : '') + 'YouTube straumes ' + range + ': ' + counts;
  MailApp.sendEmail(reportEmail_(), subject, body);
  report.summary = counts + '.' + (report.skipped.length ? ' Izlaistas: ' + report.skipped.length + '.' : '') +
                   (report.errors.length ? '\n\nKļūdas:\n' + report.errors.map(function (x) { return x.text; }).join('\n') : '');
  return report;
}
