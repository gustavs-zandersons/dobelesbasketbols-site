# Changelog

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
