/**
 * Dobeles basketbols — starts the site's data refresh from the season sheet.
 *
 * Lives in the season Google Sheet (Extensions → Apps Script), as a second file
 * next to youtube.gs. The refresh itself is the GitHub workflow "Atjaunot datus
 * no tabulas" (.github/workflows/sync.yml): it reads this sheet and basket.lv,
 * builds the site and publishes it. This script only starts it, the same as
 * pressing "Run workflow" on GitHub: GitHub's own timer skips most of its
 * 15-minute slots, while a run started this way begins at once.
 *
 * When (Riga time, so the switch to summer time needs no change):
 *   game days (Sundays)   every 15 minutes, 09:00–18:00
 *   other days            once, at the first check after 12:00
 * A Google timer calls siteTick() every 15 minutes; outside those times it
 * stops straight away.
 *
 * Menu "Mājaslapa" in the sheet (onOpen in youtube.gs adds it):
 *   Atjaunot mājaslapu tagad       – start a refresh now (on the site in 2–3 minutes)
 *   Ieslēgt / Izslēgt automātisko atjaunošanu
 *   Iestatīt GitHub atslēgu        – the token that lets the script start the workflow
 *   Statuss                        – on/off, last start, problems
 *
 * The token is a GitHub fine-grained personal access token with access to this
 * one repository and one permission, Actions: Read and write (apps-script/README.md).
 * It is kept in the script's properties, where people who can edit the sheet can
 * see it; all it can do is start, stop or re-run this repository's workflows.
 *
 * If GitHub refuses to start a refresh (e.g. the token has expired), an email goes
 * to the account that switched the automatic refresh on, and another when it works
 * again. A refresh that starts but finds errors in the sheet is reported by
 * GitHub's own email, as before.
 *
 * Source: github.com/gustavs-zandersons/dobelesbasketbols-site, apps-script/site.gs
 */

var SITE = {
  REPO: 'gustavs-zandersons/dobelesbasketbols-site',
  WORKFLOW: 'sync.yml',              // "Atjaunot datus no tabulas"
  BRANCH: 'main',
  TIMEZONE: 'Europe/Riga',
  GAME_DAYS: [0],                    // 0 = Sunday, 1 = Monday … 6 = Saturday
  GAME_FROM: '09:00',                // game days: every EVERY_MINUTES from GAME_FROM …
  GAME_TO: '18:00',                  // … the last one starts at about GAME_TO
  DAILY_AT: '12:00',                 // other days: once, at the first check after this
  EVERY_MINUTES: 15,                 // Google allows 1, 5, 10, 15 or 30
  REPORT_EMAIL: ''                   // empty = the account that switched it on; several: 'a@x.lv, b@y.lv'
};

// Script properties used here (youtube.gs uses 'yt:', 'pl:', 'stream:' and 'test').
var SITE_KEY = { token: 'site:token', auto: 'site:auto', last: 'site:last', day: 'site:day', fail: 'site:fail' };

var SITE_DAY_NAMES = ['svētdienās', 'pirmdienās', 'otrdienās', 'trešdienās', 'ceturtdienās', 'piektdienās', 'sestdienās'];

// ---------- menu ----------

function siteMenu_() {
  SpreadsheetApp.getUi().createMenu('Mājaslapa')
    .addItem('Atjaunot mājaslapu tagad', 'menuSiteRefresh')
    .addSeparator()
    .addItem('Ieslēgt automātisko atjaunošanu', 'menuSiteAutoOn')
    .addItem('Izslēgt automātisko atjaunošanu', 'menuSiteAutoOff')
    .addSeparator()
    .addItem('Iestatīt GitHub atslēgu…', 'menuSiteToken')
    .addItem('Statuss', 'menuSiteStatus')
    .addToUi();
}

function menuSiteRefresh() {
  var ui = SpreadsheetApp.getUi();
  var r = siteStart_();
  if (!r.ok) { ui.alert('Neizdevās palaist atjaunošanu', r.text, ui.ButtonSet.OK); return; }
  ui.alert('Atjaunošana palaista', 'Pēc 2–3 minūtēm izmaiņas būs mājaslapā.\n\nGaita GitHub: ' + siteRunsUrl_(), ui.ButtonSet.OK);
}

function menuSiteAutoOn() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  if (!props.getProperty(SITE_KEY.token)) {
    ui.alert('Vispirms ievadi GitHub atslēgu: Mājaslapa → Iestatīt GitHub atslēgu.');
    return;
  }
  var me = siteMe_(), auto = siteJson_(props.getProperty(SITE_KEY.auto));
  if (auto && auto.on && auto.by && me && auto.by !== me) {
    var answer = ui.alert('Automātiskā atjaunošana jau ir ieslēgta',
      'To ieslēdza ' + auto.by + '. Pārņemt to uz šo kontu (' + me + ')?', ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }
  // A first refresh now: it also checks that the token may start the workflow.
  var r = siteStart_();
  if (!r.ok) { ui.alert('Neizdevās palaist atjaunošanu', r.text + '\n\nAutomātiskā atjaunošana netika ieslēgta.', ui.ButtonSet.OK); return; }
  siteRemoveTriggers_();
  ScriptApp.newTrigger('siteTick').timeBased().everyMinutes(SITE.EVERY_MINUTES).create();
  var now = siteNow_();
  props.setProperty(SITE_KEY.auto, JSON.stringify({ on: true, by: me, since: now.ms }));
  props.setProperty(SITE_KEY.last, JSON.stringify({ at: now.ms, ok: true }));
  if (!siteGameDay_(now) && now.min >= siteMin_(SITE.DAILY_AT)) props.setProperty(SITE_KEY.day, now.date);
  props.deleteProperty(SITE_KEY.fail);
  ui.alert('Ieslēgts',
    'Mājaslapa tiks atjaunota automātiski: ' + siteScheduleText_() + ' (Rīgas laiks).\n\n' +
    'Pirmā atjaunošana palaista tagad. Gaita GitHub: ' + siteRunsUrl_() + '\n\n' +
    'Ja GitHub kādreiz atteiks to palaist, uz ' + siteMailTo_(me) + ' atnāks e-pasts.', ui.ButtonSet.OK);
}

function menuSiteAutoOff() {
  var props = PropertiesService.getScriptProperties();
  var auto = siteJson_(props.getProperty(SITE_KEY.auto));
  var wasOn = !!(auto && auto.on);
  // The flag stops the timer whoever owns it; this account's own timer is removed too.
  props.setProperty(SITE_KEY.auto, JSON.stringify({ on: false, by: siteMe_(), since: Date.now() }));
  props.deleteProperty(SITE_KEY.fail);
  siteRemoveTriggers_();
  SpreadsheetApp.getUi().alert(wasOn
    ? 'Izslēgts. Mājaslapu joprojām var atjaunot ar roku: Mājaslapa → Atjaunot mājaslapu tagad.'
    : 'Automātiskā atjaunošana jau bija izslēgta.');
}

function menuSiteToken() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var res = ui.prompt('GitHub atslēga',
    'Ielīmē GitHub atslēgu (sākas ar github_pat_). Kā to izveidot: apps-script/README.md repozitorijā ' + SITE.REPO + '.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').replace(/\s+/g, '');
  if (!token) { ui.alert('Atslēga netika ievadīta. Nekas nav mainīts.'); return; }
  var r = siteCheckToken_(token);
  if (!r.ok) { ui.alert('Atslēga netika saglabāta', r.text, ui.ButtonSet.OK); return; }
  props.setProperty(SITE_KEY.token, token);
  var auto = siteJson_(props.getProperty(SITE_KEY.auto));
  ui.alert('Atslēga saglabāta (…' + token.slice(-4) + ').' +
    (auto && auto.on ? '' : '\n\nTagad: Mājaslapa → Ieslēgt automātisko atjaunošanu.'));
}

function menuSiteStatus() {
  var props = PropertiesService.getScriptProperties();
  var auto = siteJson_(props.getProperty(SITE_KEY.auto));
  var last = siteJson_(props.getProperty(SITE_KEY.last));
  var fail = siteJson_(props.getProperty(SITE_KEY.fail));
  var token = props.getProperty(SITE_KEY.token);
  var me = siteMe_(), out = [];
  if (auto && auto.on) {
    out.push('Automātiskā atjaunošana: IESLĒGTA (' + (auto.by || '?') + ', kopš ' + siteFmt_(auto.since) + ').');
    out.push('Grafiks: ' + siteScheduleText_() + ' (Rīgas laiks).');
    if (auto.by && me && auto.by === me && !siteOwnTriggers_().length) {
      out.push('⚠ Šim kontam nav taimera. Izslēdz un ieslēdz automātisko atjaunošanu vēlreiz.');
    }
  } else {
    out.push('Automātiskā atjaunošana: izslēgta.');
  }
  if (last) out.push('Pēdējā automātiskā palaišana: ' + siteFmt_(last.at) +
                     (last.ok ? ' — palaista.' : ' — neizdevās' + (fail ? ' (sk. zemāk).' : ': ' + last.text)));
  if (fail) out.push('', '⚠ Problēma kopš ' + siteFmt_(fail.since) + ': ' + fail.text);
  out.push('', 'GitHub atslēga: ' + (token ? 'ievadīta (…' + token.slice(-4) + ').' : 'nav ievadīta.'));
  out.push('Gaita GitHub: ' + siteRunsUrl_());
  var ui = SpreadsheetApp.getUi();
  ui.alert('Mājaslapas atjaunošana', out.join('\n'), ui.ButtonSet.OK);
}

// ---------- the timer ----------

// The Google timer calls this every EVERY_MINUTES minutes.
function siteTick() {
  var props = PropertiesService.getScriptProperties();
  var auto = siteJson_(props.getProperty(SITE_KEY.auto));
  if (!auto || !auto.on) return;
  var me = siteMe_();
  if (auto.by && me && auto.by !== me) return;     // an old timer of another account: the current owner's runs
  var now = siteNow_();
  var last = siteJson_(props.getProperty(SITE_KEY.last)) || {};
  if (!siteDue_(now, last, props.getProperty(SITE_KEY.day))) return;
  var r = siteStart_();
  props.setProperty(SITE_KEY.last, JSON.stringify({ at: now.ms, ok: r.ok, text: r.text || '' }));
  if (r.ok && !siteGameDay_(now)) props.setProperty(SITE_KEY.day, now.date);
  siteTrack_(props, r, auto, now);
}

// Is a refresh due at `now`? Game days: from GAME_FROM until the check that
// falls in GAME_TO's slot. Other days: the first check after DAILY_AT, once
// (a failed start is tried again at the next check).
function siteDue_(now, last, lastDay) {
  if (last.ok && now.ms - last.at < SITE.EVERY_MINUTES * 60000 / 3) return false;   // two checks close together
  if (siteGameDay_(now)) {
    return now.min >= siteMin_(SITE.GAME_FROM) && now.min < siteMin_(SITE.GAME_TO) + SITE.EVERY_MINUTES;
  }
  return now.min >= siteMin_(SITE.DAILY_AT) && lastDay !== now.date;
}

// Emails about automatic starts that fail: a clear refusal (token, permission) at
// once, a GitHub outage only after 45 minutes; then at most every 6 hours while it
// lasts, and once when it works again.
function siteTrack_(props, r, auto, now) {
  var fail = siteJson_(props.getProperty(SITE_KEY.fail));
  if (r.ok) {
    if (!fail) return;
    props.deleteProperty(SITE_KEY.fail);
    if (fail.mailed) {
      siteMail_(auto, 'Mājaslapas atjaunošana atkal darbojas',
        'Automātiskā mājaslapas atjaunošana atkal tiek palaista (' + siteFmt_(now.ms) + ').\n\n' +
        'Iepriekšējā problēma (kopš ' + siteFmt_(fail.since) + '): ' + fail.text);
    }
    return;
  }
  if (!fail) fail = { since: now.ms, mailed: 0 };
  fail.text = r.text;
  var mailNow = (!r.transient || now.ms - fail.since >= 45 * 60000) &&
                (!fail.mailed || now.ms - fail.mailed >= 6 * 3600000);
  if (mailNow) {
    siteMail_(auto, '⚠ Mājaslapas atjaunošana netiek palaista',
      'Sezonas tabulas skripts automātiski palaiž mājaslapas atjaunošanu, bet GitHub to atteica.\n\n' +
      'Problēma: ' + r.text + '\n' +
      'Kopš: ' + siteFmt_(fail.since) + '\n\n' +
      'Kamēr tas nav salabots, mājaslapu var atjaunot ar roku GitHub: ' + siteRunsUrl_() + ' → Run workflow.\n' +
      'Tabulā: Mājaslapa → Statuss rāda pašreizējo stāvokli. Kad tas darbosies atkal, atnāks vēl viens e-pasts.');
    fail.mailed = now.ms;
  }
  props.setProperty(SITE_KEY.fail, JSON.stringify(fail));
}

function siteOwnTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'siteTick'; });
}

function siteRemoveTriggers_() {
  var list = siteOwnTriggers_();
  list.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  return list.length;
}

// ---------- GitHub ----------

// Starts "Atjaunot datus no tabulas" on main. → { ok, text, transient }
function siteStart_() {
  var token = PropertiesService.getScriptProperties().getProperty(SITE_KEY.token);
  if (!token) return { ok: false, text: 'Nav ievadīta GitHub atslēga: Mājaslapa → Iestatīt GitHub atslēgu.' };
  return siteCall_('post', '/actions/workflows/' + SITE.WORKFLOW + '/dispatches', token, { ref: SITE.BRANCH });
}

// Can this token see the workflow? (Starting it is checked when the automatic refresh is switched on.)
function siteCheckToken_(token) {
  return siteCall_('get', '/actions/workflows/' + SITE.WORKFLOW, token, null);
}

function siteCall_(method, path, token, body) {
  var opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true
  };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  var res;
  try {
    res = UrlFetchApp.fetch('https://api.github.com/repos/' + SITE.REPO + path, opts);
  } catch (e) {
    return { ok: false, transient: true, text: 'Neizdevās sazināties ar GitHub: ' + (e && e.message || e) };
  }
  var code = res.getResponseCode();
  if (code >= 200 && code < 300) return { ok: true, text: '' };
  var msg = '';
  try { msg = JSON.parse(res.getContentText()).message || ''; } catch (e) { /* not JSON */ }
  return siteError_(code, msg);
}

function siteError_(code, msg) {
  var r = { ok: false, transient: false, text: '' };
  if (code === 401) {
    r.text = 'GitHub nepieņem atslēgu (HTTP 401): visticamāk, tai beidzies derīguma termiņš vai tā ir izdzēsta. ' +
             'Izveido jaunu atslēgu (apps-script/README.md) un ievadi to: Mājaslapa → Iestatīt GitHub atslēgu.';
  } else if ((code === 403 || code === 429) && /rate limit/i.test(msg)) {
    r.text = 'GitHub pieprasījumu limits (HTTP ' + code + '). Nākamā pārbaude mēģinās vēlreiz.';
    r.transient = true;
  } else if (code === 403) {
    r.text = 'Atslēgai nav atļaujas palaist atjaunošanu (HTTP 403). Tai vajag piekļuvi repozitorijam ' + SITE.REPO +
             ' un atļauju „Actions: Read and write”.';
  } else if (code === 404) {
    r.text = 'GitHub neatrod repozitoriju vai atjaunošanas darbplūsmu (HTTP 404). Pārbaudi, vai atslēgai ir piekļuve repozitorijam ' +
             SITE.REPO + '.';
  } else if (code >= 500 || code === 429) {
    r.text = 'GitHub šobrīd nav pieejams (HTTP ' + code + '). Nākamā pārbaude mēģinās vēlreiz.';
    r.transient = true;
  } else {
    r.text = 'GitHub atteica (HTTP ' + code + (msg ? ': ' + msg : '') + ').';
  }
  return r;
}

function siteRunsUrl_() { return 'https://github.com/' + SITE.REPO + '/actions/workflows/' + SITE.WORKFLOW; }

// ---------- time, text, mail ----------

// Now in Riga time: { ms, date: 'yyyy-MM-dd', min: minutes since midnight, dow: 0 = Sunday }
function siteNow_() {
  var d = new Date();
  var s = Utilities.formatDate(d, SITE.TIMEZONE, 'yyyy-MM-dd HH:mm');
  var p = s.split(/[- :]/).map(Number);
  return { ms: d.getTime(), date: s.slice(0, 10), min: p[3] * 60 + p[4],
           dow: new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() };
}

function siteGameDay_(now) { return SITE.GAME_DAYS.indexOf(now.dow) >= 0; }

function siteMin_(hhmm) { var p = hhmm.split(':'); return Number(p[0]) * 60 + Number(p[1]); }

function siteScheduleText_() {
  var game = SITE.GAME_DAYS.map(function (d) { return SITE_DAY_NAMES[d]; }).join(', ');
  return game + ' ik ' + SITE.EVERY_MINUTES + ' minūtes ' + SITE.GAME_FROM + '–' + SITE.GAME_TO +
         '; citās dienās vienreiz ap ' + SITE.DAILY_AT;
}

function siteFmt_(ms) { return Utilities.formatDate(new Date(ms), SITE.TIMEZONE, 'dd.MM.yyyy HH:mm'); }

function siteJson_(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function siteMe_() {
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function siteMailTo_(by) { return SITE.REPORT_EMAIL || by || siteMe_(); }

function siteMail_(auto, subject, body) {
  var to = siteMailTo_(auto && auto.by);
  if (to) MailApp.sendEmail(to, subject, body);
}
