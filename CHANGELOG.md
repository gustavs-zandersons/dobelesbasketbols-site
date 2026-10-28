# Changelog

## Round 20 — YouTube streams (feed + thumbnails + sheet script)

- **YouTube feed:** every build writes `dist/youtube/speles.json` — each game not
  played yet with its start time (UTC), YouTube title and description (rules agreed
  28 Oct: `home short - away short | 2026. gada <cup> - <stage>`, game number for
  two-game ties and best-of-3 only while ≤ 100 characters; Jelgava cup as "JSSC
  Izaicinājuma kauss"; "Dobeles čempionu kauss" if still too long), playlist,
  whether both teams are known (slot codes resolved by the engine) and whether a
  "Ja vajag" game is needed. Built by `tools/youtube_feed.js` inside the
  pre-render browser, so it matches the site.
- **Thumbnails:** `dist/youtube/<game id>.jpg`, 1280×720, for every game whose
  teams are known — `Poster.renderThumb` in `src/poster.js`, last season's
  "TIEŠRAIDE" card reworked with the organisers: dark concrete background
  (`assets/youtube/fons.jpg`), the cup's vertical logo on the left
  (`assets/youtube/<cup>-vertikals.webp`, originals in `design/youtube/`),
  TIEŠRAIDE in wide spaced grey letters with the top of the Š level with the
  panel, both crests with a white "PRET" between them (no names), and "MŪS
  ATBALSTA:" with the sponsor logos straight on the dark background (kept clear
  of YouTube's bottom-right badge). A sponsor logo made for dark backgrounds goes
  in `assets/youtube/sponsors/<id>.webp`; until then the footer logo is used.
- **Team logos from the originals (whole site):** Buki, Doks, Īle, Jaunpils,
  Skandijs, Sprīdītis, Valauto and Vilki now have their original files in
  `design/teams/` (1000–3000 px; were 160 px copies from last season). The site's
  copies (`assets/teams/`, 256 px) are remade from them, so logos are sharp
  everywhere (pages, posters). `prepare_assets.py youtube` makes 600 px copies for
  the thumbnails (`assets/youtube/teams/`); crests there are sized by area, so a
  wide logo looks as big as a round one.
- **Season sheet script:** `apps-script/youtube.gs` (+ `appsscript.json`, install
  steps in `apps-script/README.md`). Creates or updates one scheduled stream per
  game for the next 7 days, sets the thumbnail and playlist, writes the link into
  Kalendārs → "YouTube saite", emails a report; menu "YouTube" in the sheet;
  Mondays 09:00 once switched on. The importer ignores the extra column.
- `check.js`: YouTube limits for every feed entry (title 1–100 characters,
  description ≤ 5000 bytes, no < or >) and a thumbnail under 2 MB for every game
  with known teams.

## Round 19 — released 28 Oct 2026: Garage Barber logo readable on white

- Garage Barber's logo keeps its white disc and transparent outside, but the
  text, garage, chair and barber poles are now black, so it shows on the white
  sponsor strip and sponsor pop-up. Same path, no sheet change.

## Round 18 — released 28 Oct 2026: new Garage Barber logo

- Garage Barber's logo replaced with the white version they sent, at the same
  path (`assets/sponsors/garage-barber.webp`), so the sheet needs no change.
  Note: it is white on transparent, so on the white sponsor strip and sponsor
  pop-up it does not show.

## Round 17 — released 27 Oct 2026: smaller cookie button

- The cookie button is 30 px (was 44 px) on every screen, with a smaller icon;
  the tappable area still reaches 44 px. On phones it sits lower: 8 px from the
  bottom and 10 px from the right edge (computers: 14 px).

## Round 16 — released 27 Oct 2026: floating cookie button

- **Cookie settings:** a small round button (44 px) with a cookie icon in the
  bottom-right corner replaces the "Sīkdatnes" footer link. It appears once the
  visitor has chosen ("Piekrist" or "Atteikties"), opens the cookie banner again
  to change the choice, hides while the banner is open, and comes back after the
  new choice (keyboard focus returns to it). Label "Sīkdatņu iestatījumi".
- `check.js`: the button is never saved in a pre-rendered page.

## Round 15 — released 27 Oct 2026: Google Analytics with a cookie banner

- **Google Analytics** (`G-G9W635957K`) on dobelesbasketbols.lv, only after
  the visitor agrees. Banner text: "Mēs izmantojam Google Analytics sīkdatnes,
  lai veidotu statistiku par tīmekļvietnes apmeklējumu. Tās saglabāsim tikai
  tad, ja piekritīsiet." Buttons "Atteikties" / "Piekrist", the same size.
- Before "Piekrist" nothing is sent to Google and no cookies are set. The
  choice is kept in the browser. **"Sīkdatnes"** in the footer opens the
  banner again; "Atteikties" switches tracking off and deletes the `_ga` cookies.
- Analytics only (ads storage denied). One page view per address, sent by the
  site itself after the page title is set — Google's own "page changes based
  on browser history events" must be off in the stream's enhanced measurement.
- Not loaded in previews, local builds or the pre-renderer; `check.js` makes
  sure no page is saved with the Google tag or the banner in it.

## Round 14 — released 27 Oct 2026: new sponsor Spēka Stacija

- **Spēka Stacija** (fitnesa studija, Dobele) joins the sponsors as
  Atbalstītājs, 15th in the order: footer, Sponsori page (with its description
  and Instagram link from the sheet) and the poster sponsor bands.
- Logo `assets/sponsors/speka-stacija.webp` (259×200, transparent), made with
  the sheet importer's own processing; original in `design/sponsors/`. The
  sheet's Sponsori row links `https://dobelesbasketbols.lv/assets/sponsors/speka-stacija.webp`
  (ID `speka-stacija`), which the importer keeps as the site's own logo.
- Sponsor data from the sheet ("Atjaunot datus no tabulas" run on this branch).

## Round 13 — released 26 Oct 2026: new Brocēni logo

- **Brocēni:** new logo — the Brocēni coat of arms (blue and silver shield
  with a white water lily), without the "BROCĒNI" lettering of the old one.
  Original in `design/teams/broceni.png`, web copy made with
  `tools/prepare_assets.py teams broceni` (256 px square, like the other
  newer logos). Shows everywhere a team logo appears: team pages, tables,
  games, calendar and posters.

## Round 12 — released 26 Oct 2026: new poster photos, Latvian accents, calendar

- **New poster photos:** 6 for the next-round posters (photo strip) and 12 for
  the results posters (full photo), shared by both cups; each with its own crop.
  Last season's photo strip and the three earlier results photos are gone.
- **Latvian accents sit on the letter again:** headings showed the bar of Ā, Ē,
  Ī, Ū pushed to the right (e.g. "IZAICINĀJUMA KAUSS"). The site now serves its
  own fonts (`assets/fonts/*.woff2`, made by `tools/prepare_assets.py fonts`)
  instead of Google Fonts: one file per weight with every Latvian letter.
  No requests to Google any more.
- **Calendar:** the cup switch is gone; the calendar always shows both cups. The
  team picker starts on "Visas komandas" every time the calendar is opened (no
  longer remembered between visits).
- **Calendar day pop-up:** logo + short team name on every screen, nothing cut
  off with "…"; places not decided yet ("A grupas 3. vieta") wrap.
- **Home page, next round:** full team names on phones too; long names wrap.
  Home – away on one line from 960px; tablets stack the two teams.

## Round 11 — released 25 Oct 2026: real addresses, open to Google

- **Every page has its own address:** `/`, `/jelgava/`, `/kalendars/`,
  `/dobele/kopvertejums/`, `/dobele/komandas/` and `/dobele/komandas/<team>/`,
  `/dobele/lideri/`, `/dobele/statistika/` and `…/statistika/komandas/`,
  `/dobele/speletaji/<team>/<player>/`, `/dobele/sponsori/`, the same under
  `/jelgava/`, and game pages `/speles/2026-27/<game id>/` (the season is in the
  address because game IDs start again every season). Old `#…` links forward.
- **Readable by search engines:** each address is a real page with its content
  already in the HTML (pre-rendered in a headless browser at build time), its own
  title and description, a canonical address, and schema.org match data on game
  pages. `sitemap.xml` (player pages once the player has played in that cup, game
  pages once played), `robots.txt`, a 404 page; the "noindex" block is gone.
- **Link previews** (Facebook, WhatsApp, Messenger): page title and description
  with one image per cup (`assets/og/dobele.png`, `jelgava.png`).
- In the browser nothing changes: the app moves between pages without reloading,
  the back button works. Previews keep one file, addresses after `#`.
- Shared styles, scripts and data are cache-busted files under `assets/`.
- Checks cover every page (title, description, canonical, preview tags, heading),
  the sitemap, robots.txt and every link between pages.

## Round 10 — released 25 Oct 2026: the real season goes live

- **Real data on the live site; test mode off.** No "Testa versija" notice, no
  made-up games or players, no fixed test date: the site uses today's date in
  Latvia. Previews keep the demo season and its stage bar.
- **Games** come from the sheet's "Kalendārs" (76 games: IDs, stages, rounds,
  pairs, slot codes) together with basket.lv. A basket.lv game is tied to its
  calendar row by cup + the two teams (slot codes such as A1, K4, W:SF1 resolved
  from the results so far) + the nearest date. basket.lv wins on date, time,
  hall, home/away, score, quarters and box scores; "Lēmumi" always win
  (no-shows 20:0, annulled results, corrections, drawing lots).
- **Players:** each cup's registered players from basket.lv (names and teams
  only — no birth dates, sizes, nationality or photos). Team pages list them
  before the first game; shirt numbers are shown per game in box scores only.
- **MVPs and monthly MVPs** from the sheet's "MVP" / "Mēneša MVP" tabs, with the
  stats from the box scores.
- **basket.lv reader** (`tools/basket_sync.py`): games, results and box scores,
  both of basket.lv's lists (Kalendārs and Rezultāti), the 2026/27 one-season
  pages, registered players.
- **Sheet importer** reads Kalendārs, MVP, Mēneša MVP and Lēmumi with Latvian
  errors per row; the template (`tools/season_sheet.py`) writes them back.
- **Update button** ("Atjaunot datus no tabulas"): reads the sheet and basket.lv
  and builds the season (`tools/real-season.js`, report in the job summary).
  Manual only for now. It can also be started on a test branch, where it saves
  the data to that branch and does not publish.
- **Game addresses** use the sheet's IDs: `#spele-dbck-gr-01`.
- Team rebounds are part of team totals (game pages, team and stats pages), as on
  basket.lv. A drawn lot ("Izloze") decides a tie that the rules leave level.

## Round 9 — released 22 Oct 2026 (PR #13)

- **New page "Statistika"** (menu, after Līderi; `#dobele-statistika`,
  `#dobele-statistika-komandas`, same for Jelgava):
  - Spēlētāji / Komandas switch; "No" / "Līdz" dates filter both views;
  - players: every player of the cup with per-game averages and shooting
    percentages, sortable by any column (starts by points per game), team filter
    and name search; the chosen sort stays when the dates change;
  - teams: record, points scored / allowed and team averages, sortable;
  - points, rebounds and assists in bold; rows open the player / team page.
- **Player pages** (`#<cup>-speletajs-<team>-<name>`): header with games, points,
  rebounds, assists and efficiency for the season; "No" / "Līdz" dates (opens on
  the whole season); 11 tiles in three groups (attack and efficiency, precision,
  defence) with a sparkline and a trend icon (zigzag up / down, green good / red
  bad, turnovers the other way round; nothing when about the same or under 3
  games); a per-game chart with the cup average for the period; the player's
  games (bold rebounds and assists, rows open the game).
- **Player names link** to the player page on Līderi, team pages (leaders,
  roster), game pages (leaders, box scores) and Statistika; not in the MVP blocks.
- **Līderi:** new "Sezonas rekordi" — best single-game points, rebounds, assists,
  3-pointers made, steals and efficiency (top 5, date links to the game).
- **Kopvērtējums:** lists of all round MVPs and monthly MVPs this season, with the
  award's sponsor (Tērvete / Jaunpils), below the running stage and above
  "Iepriekšējie posmi"; a list with no MVPs yet is not shown.
- **Menu:** white background, black text on both cups.
- **Sponsor logo:** `assets/sponsors/sporta-punkts.webp` (Sporta Punkts / PEAK,
  400×122), ready for the sheet's Sponsori tab (ID `sporta-punkts`).

## Round 8 — released 20 Oct 2026 (PR #12)

- **New page "Līderi"** (menu, after Komandas; `#dobele-lideri` / `#jelgava-lideri`):
  top five players of the whole cup, cards like the team-page leaders with team
  logo and short name. The header logos switch the cup; the cup's name is above
  the title.
  - Uzbrukums un efektivitāte: points, assists, efficiency per game.
  - Precizitāte: field goal, 2-point, 3-point and free throw percentages with
    made/attempted; at least 5 / 3 / 2 / 2 attempts per game.
  - Aizsardzība: rebounds, steals, blocks per game.
  - Dzelzs vīri: games played (with total minutes; ties by minutes) and minutes
    per game.
  - Averages and percentages count players with at least half of their team's games.
- **Category band on cards:** round MVP, team-page leaders and Līderi cards show
  the category in a band across the top — black with yellow text (Dobele), white
  with blue text (Jelgava), larger text, more room above the name.
- **Monthly MVP** (presented by Jaunpils Pienotava, each cup its own):
  - shown with the first round of a new month (after the cup's last round: the
    last month's), next to the round MVP;
  - with both MVPs, two blocks side by side on desktop (stacked on phones), each
    in the phone layout;
  - inverted colours: band in the card colour, body black + yellow (Dobele) or
    white + blue (Jelgava);
  - month averages (points, rebounds, assists) and games, from the box scores.
  - Sheet: settings "DBČK/JSSC mēneša MVP sponsors" and a "Mēneša MVP" tab (read
    from sync step 2). Demo season has a monthly MVP per cup per month.

## Round 7 — released 20 Oct 2026 (PR #11)

- **Home header:**
  - the cup logo is sized to the text: its top lines up with the top of
    "Sezona 2026/27", its bottom with the bottom of the title's last line;
  - the title size adapts so its longest line fits, the same for both cups
    (phones: three lines; wider screens: two);
  - the season bar runs the full width under the logo and the titles.
- **Season bar:** a rocket badge at the start, matching the trophy at the end.
  The rocket fills with the cup colour once the first game is played; the
  trophy once the final is played.

## Round 6 — released 20 Oct 2026 (PR #10)

- **Cup titles (home):** both cups break the same way, with the cup type on
  the second line ("Čempionu kauss" / "Izaicinājuma kauss"). They share one size
  that keeps the longer first line on one line (phones: the first line may
  wrap). There is more space between the lines for Č, Ē, Ā.
- **Previous round on phones:** cards about 83% wide, so about a fifth of the
  next card shows; thinner edge fade.
- **Calendar:**
  - opens on the current month (within the season);
  - team and cup filters keep the chosen month;
  - phones: the month grid shows logos only (no win/loss tag or score);
  - with a team selected, the month list shows date · own logo · time or score
    · opponent logo (short names below) · cup logo, without stage, round or
    win/loss tags;
  - the cup switch reads Visi · Čempionu kauss · Izaicinājuma kauss in three
    equal boxes (names wrap on phones);
  - Safari on iPhone: the team list closes after picking.
- **Results poster:**
  - cup logo in the top-right corner, 40% see-through;
  - title and date centred (lower on the 4:5);
  - darker photo;
  - team logos and scores about 1.5× larger;
  - 4:5: team logos next to the score.
- **Next-round poster:** the stage + round line and the Hope Cup label are as
  big as the date + hall line, with a little more room below.
- **Story posters (both):** sponsor logos kept 190 px from the sides, because
  Reels previews crop the edges.

## Results slider — released 20 Oct 2026 (PR #9)

- **Previous round as score cards** on both cups' home pages: stage tag, both
  teams with scores, two-leg total where it applies, time and "Statistika ›".
- **One row for the whole round.** All cards side by side when they fit (computers);
  otherwise a looping slider (phones, tablets) that drifts slowly, can be
  swiped / dragged / scrolled sideways, pauses on touch, hover and keyboard
  focus and drifts again 3 s later. No drift when the device asks for reduced motion.
- **Qualification group rounds:** no section headings; group games and the
  Hope Cup game share the row, by time. Card tags "Kvalifikācijas grupa" and
  "Cerību kauss · 1. pusfināls" (the full name stays everywhere else).
- Short team names on the cards.

## Own domain — released 20 Oct 2026 (PR #8)

- The site is at https://dobelesbasketbols.lv/ (registered at SigmaNet, DNS with
  DNSSEC there; HTTPS from GitHub Pages). The old github.io address forwards.

## Season sheet sync, step 1 — released 19 Oct 2026 (PR #7)

- **Real 2026/27 teams and sponsors from the organisers' sheet:** Lietus,
  Jelgava BJSS U19 and U17 join (new logos); Līvbērze, Auce and Bēne leave.
  Sponsor names, descriptions and links, the tournament's Facebook / Instagram /
  YouTube in the footer, short names as the organisers set them.
- **The site reads the season Google Sheet:** tabs "Iestatījumi", "Komandas",
  "Zāles" and "Sponsori" (`tools/sheet_sync.py` → `src/sheet.json`). Calendar,
  MVP and Lēmumi are not read yet.
- **Demo games for the real teams:** generated for the sheet's teams and halls;
  the real groups are used once the draw (6 + 6) is in the sheet.
- **From the settings tab:** season, full cup names (title, standings, page
  description), MVP sponsor per cup (its white logo if there is one, else the
  name), sponsors page text, footer text, and the tournament's own Facebook /
  Instagram / YouTube / TikTok icons in the footer (empty = no icon; the
  placeholder icons are gone).
- **Logos from the sheet:** a Google Drive link in "Logo (saite)" (teams and
  sponsors) is downloaded, trimmed and resized; an empty cell keeps the current
  logo. Sponsors added or removed in the sheet appear in / disappear from the
  sponsors page, footer and posters.
- **"Atjaunot datus no tabulas"** (GitHub Actions, run by hand): sheet → checks
  → build → commit → publish. Errors stop it with a Latvian list of tab, row and
  what to fix; the site stays as it was.
- **Template:** logo link columns, a check column in "Komandas", new settings
  rows, "Kā lietot" rewritten for this step (logos, publishing, the update
  button). `src/sponsor-info.json` is replaced by `src/sheet.json`.

## Round 5 — released 19 Oct 2026 (PR #6)

- **Komandas** (menu): all teams as logo tiles, alphabetical, no groups and
  no cup switch. Each tile opens the team page.
- **Team page:** back link and cup switch (Čempionu / Izaicinājuma kauss) on
  top; a highlighted block styled like the round MVP card (logo, name, group,
  table position, games / wins / losses, last five games) for the selected
  cup; then, in order: team averages as a table (value, cup average, rank;
  points, shooting, other), leaders as MVP-style
  cards with the top three per category (per game, at least half of the
  team's games), roster (name, games, points, rebounds, assists, FG %, 2P %,
  3P %, steals, blocks, efficiency per game; no shirt numbers), next three
  games in the selected cup, all results. Forfeits count in the record only.
- **Win / loss chips everywhere:** green "U", red "Z" (team pages, calendar
  with a team filter).
- **Team averages table:** columns "Komanda", "Kausa vidējais", "Vieta kausā"
  (pill "2. no 12"); no bars.
- **Leaders:** sixth card, Efektivitāte (per game).
- **Sortable player tables:** click a column in the team roster or in a game's
  box score to sort (high → low, again for low → high; names A → Ž). Totals and
  "did not play" rows stay at the bottom. The roster starts sorted by points.
- **Calendar list:** the next game day is filled gold with dark text, like
  its square in the month grid.
- **Menu:** only built pages (Sākums, Kalendārs, Kopvērtējums, Komandas,
  Sponsori); the "Drīzumā" items are gone.
- **Next-round posters:** the stage + round line moved from the header to
  just above the games, styled and spaced like the Hope Cup label.
- **Next-round card:** inside a step lighter again (blue / red).
- **Next-round Story poster:** more space between the header (cup, date +
  hall) and the stage label, and the games sit lower, using the spare height
  above the sponsors.
- **Links:** team names in the standings tables and on game pages open the
  team page.
- **Season sheet:** optional team fields in "Komandas" (town, description,
  website, Facebook, Instagram, TikTok), shown on the team page when filled.

## Round 4 — released 19 Oct 2026 (PR #5)

- **K group renamed** to "Playoff kvalifikācijas grupa" everywhere it shows:
  stage heading, legend, notes, game tags, game page, calendar, both poster
  types, demo bar. Its places show as PK1…PK8 (semifinal seeds, note); the
  slot codes in the data stay K1…K8. The table card no longer repeats the name.
- **Page titles:** more room between the small line and the big title
  (Kopvērtējums, Kalendārs, Sponsori), so Ā, Ē, Ī, Ū clear the line above.
- **Season progress bar** under the title on both cup home pages: first game
  date, final date with a trophy, filled by date, dot for today, ticks where each
  stage starts. Empty before the season, full with the trophy lit after the final.
- **Sponsori page** (menu, both cups): thank-you text, Ģenerālsponsori (3) and
  Atbalstītāji (10) as large logo tiles; a tile opens a pop-up with the logo,
  level, description and website / Facebook / Instagram / TikTok buttons (only
  the filled ones). Content from the sheet's new "Sponsori" tab
  (`src/sponsor-info.json`). Footer logos unchanged.
- **Phones:** "Dalīties" moved under the previous-round results (right) and
  under the next-round card (right, with "Viss kalendārs" on the left).
- **Next-round card:** inside is a lighter shade of the page colour (blue on
  Dobele, red on Jelgava), so it stands out from the page.
- **Season sheet template:** "Sponsori" tab, renamed stage, single-game
  Challenge Cup semifinals; the builder now lives in `tools/season_sheet.py`.

## Round 3 — released 15 Oct 2026 (PR #4)

- **Challenge Cup format.** Semifinals are one game (were two-game aggregate).
  1/8 and 1/4 finals stay two-game aggregate; the final is one game. Engine,
  bracket labels and the mock season follow.
- **Results posters ("Dalīties" on the previous-round block).** Same pop-up and
  two formats as the next-round posters, for every round of both cups. Full
  photo under a dark see-through tint (gold for Dobele, red for Jelgava), cup
  logo centred about 10% from the top on both formats, "Rezultāti" and the
  date of the games, then home logo · score · away logo per game (winner's
  score brighter), a small line under the score for series standings,
  aggregates, overtime and forfeits, the sponsor band and the notice bar.
  Every round's games sit under a stage label in a cup-coloured pill ("Grupu turnīrs · 3. kārta", "K grupa · 2.
  kārta", "Cerību kauss · 1. pusfināls", "Pusfināli · 2. spēle",
  "Astotdaļfināls · 1. spēle", "Pusfināls", "Fināls"); on Dobele finals day
  each game gets its own ("Bronzas fināls", "Zelta fināls"). The photo fills
  only the area above the sponsor band, so it is zoomed out as far as possible.
- **Photo pools.** Separate pools for next-round posters and results posters
  (`use` in `src/poster-photos.json`); photos are kept up to 2000 px, and the
  results Story prefers upright photos. Results pool: three upright photos from
  last season.

## Test site date — 15 Oct 2026

- The test site now shows 5 January 2027: Dobele K group after round 1 (next:
  K group round 2 + the first Hope Cup semifinal) and the Challenge Cup after
  the first leg of the 1/8 finals (next: second leg). Previously 10 March 2027
  (both cups in the semifinals).

## Round 2 — released 15 Oct 2026 (PR #2)

Everything requested after PR #1 was merged (14 Oct 2026). Ships together as the
next deployment.

- **Round posters ("Dalīties").** A share button on the next-round block opens two
  posters for that round: a 4:5 feed post and a 9:16 Story/Reel. They follow
  last season's Dobele poster: action photo, jagged edge, coloured panel with the
  cup name, date and hall, stage, the games (home · time · away), sponsor
  logos and the photo/video notice. The Jelgava cup uses its own colours; the
  three header lines are black (Dobele) / white (Jelgava). Hope Cup games in a
  K group round get a label. Team names use one size for the whole season (set
  by the longest names); the time box is deliberately smaller. Font: DIN
  Condensed where available (iPhone, Mac), otherwise Barlow Condensed. Phones
  share directly to Instagram/Facebook; computers download the JPG.
- **Where the posters apply.** Dobele group stage and K group (incl. Hope Cup
  games), Jelgava 1/8 and 1/4 finals. Semifinals and finals of both cups get a
  separate template later; no share button there for now.
- **Poster details (review 15 Oct).** Story poster: header sits lower under the
  photo and closer to the games. The Hope Cup game is always last, in its own
  section with extra space above it and its label right on top of it (no line).
  Pop-up shows only the title, the two previews with their platform/ratio line
  and the buttons; the bottom note now says "social networks".
- **Home page tidy-up (both cups, desktop and phone).** Header shows only the
  logo with the season and cup name centred next to it (stage and next-round
  date removed). No line of stage/date/hall under "Iepriekšējās kārtas
  rezultāti" and "Nākamās kārtas spēles". The round MVP follows the results
  without its own heading. On phones "Dalīties" sits above the schedule card and
  "Viss kalendārs ›" below it, both on the right.
- **Second review (15 Oct).**
  - Posters: a bit more space between the "Cerību kauss" label and its game.
  - K group table on phones: no A1/B2… tags next to the (short) team names.
  - Jelgava bracket: teams that go straight to the quarterfinal get a box the
    same size as the game boxes, without the "Brīvs" label, saying
    "Automātiski kvalificējas ceturtdaļfinālam" with their quarterfinal dates.
  - Calendar with a team selected: desktop shows "VS" + the opponent's logo;
    phones show a small cup logo in the corner of the day.
  - Game page header centred: cup, stage + game, result, date/time/hall,
    status line, series game buttons (no extra "Sērija"/"Summā" block).
  - Team comparison: the better team's bar gets the cup colour, the other is white
    (fewer is better for turnovers and fouls).
  - Game leaders on phones: centred tiles — category, number, logo + first name
    and surname on two lines.
  - Box score: total rebounds (AB) and assists (RP) in bold like points.
  - Next-round schedule card: thicker outline.
- **Photo pool.** One shared pool for both cups; the system picks the photo
  per round, cycling through the pool. Stand-in photo from last season until
  the new photos arrive.
- **Sponsors 2026/27.** 13 sponsors in the footer and on the posters: Dobeles
  novada pašvaldība, Jelgava, Jelgavas Sporta servisa centrs, Tērvetes alus
  darītava, Jaunpils pienotava, Dobeles dzirnavnieks, Nākotne, Nordcrunch,
  Ozols Pub, Garage Barber, Sporta bode (sportabode.eu), Balevich Media,
  Kebabmix. Perwoll removed. Logos are web-optimised and sized to the same
  visual weight.

## Round 1 — first release (PR #1, 14 Oct 2026)

Home pages for both cups, game pages with box scores, calendar, Kopvērtējums,
tournament engine, mock 2026/27 season, GitHub Pages deployment.
