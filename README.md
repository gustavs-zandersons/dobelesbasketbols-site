# Dobeles basketbols — tournament site

Public website for the 2026/27 **Dobeles Basketbola čempionu kauss** and the
**Jelgavas Sporta servisa centra Izaicinājuma kauss**: results, schedule,
calendar, standings, brackets and game box scores. Latvian only, mobile first.

> **Status: test version with made-up data.** Settings, team names, logos,
> halls and sponsors come from the season Google Sheet; every game, score,
> player and statistic is invented (demo games generated for the sheet's teams). The site uses a fixed mock
> date (5 January 2027 — Dobele K group after round 1, next round brings K group
> round 2 and the first Hope Cup semifinal; Challenge Cup after the first leg of
> the 1/8 finals). The real data sync from basket.lv comes later.

Live: https://dobelesbasketbols.lv/ (GitHub Pages, custom domain; the old
https://gustavs-zandersons.github.io/dobelesbasketbols-site/ address forwards there).
Domain: registered at SigmaNet (LU MII); DNS zone kept there with DNSSEC — A/AAAA records
to GitHub Pages, `www` CNAME to gustavs-zandersons.github.io, and the GitHub domain
verification TXT record.

## What's in it

Every page has its own address (since 26 Oct 2026), readable by search engines
and shareable:

| Page | Address |
|---|---|
| Home — Dobele cup / Jelgava cup | `/`, `/jelgava/` |
| Calendar (both cups, team filter) | `/kalendars/` |
| Kopvērtējums | `/dobele/kopvertejums/`, `/jelgava/kopvertejums/` |
| Komandas — team list / a team | `/dobele/komandas/`, `/dobele/komandas/buki/` |
| Līderi | `/dobele/lideri/` |
| Statistika — players / teams | `/dobele/statistika/`, `/dobele/statistika/komandas/` |
| Player page | `/dobele/speletaji/valauto/edgars-krumins/` |
| Game page with box score (once played) | `/speles/2026-27/dbck-gr-01/` (season + the sheet's game ID) |
| Sponsori | `/dobele/sponsori/` |

The same paths under `/jelgava/` for the Challenge Cup. Old `#…` links
(`#dobele-komanda-buki`, `#kalendars`, `#spele-…`) forward to the new addresses.

Each address is a real page in `dist/` with its content already rendered, its own
title, description, canonical address and link-preview tags (Open Graph, with
one image per cup: `assets/og/`), plus `sitemap.xml` and `robots.txt`. Player
pages enter the sitemap once the player has played in that cup; game pages once
the game has a result. In the browser the app takes over and moves between pages
without reloading.

Team pages are calculated from results and box scores per cup: record, last
five games, team averages with the cup average and rank, leaders (top three per
category, per game, at least half of the team's games), roster averages
(players matched by name — shirt numbers can change), next three games (both
cups) and all results. Player tables (team roster, game box scores) sort by any
column on click. Forfeits count in the record but not in the stats. Optional team
fields from the sheet's "Komandas" tab (`city`, `description`, `website`,
`facebook`, `instagram`, `tiktok` on each team) show only when filled.

The Dobele "K group" (the code name in `engine.js` and the data, slots K1…K8)
is shown on the site as **Playoff kvalifikācijas grupa**; its places show as
PK1…PK8. The home page of each cup has a slim season progress bar under the
title (first game → final, ticks where stages start).

On the home page, **Dalīties** next to the next round opens the round posters:
a 4:5 feed post (Facebook, Instagram) and a 9:16 Story/Reel. Phones open the
system share sheet; computers download the image. (Sharing and downloading work
on the live site, not inside the Claude preview.) This poster template is used
for the Dobele group stage and K group (incl. Hope Cup games) and the Jelgava
1/8 and 1/4 finals; semifinals and finals of both cups will get their own
template, so the button is hidden there for now. With the test date both cups
show the button; `/?demo` adds the bar to jump between season stages.

The prototype bar (jump between season stages: pre-season, group stage, K group,
playoffs, season end) is in the Claude previews of the demo season.

## How it works

- **Static site, no server.** One HTML page with styles, scripts and season data
  inlined, plus `assets/` (cup, team and sponsor logos).
- **Standings and brackets are calculated, never typed.** `src/engine.js` holds the
  tournament rules (points 2/1/0, head-to-head tiebreakers, K group carry-over,
  best-of-3 semifinals, two-leg Challenge Cup ties, projected bracket) and derives
  everything from the game results.
- **Round posters are drawn in the browser** (`src/poster.js`, canvas) from the
  round's games: last season's poster layout, a photo from the pool, the
  sponsor logos and the photo/video notice. Nothing is stored; a new round
  gives new posters automatically. Font: DIN Condensed where the device has it
  (iPhone, Mac), otherwise Barlow Condensed (free DIN-style, all Latvian letters).
  Team names use one size for the whole season, set by the longest names.
- **The season Google Sheet is where the organisers edit.** `tools/sheet_sync.py`
  reads the tabs "Iestatījumi", "Komandas", "Zāles" and "Sponsori" into
  `src/sheet.json` (+ logos from Drive links). See *Season sheet sync* below.
- **`src/sample-data.json`** is the demo season, generated by `tools/gen-season.js`
  for the sheet's teams and halls (one hall per round, at most 4 games, box scores
  that add up to each score). Until the draw is in the sheet, groups are simulated.

```
src/
  template.html      page skeleton (Latvian copy)
  styles.css         both cup themes (Dobele blue/yellow, Jelgava maroon/blue)
  engine.js          tournament rules → tables, brackets, rounds
  app.js             renders home, game, calendar and standings pages, share pop-up
  poster.js          draws the round posters (feed 1080×1350, story 1080×1920)
  sheet.json         settings, teams, halls, sponsors from the season sheet (written by sheet_sync.py)
  sample-data.json   demo season for the sheet's teams (generated)
  sponsors.json      sponsor logos with sizes, footer order (written by sheet_sync.py)
  logo-sources.json  which Drive link each downloaded logo came from (written by sheet_sync.py)
  poster-photos.json photo pool for the posters (generated)
tools/
  build.py           builds dist/ (GitHub Pages: one page per address) or a preview fragment
  prerender.py       renders every page in a headless browser for dist/ (Playwright)
  real-season.js     builds src/season.json from the sheet and basket.lv
  basket_sync.py     reads games, results, box scores and players from basket.lv
  og_images.py       draws the link-preview images (assets/og/), run by hand
  prepare_assets.py  web copies of sponsor logos, poster photos and the site's fonts
  gen-season.js      regenerates the mock season
  check.js           sanity checks run in CI
  season_sheet.py    builds the season Google Sheet template (.xlsx), prefilled from src/sheet.json
  sheet_sync.py      reads the season sheet into src/sheet.json + logos (Latvian error report)
assets/              web-optimised logos, poster photos and fonts (published)
design/sponsors/     original sponsor logo files (not published)
design/fonts/        Anton, Barlow and Barlow Condensed originals (SIL Open Font License)
.github/workflows/   pages.yml: build + deploy · sync.yml: "Atjaunot datus no tabulas"
```

## Working on it locally

```bash
python3 tools/build.py              # → dist/ (needs: pip install playwright); serve it:
python3 -m http.server 8000 --directory dist   # then open http://localhost:8000/
node tools/check.js                 # sanity checks
node tools/gen-season.js > src/sample-data.json   # regenerate the demo season
python3 tools/sheet_sync.py --file sheet.xlsx      # import a downloaded copy of the sheet
```

The sync workflow commits data to `main`, so pull before working locally.

## Sponsors and poster photos

- **Sponsors:** the list, names, order, levels, descriptions and links come from
  the sheet's "Sponsori" tab. A new or changed logo comes in through its
  "Logo (saite)" column. The footer and the posters size every logo to the same
  visual weight automatically (`scale` in `src/sponsors.json` nudges single logos).
  Originals of the first logos live in `design/sponsors/<id>.png`;
  `python3 tools/prepare_assets.py sponsors` re-makes their web copies.
- **Poster photos:** two separate pools, each shared by both cups — one for the
  next-round posters (a wide photo strip on top) and one for the results posters
  (the whole poster is the photo). Each round gets the next photo of its pool,
  the same for everyone sharing that round. Add photos with
  `python3 tools/prepare_assets.py photos --for next|results <files…>`; they are
  resized to 2000 px and listed in `src/poster-photos.json` (`use`). The results
  Story format prefers upright photos. Photos are darkened/tinted automatically.
- **Fonts:** the site serves its own fonts (`assets/fonts/*.woff2`, no Google
  Fonts): Anton for headings, Barlow for text, Barlow Condensed for labels and
  the posters. Each weight is one file with every Latvian letter, so the browser
  never builds Ā or Ē out of pieces (that is what pushed the accents to the right).
  `python3 tools/prepare_assets.py fonts` re-makes them from `design/fonts/`
  (needs `pip install fonttools brotli`).

## Season sheet sync

The organisers edit the season Google Sheet (template: `tools/season_sheet.py`).
Today the site reads four tabs:

| Tab | Used for |
|---|---|
| Iestatījumi | season, full cup names, MVP sponsor per cup, sponsors page text, footer text, the tournament's Facebook / Instagram / YouTube / TikTok (empty = no icon) |
| Komandas | 12 teams: ID, full and short name, basket.lv name(s), group (after the draw), logo link, optional city, description and links |
| Zāles | halls (the demo games use the first two) |
| Sponsori | sponsors page and footer logos |

Kalendārs, MVP and Lēmumi are not read yet (demo games until the real calendar).

**Run it:** GitHub → Actions → **Atjaunot datus no tabulas** → Run workflow. It
downloads the sheet (repository secret `SHEET_URL`: the "Publish to web" link, or
a link to a sheet shared with "Anyone with the link"), checks it, downloads new
logos, regenerates the demo games, builds and checks the site, commits the data
to `main` and starts the Pages deploy. If the sheet has errors, nothing is
committed; the run fails and its summary lists tab, row and what to fix (in
Latvian). Logos: a Google Drive file link (shared "Anyone with the link") or any
https link to a PNG/JPG/WebP; an empty cell keeps the logo the site has.

CI also builds the template from `src/sheet.json` and imports it back, so the
template and the importer can't drift apart.

## Deployment

Every push to `main` builds the site, runs the checks and publishes it to GitHub
Pages. Pull requests only build and check.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Next steps

- Sync game data (results, quarter scores, box scores) from basket.lv for both cups,
  pending LBS permission.
- Read the calendar from the sheet after the draw (then drop the demo games), then
  MVP per round and committee decisions. Scheduled sync once the season starts.
- Season-based data layout and config-driven formats, so past seasons can be archived
  under "Iepriekšējās sezonas".
