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

Paste the new `youtube.gs` over the old one and save. Settings and triggers stay.
