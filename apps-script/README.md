# Season sheet scripts

Two files run inside the season Google Sheet (Extensions → Apps Script), in one
Apps Script project, each with its own menu in the sheet:

| File in this folder | File in Apps Script | Menu | What it does |
|---|---|---|---|
| `site.gs` | `site` | Mājaslapa | starts the site's data refresh on a timer and on request |
| `youtube.gs` | `Code` | YouTube | creates the week's YouTube live streams every Monday |

`appsscript.json` is the project's manifest (YouTube service, Riga time zone).

# Site refresh from the season sheet

The refresh itself is the GitHub workflow **Atjaunot datus no tabulas**
(`.github/workflows/sync.yml`): it reads the sheet and basket.lv, builds the site
and publishes it. `site.gs` only starts it, the same as pressing **Run workflow**
on GitHub. GitHub's own timer skips most of its 15-minute slots (on 1 and 8 Nov
2026 it started 14 and 13 of the 37 Sunday runs, and the weekday 12:00 run came
28–56 minutes late); a run started this way begins within seconds.

## When

Riga time, so the switch to summer time needs no change:

| Day | Refresh |
|---|---|
| Sunday (game day) | every 15 minutes, 09:00–18:00 |
| Other days | once, at the first check after 12:00 |

A Google timer calls the script every 15 minutes; outside those times it stops
straight away. Google's timer can start a few minutes off the quarter-hour. The
times are `SITE` at the top of `site.gs` (`GAME_DAYS`, `GAME_FROM`, `GAME_TO`,
`DAILY_AT`); after changing them, paste and save: the timer stays.

GitHub's own timer in `sync.yml` stays as a backup, once a day at 20:47 Riga
winter time, in case the sheet's timer ever stops.

## Menu "Mājaslapa"

| Item | What it does |
|---|---|
| Atjaunot mājaslapu tagad | starts a refresh now; the site has the changes in 2–3 minutes. Any organiser can use it. |
| Ieslēgt automātisko atjaunošanu | starts one refresh straight away (which also checks the token) and switches the timer on |
| Izslēgt automātisko atjaunošanu | switches it off (whoever switched it on) |
| Iestatīt GitHub atslēgu… | saves the GitHub token after checking that GitHub accepts it |
| Statuss | on/off and by whom, last automatic start, any problem, token's last 4 characters |

The timer runs as the Google account that switched it on, and the emails go to
that account (`SITE.REPORT_EMAIL` to change). Switching it on from another
account asks first, then takes it over; the old account's timer does nothing.

## Emails

- **⚠ Mājaslapas atjaunošana netiek palaista** — GitHub refused to start a
  refresh. Refusals about the token (expired, no permission) are emailed at
  once; a GitHub outage only if it lasts 45 minutes. While it lasts, at most one
  email every 6 hours. The script keeps trying at every check.
- **Mājaslapas atjaunošana atkal darbojas** — after such an email, once it works again.
- A refresh that starts but finds errors in the sheet: GitHub's own email, as before.

## The GitHub token

A fine-grained personal access token that can do one thing: start, stop or
re-run this repository's workflows. It can't change the site's code, see the
repository's secrets or read the sheet. It is kept in the script's properties
(Apps Script → Project Settings → Script Properties, `site:token`), where people
who can edit the sheet can see it.

## Install (once, ~10 minutes)

**1. The token** (GitHub account that owns the repository)

1. github.com → your picture (top right) → **Settings** → **Developer settings**
   (bottom of the left column) → **Personal access tokens → Fine-grained tokens** →
   **Generate new token**.
2. Name: `Sezonas tabula – mājaslapas atjaunošana`. Expiration: **Custom**, a date
   about a year ahead (when it runs out the script emails you; then make a new one
   the same way).
3. Repository access: **Only select repositories** → `dobelesbasketbols-site`.
4. Permissions: add **Actions** and set it to **Read and write**. Nothing else
   (GitHub adds Metadata: Read-only by itself).
5. **Generate token** and copy it. It starts with `github_pat_`; GitHub shows it
   only once.

**2. The script** (Google account that owns the season sheet, the same one as for YouTube)

1. Season sheet → **Extensions → Apps Script**.
2. Next to **Files** (left): **+ → Script**, name it `site`. Delete what is in it,
   paste the whole of `site.gs`, save (Ctrl/Cmd + S).
3. Open `Code.gs`, delete everything, paste the whole of `youtube.gs` (it now also
   adds the Mājaslapa menu), save.
4. Reload the sheet. A **Mājaslapa** menu appears next to YouTube.
5. **Mājaslapa → Iestatīt GitHub atslēgu…** → paste the token → OK. If Google asks
   for permission, allow it the same way as for the YouTube script.
6. **Mājaslapa → Ieslēgt automātisko atjaunošanu**. On GitHub, Actions shows a new
   run of **Atjaunot datus no tabulas** within seconds.

**When the token runs out:** make a new one (step 1) → **Mājaslapa → Iestatīt
GitHub atslēgu…**. Nothing else changes.

# YouTube streams from the season sheet

`youtube.gs` runs inside the season Google Sheet (Extensions → Apps Script). Every
Monday at 09:00 (Riga) it creates the coming week's YouTube live streams, one per
game, from the site's feed:

- `https://dobelesbasketbols.lv/youtube/speles.json` — every game not played yet:
  start time, title, description, playlist, thumbnail address, whether both teams
  are known and whether the game is needed. Built by `tools/youtube_feed.js` during
  the site build (`tools/prerender.py`), so it uses the same data and engine as the site.
- `https://dobelesbasketbols.lv/youtube/<game id>.jpg` — 1280×720 thumbnail, drawn by
  `Poster.renderThumb` in `src/poster.js` (last season's TIEŠRAIDE card, reworked,
  with the posters' jagged white sponsor band).

The feed updates whenever the site updates (Atjaunot datus no tabulas). Titles,
descriptions, thumbnails and playlist names are changed in this repo, never in the sheet's script.

## What the script does

For every game in the next 7 days (and every later game that already has a stream):

| Situation | Action |
|---|---|
| Both teams known, no stream yet | Creates a scheduled stream with the settings below; thumbnail; playlist (created if missing); link into Kalendārs → **YouTube saite** |
| Stream exists, something changed on the site | Updates title, description, start time and/or thumbnail |
| Stream live or finished | Never touched |
| Teams not known yet | Skipped, listed in the report |
| "Ja vajag" game not needed (series decided) | Not created; deleted if it was created and never went live |
| Game past, stream never started (no-show) | Stream deleted, link cleared |
| Future stream whose game left the calendar | Only reported ("Jāpārbauda") — deleting is for a person |
| A link typed into YouTube saite by hand | That stream is taken over instead of creating a new one |

Stream settings (agreed with the organisers, 28 Oct 2026): **public** from the Monday
run of the game's week; **scheduled start = tip-off**; **auto-start off** (changed
30 Oct 2026): when OBS starts streaming, the stream waits in preview until the operator
clicks **Go Live** in OBS or YouTube Studio; **auto-stop on**: it ends when OBS stops
streaming. In OBS → Manage Broadcast, leave **Enable Auto-start** unticked and **Enable
Auto-stop** ticked. Streams already created are switched on the script's next run
(`CONFIG.AUTO_START` / `AUTO_STOP`);
normal latency; rewind (DVR) on; live chat on (channel default); the replay stays on
the channel at the same link; **not made for kids**; category **Sports**, language
Latvian; tags `basketbols` + `Dobele` or `Jelgava` (by cup).

Running it again is always safe: games are matched by Spēles ID (kept in the
script's properties), so nothing is duplicated. A report goes to the email of the
account that runs it (`CONFIG.REPORT_EMAIL` to change).

YouTube quota: about 200 units per new game (default limit 10,000 a day).

## Install (once, ~15 minutes)

Use the Google account that manages the YouTube channel and owns the season sheet.

1. Open the season Google Sheet → **Extensions → Apps Script**.
2. In `Code.gs`, delete everything and paste the whole of `youtube.gs`. Save (Ctrl/Cmd + S).
3. **Project Settings** (gear, left) → tick **Show "appsscript.json" manifest file in editor**.
   Back in **Editor**, open `appsscript.json`, replace everything with this folder's
   `appsscript.json`, save. (This switches on the YouTube service and sets the Riga time zone.)
4. Reload the sheet. A **YouTube** menu appears next to Help.
5. **YouTube → Testa straume**. Google asks for permission: pick the channel's account →
   "Google hasn't verified this app" → **Advanced → Go to … (unsafe)** → **Allow**
   (it's your own script). If asked to choose a channel, pick *Dobeles basketbola čempionu kauss*.
   Then run **Testa straume** again — it creates one **unlisted** test stream starting in 30 minutes.
6. In OBS: **Manage Broadcast** → select the "TESTS (dzēst)" stream → start streaming for a
   minute → stop. Then **YouTube → Dzēst testa straumi**.
7. **YouTube → Izveidot straumes tagad**: creates the next 7 days' streams. Check them in
   YouTube Studio → Content → Live, and the report email.
8. **YouTube → Ieslēgt pirmdienu palaišanu**: from now on it runs every Monday at about 09:00.

If OBS can't go live on a stream made by the script, set `CONFIG.STREAM_KEY_NAME` to the
name of the stream key used in YouTube Studio; new streams are then bound to it.

## Updating the script

Paste the new file over the old one (`youtube.gs` → `Code`, `site.gs` → `site`) and save.
Settings, the token and the timers stay.
