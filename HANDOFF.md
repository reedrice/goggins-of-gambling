# HANDOFF: guide for maintainers and AI agents

Read this before you change anything. It covers the whole system.

## 1. What this is

A **static single-page app** with no backend and no build step, served by **GitHub Pages** from `main` / repo root:

- Live site: https://reedrice.github.io/goggins-of-gambling/
- Repo: https://github.com/reedrice/goggins-of-gambling (public; owner `reedrice`)

The owner (Reed) and a few friends use it on their phones. It shows the daily picks an automated job writes, keeps each person's bankroll **privately in their own browser**, and collects a **dollar-free** shared log of real platform quotes vs. our estimates to calibrate future pricing.

The owner prefers **committing straight to `main`** with no branches or PRs, and **descriptive commit messages**: a subject line plus a body explaining what changed and why.

## 2. Architecture and data flow

```
                  ┌────────────── GitHub repo (public) ──────────────┐
 daily job ──git push──▶ data/picks.json, data/predictions.json      │
                  │                                                   │
 browser ◀──GET (relative, cache-busted)── Pages serves repo root    │
   │              │                                                   │
   │  user token ─┼─GET+PUT /repos/.../contents/data/bet-log.json ───▶│ (collaborators only)
   │              └───────────────────────────────────────────────────┘
   ▼
 localStorage (betdash_*): profile, bets, settings, token  ← never leaves the device
```

The scripts load in this order (classic `<script>` tags; each one sets a single global):

| file | global | role |
|---|---|---|
| `config.js` | `APP_CONFIG` | brand text, repo wiring, and the **platform list**. **The only place the brand lives.** |
| `js/strings.js` | `STR` | **every** user-facing sentence, button label and (i) tooltip. |
| `js/calc.js` | `BetCalc` | pure math: price parsing, parlay multiple, hit chance, gap, EV, P/L, cents↔American/decimal display. Also loads in Node. |
| `js/storage.js` | `Store` | the **only** code that touches localStorage. Handles export and import. |
| `js/teams.js` | `Teams` | team logo markup with a 3-step fallback (see §12). |
| `js/markets-core.js` | `MarketsCore` | Polymarket US parsing shared by the browser and `scripts/fetch-markets.mjs` (UMD). |
| `js/picker.js` | `Picker` | the market picker in Build a bet: search, browse, live prices. |
| `js/github-log.js` | `GitHubLog` | builds dollar-free records and upserts them into `data/bet-log.json` via the contents API. |
| `js/app.js` | `BetDash` (debug) | UI: onboarding, hash router, the five tabs, platform toggle, event wiring. |

## 3. File map

```
index.html            DOM skeleton (empty onboarding container, header, "I bet on" bar, 5 tab sections, tab bar, tooltip bubble)
config.js             brand + repo config + platforms[] (one ordered list used everywhere)
css/style.css         dark mobile-first theme (sections 1-18; 18 = 2nd-grade money words, 16 = payout explainer; 13 = leg start times, 14 = grouped results, 15 = position badges; 9 = picker/logos/toggle/tooltips, 10 = Record compare table, 11 = pick evaluation box, 12 = Build-a-bet filter panel)
js/strings.js         all UI text (plain-language rules in its header)
js/calc.js            odds and parlay math (pure)
js/trent.js           Fade Trent math: record, units, fade, validate (browser + Node, §28)
js/vegas.js           cents -> American odds ("44¢ (+127)") + lookup of real sportsbook "Vegas" numbers from data/vegas-lines.json (§26)
js/plain.js           2nd-grade money words: "6 out of 10" / "1 in 4", dots, "Tap:" split, spread explainer, deal word (browser + Node, §25)
js/evaluate.js        per-pick hit chance, risk label, "My take" verdict, prediction lookup (browser + Node, §18)
js/storage.js         localStorage schema and access
js/gametime.js        game start times on slip legs / saved bets: format, countdown, snapshot lookup, sort (browser + Node, §20)
js/teams.js           team logos: Polymarket logo -> ESPN CDN -> colored circle; ESPN abbreviation fixes
js/positions.js       player positions: name matching (accents, Jr., initials) + badge/tooltip helpers (browser + Node, §21)
js/markets-core.js    Polymarket US event/market compaction + labels (browser + Node)
js/picker-filters.js  Build-a-bet filter rules: day/sport, bet types + sub-types, team, player (browser + Node, §19)
js/picker-groups.js   groups results: game -> game bets by type / player props by stat category -> player (browser + Node, §19)
js/picker.js          market picker UI (filter panel, search, grouped results, browse) + live Polymarket US fetches
js/github-log.js      shared log writer (GitHub REST contents API)
js/app.js             UI controller
data/markets/index.json         snapshot: list of upcoming games (small, loaded first)
data/markets/events/<slug>.json snapshot: every market of one game (lazy-loaded)
data/picks.json       today's picks (overwritten daily by the job)
data/predictions.json game predictions and grades (appended by the job)
data/bet-log.json     shared calibration log (written by the app with users' tokens)
data/positions.json   player positions per league from ESPN rosters (written daily by fetch-positions.mjs, §21)
data/trent-picks.json @BookitWithTrent's X picks, graded on real finals (scripts/trent-picks.mjs, §28)
data/vegas-lines.json best sportsbook American price per market side, all games' full-game lines (written by fetch-book-odds.mjs, §26)
data/book-odds.json   automatic per-app price comparisons (The Odds API, written daily by fetch-book-odds.mjs, §17)
tests/calc.test.js        node: math (incl. payout explainer: payout / slipPays)
tests/ingest-vegas.test.mjs node: exact-line matching of hand-read odds (scripts/ingest-vegas.mjs, §27)
tests/trent.test.js       node: Fade Trent math + data/trent-picks.json validity (§28)
tests/vegas.test.js       node: cents -> American conversion, Vegas lookup rules (js/vegas.js, §26)
tests/plain.test.js       node: 2nd-grade wording helpers (js/plain.js, §25)
tests/gametime.test.js    node: start-time format (CT/ET), hints, lookup, leg order
tests/evaluate.test.js    node: hit chance / risk / verdict defaults (js/evaluate.js)
tests/picker-filters.test.js node: filter tree rules (js/picker-filters.js)
tests/picker-groups.test.js  node: result grouping, line order, default open state, speed (js/picker-groups.js)
tests/github-log.test.js  node: log writer against a mocked API
tests/positions.test.js   node: player-name matching, never-guess rule, lookup, badge HTML (js/positions.js)
tests/update-picks.test.mjs node: next-day picks: slate_date/start_time checks, carry-over rules (§23)
tests/markets-core.test.js node: team full names (NBA city + nickname) and NBA prop buckets
tests/smoke.js            headless Chrome UI walk-through (puppeteer-core, --no-save)
scripts/update-picks.mjs  daily-job CLI: validate, write, commit, and push picks/predictions
scripts/fetch-markets.mjs daily-job CLI: refresh data/markets from Polymarket US + match Kalshi, enrich picks.json
scripts/fetch-positions.mjs daily-job CLI: ESPN rosters (+ NBA depth charts) -> data/positions.json; run by fetch-markets.mjs (§21)
scripts/fetch-book-odds.mjs daily-job CLI: other apps' prices for today's picks (The Odds API, ODDS_API_KEY) -> data/book-odds.json
.cache/espn/          git-ignored 20-hour cache of ESPN roster responses
.nojekyll             tells Pages to serve files as-is
README.md             user-facing overview and the picks.json schema
```

## 4. Key math (js/calc.js)

- **Price → probability `p`:** cents `63` → 0.63 (bare integers 1–99 are always cents). Probability `0.63` → 0.63. American `-150` → 150/250 = 0.60, `+120` → 100/220 = 0.4545. Decimal `2.5` or `2.5x` → 0.40. Add a `c`/`%` suffix to force cents and an `x` suffix to force decimal.
- **Estimated multiple** = Π(1/pᵢ). This is the payout if each leg were priced independently at its market price. Polymarket pays $1 per share, so a single at 40¢ is 2.5x.
- **Independent hit chance** = Πpᵢ = 1 / estimated multiple.
- **Gap** = quoted / estimated − 1. Example (Reed's Polymarket US slip, legs 64¢ and 49¢): 1/(0.64 × 0.49) = 3.19x estimated, quoted 2.97x, so 2.97 / 3.19 − 1 ≈ −6.9%. The platform shaved about 7% off the same-game parlay for correlation or vig. Collecting gaps per platform sharpens the `skip_below` thresholds.
- **EV** = stake × (quoted × hit − 1). Without the user's own hit-chance override, EV = stake × gap, the market-implied EV.
- **P/L:** won = stake × (multiple − 1), lost = −stake, push = 0. **Bankroll** = start + Σ settled P/L. It is derived, never stored.

## 5. Data files

### data/picks.json
Fully specified in [README.md](README.md#datapicksjson-schema). In brief: `{schema_version, slate_date, updated_at, notes[], sections:{predictions[], singles[], props[], parlays[], longshots[], nonsports[]}}`. Prices are ask cents, `fair` is the no-vig %, stakes are **units only**, and `pending_news` is a flag string.

### data/predictions.json
```jsonc
{
  "schema_version": 1,
  "updated_at": "ISO 8601",
  "predictions": [{
    "id": "2026-10-19-was-sf",      // unique
    "date": "2026-10-19",           // slate date
    "sport": "NFL",
    "game": "Commanders @ 49ers",
    "pick": "49ers",                // predicted winner
    "win_prob": 72,                 // % for the picked side, 50–100
    "projected_score": "SF 27 – WAS 20",
    "final_score": "SF 30 – WAS 17",// filled when graded
    "result": "pending"             // "pending" | "win" | "loss" | "push" (push/pending excluded from accuracy)
  }]
}
```
The Record tab computes win-pick accuracy and **calibration** in 5-point buckets (`floor(win_prob/5)*5`), comparing the average predicted % to the actual hit rate.

### data/bet-log.json
```jsonc
{
  "schema_version": 1,
  "updated_at": "ISO 8601",
  "records": [{
    "id": "b_lq3k9a_x7f2",          // same id as the private bet; upserted on settle
    "timestamp": "ISO 8601",        // created, or settled once settled
    "author": "reedrice",           // GitHub login from GET /user
    "platform": "Polymarket US",    // or "A + B" if legs differ
    "category": "parlay",           // single|prop|parlay|longshot|nonsports
    "legs": [{ "desc": "Under 6.5", "price": "48",   // price as typed
               "start_time": "2026-10-20T00:08:00Z" }], // game start (ISO); only when known, never guessed
    "estimated_multiple": 3.19,
    "quoted_multiple": 2.97,
    "gap": -0.0686,
    "result": "pending"             // pending|won|lost|push
  }]
}
```
**No dollar fields, ever.** `GitHubLog.buildRecord()` is an allow-list. When estimating, weight `author == "reedrice"` entries over friends' entries unless the owner says otherwise.

## 6. Shared-log write flow (js/github-log.js)

1. `GET /repos/{owner}/{repo}/contents/data/bet-log.json?ref=main` returns base64 `content` and `sha` (a 404 means the log is new and empty).
2. Decode the content as UTF-8, then upsert the record by `id`.
3. `PUT` the same path with `{message, content: base64(json), sha, branch}`.
4. A **409/422** response means the sha went stale because someone else committed. The writer re-GETs, which picks up their record too, and retries up to 4 times with backoff. A 403/404 means the token lacks `contents:write` or the user isn't a collaborator.

Failed shares stay `shared:false` on the private bet, and **Settings → Sync unsynced** retries them. If a user deletes a bet locally, its shared record is *not* removed.

## 7. localStorage keys

All keys use the neutral `betdash_` prefix. **Never put the brand in a key**, because a rename would orphan data.

| key | content |
|---|---|
| `betdash_profile` | `{version, name, startBankroll, unit, maxPerSlip, windowEnd, createdAt}`. If it's missing, the app shows onboarding |
| `betdash_bets` | `Bet[]`. See the header comment in `js/storage.js` (stake is private) |
| `betdash_settings` | `{shareByDefault}` |
| `betdash_gh_token` | the user's fine-grained token. Local only and **excluded from exports** |
| `betdash_gh_login` | cached GitHub login |
| `betdash_picker_filters` | **sessionStorage**, not localStorage: Build-a-bet filters `{f:{day, sport, team, player, teamOn, propOn, teamOff[], propOff[]}, panelOpen}` (§19). Gone when the tab closes |
| `betdash_prefs` | `{platform:'polymarket_us'|'kalshi', priceFormat:'cents'|'american'|'decimal'}`. Defaults: Polymarket US, cents. **One value** drives the onboarding step, the "I bet on" bar under the header and Settings |

Backups (`Export JSON`) use the format `{format:"betdash-backup", version:1, exportedAt, profile, bets, settings, prefs}`.

## 8. How the daily job updates picks

Use **`scripts/update-picks.mjs`**. It's plain Node 18+ with no dependencies. It validates the schema **and** the privacy rule before writing anything, stages only the data file it changed, commits to `main` with a descriptive generated message, then runs `git pull --rebase` and `git push`.

```bash
node scripts/update-picks.mjs validate [file]              # check only (picks.json, or predictions.json by filename)
node scripts/update-picks.mjs picks /tmp/new-picks.json    # replace data/picks.json (auto-fills hit_prob/risk/verdict/same_game, §18), commit, push
node scripts/update-picks.mjs add-picks /tmp/extra.json   # ADD picks (e.g. tomorrow's, with slate_date) without replacing the file (§23)
node scripts/update-picks.mjs add-picks /tmp/v2.json --replace --drop <old-id>   # rebuild: same id = update in place, --drop removes
node scripts/update-picks.mjs list [--date 2026-10-20]     # read-only: day, section, id, side of every pick
node scripts/update-picks.mjs fill                         # backfill missing hit_prob/risk/verdict/same_game in data/picks.json, commit, push
node scripts/update-picks.mjs add-predictions /tmp/p.json  # append [{id,date,sport,game,pick,win_prob,projected_score?,...}]
node scripts/update-picks.mjs grade /tmp/grades.json       # [{id, result: win|loss|push, final_score?}]
node scripts/update-picks.mjs grade <id> win "SF 30 – WAS 17"
# flags: --dry-run (validate + print the commit, write nothing), --no-push, -m "extra body line"
#        picks only: --drop <id> (don't carry that existing pick over; repeatable), --replace-all (carry nothing over)
```

Exit codes: `0` ok, `1` validation failed (nothing written), `2` usage error, `3` git failure.

The validator rejects:
- unknown sections
- duplicate ids
- prices or fair values outside 0–100
- a missing `side` or `stake_units`
- parlays and long shots with fewer than 2 legs
- bad `action` or `result` values, non-http links, and malformed dates
- **any** key named like `stake`/`bankroll`/`payout`/`token`, or any text that looks like `$5`, `USD 10`, or a GitHub token

Daily routine:
0. **Check for picks already on the board for today:** `node scripts/update-picks.mjs list --date <today>`. The day before, extra slips may have been added for today with `add-picks` (each carries `"slate_date": "<today>"`). `picks` (step 4) **keeps them automatically** (carry-over, §23). Don't add a second copy under a new id:
   - **Keep as is:** do nothing; it stays on the page.
   - **Update it** (new prices, injury news, hit_prob): put a pick with the **same id** in the new file; the new one replaces it.
   - **Remove it:** pass `--drop <id>` to `picks`.
   - The commit body lists every carried-over id; check it.
   - Clear `pending_news` once the news is in (e.g. "Embiid and LeBron are both playing").
0b. **Follow Reed's pick-building rules (§24):** merit only, never skip a pick because it's in an open slip; mix sports in slips freely; title the three slips "Small payout · 3 picks" / "Medium payout · 3 picks" / "Big payout · 4 picks"; write reasoning in 2nd-grade words (no ¢, %, "x"); **the digest/report to Reed uses dollar payouts ("10 dollars → 22.73 back" (money sign in the UI)) and American odds ("+127", "Vegas +133 (Bovada)"), never cents (§29)**; update the Fade Trent tab (§28).
1. Build the new slate in the `picks.json` schema. Use **units, not dollars**, and the platform's actual ask prices (Reed's app is **Polymarket US**, a different exchange from polymarket.com). Set `verify_note` whenever a price came from somewhere else. Set `updated_at` to now (UTC is fine; the UI shows CT).
2. `grade` yesterday's predictions.
3. `add-predictions` today's game predictions (`result` defaults to `pending`; ids like `2026-10-20-was-sf`).
4. `picks` the new slate. Fill in `hit_prob` (your real estimated chance, especially for same-game parlays), and `verdict`/`prediction_id` when you have something better than the defaults; anything missing is computed and written for you (§18). Pages redeploys in about a minute, and the app cache-busts its fetches.
5. `node scripts/fetch-markets.mjs --commit` (see §13). Run it **after** step 4 so the new picks get Polymarket/Kalshi links and Kalshi prices. It also refreshes player positions (`data/positions.json`, §21).
5b. `node scripts/fetch-book-odds.mjs --commit` (see §17). Run it **after** step 5: it prices today's picks at the other apps through The Odds API (needs `ODDS_API_KEY` in the environment; about 6-12 of the 500 monthly credits).
6. Read `data/bet-log.json` to compare quoted vs. estimated multiples per platform and tune `skip_below`.

## 9. Renaming the brand

Edit **only** `config.js`: `appName`, `tagline`, `onboardingPitch`, `slogans`, and `shortName`. The title, header, onboarding, and settings footer all read from it, so don't hardcode the brand anywhere else. The current name is a working title.

If you also rename the GitHub repo, update `repoName` in `config.js` and the URLs in README.md and this file. The Pages URL becomes `https://reedrice.github.io/<new-name>/`. Users' private data survives that change, because localStorage is scoped to the origin (`https://reedrice.github.io`), not the path, and the keys don't include the brand. Moving to a different domain would need an Export and Import.

## 10. Privacy rules (non-negotiable)

- Never commit dollar amounts, bankrolls, stakes, P/L, personal profiles, or tokens. Stakes in `picks.json` are **units**.
- Treat `picks.json` text as untrusted. The app escapes it, so keep it that way: no raw `innerHTML` from data.
- Tokens stay in the user's localStorage. Don't log them, export them, or send them anywhere except `api.github.com`.

## 11. Deploy and verify

- Push to `main`. Pages builds from `main` at `/` (root). Check progress with `gh api repos/reedrice/goggins-of-gambling/pages/builds/latest`.
- Verify with `curl -sI https://reedrice.github.io/goggins-of-gambling/`, which should return 200, and the same for `/data/picks.json`.
- Before pushing, run `node tests/calc.test.js && node tests/github-log.test.js && node scripts/update-picks.mjs validate`, plus `tests/smoke.js` if you changed the UI.

## 12. Team logos (js/teams.js)

`Teams.badge(team, size)` returns a lazy-loaded logo (24-32px in the UI) used on pick cards, picker game cards, search results, slip legs and saved bets. Player props show the **player's team** logo. Sources, in order, each tried only if the previous image fails to load:

1. `team.logo` from the Polymarket US API (copied into the snapshot).
2. ESPN CDN `https://a.espncdn.com/i/teamlogos/{league}/500/{abbr}.png`. Leagues: nfl, mlb, nhl, nba, wnba (soccer has no ESPN mapping and skips this step). Where Polymarket's code differs from ESPN's (e.g. `WAS`→`wsh` in the NFL), fix it in **`ESPN_ALIASES`** in `js/teams.js`, the only mapping table.
3. A colored circle with the abbreviation (`team.color` if Polymarket provides one).

Fallback works through one capture-phase `error` listener (`Teams.install()`), so no inline `onerror` is needed. In `picks.json`, give a pick or leg `team:{league, abbr}` (or `teams:[...]` for a game) and the logo appears; `Teams.registerFromIndex()` fills in Polymarket logo URLs from the market snapshot.

## 13. Market picker and data/markets

**What users see (Build a bet):** a **Filters** panel (day, sport, bet types, team, player; see §19), a search box (fuzzy, instant: "purdy", "leafs ml", "under 6.5", "san") that works on top of the filters, and **Browse games**: game cards for the filtered day/sport/team. A game opens into *Main bets* (who wins, spread with each team's line, totals), *Player bets* grouped by player, and *Other*. Every market has big Yes/No buttons with prices; tapping adds a leg to the slip. **Type a bet yourself** adds a manual leg for any other app. Slip legs have a remove ×, a "Picks that affect each other" flag when two legs are from the same game, and "Prices as of …".

**Live vs snapshot:**
- The **game list and search** use the daily snapshot in `data/markets/` (listing every game live would be tens of MB).
- **Opening a game** re-fetches that game live from `https://gateway.polymarket.us/v1/events/slug/{slug}` (CORS is `*`). The header says "Live prices as of …" or falls back to the snapshot time.
- **Each slip leg** gets a live price from `/v1/markets/{slug}/bbo` on add and on **Refresh prices**.
- **Kalshi** has no CORS, so Kalshi prices and links come **only** from the snapshot.

**Pricing rule (Polymarket US):** the market side with `long:true` is "Yes" and its quote is the best ask. The No cost is `100 − bestBid`. Spreads are listed under the favorite's slug (e.g. "TB −1.5"); the long side may be the underdog +1.5, so labels come from each side's own team and line (`MarketsCore.fmtLine`). Totals: long = Over.

**Snapshot schema:**
- `data/markets/index.json`: `{schema_version, updated_at, source, dates[], events:[{id, slug, sport, league, title, start_time, date (CT), url, polymarket_url, kalshi_url, teams:[{abbr, display, name, short, full (name with city, for search), logo, color}], market_count, players:[[name, teamAbbr]], file}]}`. `full` is the full team name. Polymarket splits NBA names (`name` "76ers", `safeName` "Philadelphia", Lakers `safeName` "Los Angeles L"), so `MarketsCore.fullName` joins them into "Philadelphia 76ers" / "Los Angeles Lakers".
- `data/markets/events/<slug>.json`: the same event plus `markets:[{id (market slug), type (moneyline|spread|total|prop|other), group (lines|props|other), smt, label, line, side_yes_label, side_no_label, yes_ask, yes_bid, no_cost (cents), player?, team?, kalshi?:{ticker, yes, no}}]`.

**Refreshing it:**
```bash
node scripts/fetch-markets.mjs --commit          # next 4 days, match Kalshi, enrich picks.json, commit + push
#   --days N   --no-kalshi   --no-positions   --no-push   (no --commit = write files only)
```
Takes 30-60s. It covers NFL, MLB, NHL, NBA, WNBA and the main soccer leagues (`MarketsCore.LEAGUES`), deletes event files for games that dropped out, and never writes dollars. Run it daily after the picks update; running it again later in the day just makes the snapshot fresher. It also refreshes `data/positions.json` (§21) and tags prop picks/legs in `picks.json` with `player`, `player_team` and `league` (used for the position badge).

**NBA (added 2026-10-19):** game bets (who wins, spread, total, 1st-half / 1st-quarter lines) and player props (`basketball_player_points / rebounds / assists / threes / blocks / steals`) come from the same gateway as every other league. Polymarket US had no PRA or double-double props on 2026-10-19; the code already has categories for them (`combos` bucket, `points_rebounds_assists` etc. in `STR.calc.f.stats`). Polymarket posts props about a day ahead (on 2026-10-19: props for the 3 Oct 20 games only).

## 14. "I bet on" platform and Kalshi links

`betdash_prefs.platform` decides where every **Open** button goes:
- **Polymarket US:** `polymarket_url` (`https://polymarket.us/sports/{league}/{event slug}`).
- **Kalshi:** `fetch-markets.mjs` matches each game through the public API `https://api.elections.kalshi.com/trade-api/v2` (event tickers like `KXNFLGAME-26OCT19WASSF`; MLB adds the start time, `KXMLBGAME-26OCT192008CLETB`; sibling series such as `KXNFLSPREAD`, `KXNFLTOTAL`, `KXNFLPASSINT` share the suffix). Markets match by team code (who wins), favorite + `floor_strike` (spreads), `floor_strike` (totals), and player name + `floor_strike = line − 0.5` (props). Series and team-code tables are `KALSHI_SERIES` and `KALSHI_ALIASES` in the script. NBA series (checked against the Kalshi API on 2026-10-19): `KXNBAGAME`, `KXNBASPREAD`, `KXNBATOTAL`, `KXNBAPTS`, `KXNBAREB`, `KXNBAAST`, `KXNBA3PT`, `KXNBASTL`, `KXNBABLK`, `KXNBAPRA` (there is no `KXNBAPTSREBAST`).
- On picks it writes `kalshi_url`, `kalshi_match` (`market` | `event` | `none`) and `kalshi_price`. Fallbacks: no exact market → the game's event page; no event at all → Kalshi search (`https://kalshi.com/search?query=…`) and a **"Not on Kalshi"** badge.
- **Link format (fixed 2026-10-19).** A friend on the Kalshi phone app reported that Open buttons landed on the app's generic "For you" page. The old links were `kalshi.com/markets/<series>/<event>`: a desktop browser redirects these, but the app (which claims every `kalshi.com/markets/*` link via its apple-app-site-association) doesn't. Links now use the same 3-part shape as Kalshi's own Share button:
  ```
  https://kalshi.com/markets/<series>/<series-slug>/<event>?op_market_ticker=<MARKET>&op_order_side=yes|no
  e.g. https://kalshi.com/markets/kxmlbtotal/pro-baseball-total-points/kxmlbtotal-26oct192008cletb?op_market_ticker=KXMLBTOTAL-26OCT192008CLETB-7&op_order_side=no
  ```
  - `series` and `event` are the lower-case tickers. `series-slug` is the **series title slugified** (`GET /series/{ticker}` → "Pro Football Spread" → `pro-football-spread`). Kalshi renames titles now and then (KXNFLGAME went from `professional-football-game` to `nfl-game`), so the script refreshes the slugs daily into `index.json` → `kalshi_series_slugs`.
  - `op_market_ticker` + `op_order_side` pre-select the exact line and Yes/No in the order ticket. The side is translated to Kalshi's orientation: `market.kalshi.flip` means Kalshi YES = our NO (Unders, the + side of spreads), and `market.kalshi.no_ticker` (who-wins markets) is the other team's market, whose YES = our NO.
  - The builders are shared in `js/markets-core.js`: `kalshiSlug`, `kalshiEventUrl`, `kalshiMarketUrl`, `kalshiSearchUrl`. The browser calls them through `Picker.kalshiUrlFromTicker`. `Picker.fixKalshiUrl` upgrades old 2-part links on bets saved before the fix.
  - Verified in headless Chrome on kalshi.com: the right game page loads, and the order ticket shows the right line and side. Not verifiable from here: the app itself. That the app routes this shape to the market is inferred, because it's the format Kalshi's own Share button produces.
- Known gaps: some prop series return no markets for some games (e.g. any-time TD, NHL goals/points), so those legs fall back to the game page.

## 15. Plain language and strings (js/strings.js)

All UI text lives in `js/strings.js`, grouped by screen and commented. Rules (also in its header): no jargon (EV, implied probability, vig, no-vig, correlation, edge, units, multiple, independent). Money and odds wording follows §25 (dollars first, "6 out of 10", cents once). Use "Chance to win", "Fair price", "Your price advantage", "Picks that affect each other", "Expected profit per $10 bet, on average over time". Anything that needs more explanation gets an (i) button: add the text to `STR.tips` and render `tip('key')`. Sizes show as dollars ("$5.00 (half your standard bet)"); `units` stay in `picks.json` only. Pick text in `picks.json` (reasoning, notes) should follow the same rules.

## 16. Platforms and price display

`APP_CONFIG.platforms` is the single ordered list: Polymarket US, Kalshi, Bovada, FanDuel, DraftKings, BetMGM, Caesars, ESPN Bet, Fanatics, bet365 (`{id, name, short, color}`), plus `otherPlatform`. It feeds the leg dropdown in Build a bet (with **Other**) and the Record tab's "How each app's prices compare" section (§17). Each entry also has `oddsApi`, its The Odds API bookmaker key (null = not in the feed). `myPlatforms` lists the ones that can be the "I bet on" choice.

Prices show as **cents by default** (Polymarket style). Settings → Price format can switch display to American (63¢ → −170, 48¢ → +108, 50¢ → +100) or decimal (`BetCalc.formatPrice`). Price inputs accept any format regardless of the setting. Picker legs store fractional cents as `"63.5c"` so they don't parse as decimal odds.

## 17. Record tab: "How each app's prices compare" and data/book-odds.json

One block per app (in `APP_CONFIG.platforms` order, plus "Other" only if someone logged a bet there). Under each app name is a 5-column grid (`.pc-*` in style.css) with **one value per cell** and a dash (–) when there's no data. It fits a 390px phone with no sideways scroll. The owner asked for the % not to be stacked under the count.

| column | source | value |
|---|---|---|
| **Bets you logged** | `data/bet-log.json` (shared, manual) | count of records |
| **Paid vs. our estimate** | same | average `gap`, e.g. `-6.9%` (red below 0) |
| **From odds feed** | `data/book-odds.json` (automatic) | count of comparison rows |
| **Price vs. <your app>** | same | average price difference vs. the user's "My platform" in cents, e.g. `+3.2¢` (red = that app charges more). See "Baseline follows My platform" below |
| **Total** | both | logged count + feed count |

Feed status notes sit next to the app name, not in a cell: "Your app (we compare others to this)" (the user's "My platform", listed first), "Needs a paid odds plan" (`oddsApiPaid`, no rows), "Not in the odds feed" (`oddsApi: null`, bet365), and "Coming soon, waiting on odds feed" (whenever `status` isn't `"active"`).

The numbers come from `BetCalc.platformSummary(records, comparisons, platforms)`, which is pure and tested in `tests/calc.test.js`. All labels and the five (i) tooltips are in `STR.record` / `STR.tips` (`colLogged`, `colGap`, `colFeed`, `colDiff`, `colTotal`).

**data/book-odds.json** is written by `scripts/fetch-book-odds.mjs` (dollar-free; check it with `node scripts/update-picks.mjs validate data/book-odds.json`):
```jsonc
{
  "schema_version": 1,
  "status": "active",               // "waiting_for_feed" = UI shows "Coming soon"; "active" = UI uses the rows
  "updated_at": "ISO 8601",         // last run
  "source": "The Odds API (https://the-odds-api.com) + live Polymarket US prices",
  "baseline": "polymarket_us",      // what every diff is measured against
  "last_run": {                     // for humans/agents; the UI doesn't need it
    "at": "ISO", "slate_date": "2026-10-19", "sports": ["mlb","nhl","nfl"],
    "books_requested": ["bovada","fanduel",...], "books_returned": ["betmgm","bovada",...],
    "priced_today": 13, "targets": 13, "rows_today": 64,
    "props": "included" | "skipped: …",
    "credits_used": 11, "credits_remaining": 489
  },
  "books": { "fanduel": { "priced": 12, "avg_diff": 3.21 } },   // all kept history, per app
  "comparisons": [{                 // one row per distinct (market, side) x app x day; history kept 60 days
    "date": "2026-10-19",           // picks.json slate_date
    "market_id": "tsc-mlb-cle-tb-2026-10-19-6pt5",   // Polymarket US market slug
    "side": "no",                   // our side of that market
    "label": "Under 6.5",           // human-readable side
    "refs": [{ "pick_id": "s-cle-tb-under65", "leg": null }, { "pick_id": "x-cle-plus15-under", "leg": 1 }],
    "book": "kalshi",               // platform id from APP_CONFIG.platforms (never polymarket_us)
    "odds_api_key": "kalshi",
    "book_price": "+108",           // the app's American odds
    "book_chance": 48.1,            // the same price in cents
    "polymarket_price": 49,         // live Polymarket US cost of the same side, fetched right after
    "kalshi_price": 48,             // Kalshi ask for the same side from the market snapshot (null = not on Kalshi). Added Oct 19 2026
    "diff": -0.9,                   // book_chance - polymarket_price. Positive = that app charges more (pays less)
    "fetched_at": "ISO"
  }]
}
```

**Running it** (daily, after `fetch-markets`):
```bash
node scripts/fetch-book-odds.mjs --commit       # price today's picks, write data/book-odds.json, commit + push
#   --dry-run          print the plan and its credit cost; no paid calls
#   --max-credits 12   most one run may spend; player props are dropped first if over (default 12)
#   --floor 50         stop cleanly instead of going below 50 remaining credits (default 50)
#   --no-props         game lines only
```
- **Key:** read only from `process.env.ODDS_API_KEY`. The script never prints, logs, writes or commits it: URLs are logged without their query, and errors are scrubbed. Don't add it to any file.
- **Budget:** free plan, 500 credits/month. One `/odds` call costs (markets requested) × (regions). We send `bookmakers=` with 8 keys, which counts as one region, and we request only the market types today's picks use (e.g. MLB h2h+spreads+totals = 3, NHL h2h = 1, NFL h2h+totals = 2). Player props cost 1 credit per prop market per game (`/events/{id}/odds`) and are fetched only for games with a prop pick, if the run stays within `--max-credits`. `/sports` and `/sports/{sport}/events` are free. The first run (2026-10-19) cost **11 credits** (6 lines + 5 props), leaving 489. At the 12-credit cap, the worst case is about 370 a month.
- **Books on the free plan (first run):** FanDuel, DraftKings, BetMGM, Bovada, ESPN Bet (`espnbet`, "theScore Bet") and Kalshi (`us_ex`). Caesars (`williamhill_us`) and Fanatics returned nothing; they're paid-plan only (`oddsApiPaid: true` in config, shown as "Needs a paid odds plan"). bet365 isn't in the US feed. Polymarket US is the baseline, so it isn't requested.
- **Matching** is documented in the script header: game by both team names within 36h; h2h by team; spreads by team + signed line from the side label; totals by Over/Under + line; props by player name, with Polymarket "N+" = Over N−0.5 and anytime TD/goal = "Yes". Prop types are mapped in `PROP_MARKETS` (NBA: points, rebounds, assists, threes, blocks, steals, PRA), and sports in `SPORT_KEYS` (`basketball_nba`, `basketball_wnba`). A sport is only priced when a pick needs it, so NBA costs nothing on days without NBA picks.
- **Priority when the cap is tight:** sports are ranked by how many of today's picks/legs they have. Game lines are taken in that order while they fit `--max-credits`, then prop games (the one with the most prop picks first). Whatever doesn't fit is named in the log and in `meta.props`. The log line `Priority (most picks first): nfl 6, nhl 4, mlb 3` shows the order. A dry run with one extra NBA prop pick planned 12 credits (lines 6, props 6), right at the cap.
- **UI:** the Record tab's "From odds feed" column shows each app's count and average difference; "Total" adds the logged bets. Single-bet pick cards show an "Other apps" line: "cheapest is Kalshi at 48.1¢ (+108), 0.9¢ less than Polymarket US (49¢)" or "none cheaper…". It uses today's rows whose `refs` point at that pick.


### Baseline follows "My platform" (since Oct 19, 2026)

The comparison is made against **the user's own app** (`betdash_prefs.platform`: Polymarket US or Kalshi, or any later `CFG.myPlatforms` entry), all client-side:

- `BetCalc.groupPrices(comparisons)` groups rows per bet and check (`date|market_id|side|fetched_at`) into one price per app:
  - `polymarket_us` = `polymarket_price`
  - `kalshi` = `kalshi_price` (snapshot ask), else the feed's `kalshi` row
  - every other app = its row's `book_chance`
- `BetCalc.compareToBaseline(comparisons, id)` averages "that app minus yours" per app. **A bet with no price from your app is left out of every average**; an app left with nothing shows a dash. `platformSummary(..., baselineId)` uses it.
- Record tab: header "Price vs. <your app>", your app listed first with "Your app (we compare others to this)". With Kalshi picked, Polymarket US becomes a normal row.
- Pick cards: the "Other apps" line names the cheapest app other than yours, compared with your app's price; with no price from your app it says so with a dash (`STR.picks.otherNoBase`).
- Switching "My platform" re-renders Picks, Settings, the bet builder and Record immediately (`setPlatform`).
- `fetch-book-odds.mjs` writes `kalshi_price` on every row from now on. Rows written before that fall back to the feed's Kalshi rows (7 of 12 bets on Oct 19), so a Kalshi baseline covers fewer bets until the next run.
- The top-level `baseline` and `diff` fields stay Polymarket-based for the script's own summary and validator; the app doesn't use them for display.
- Tests: `tests/calc.test.js` ("baseline follows My platform").

## 18. Pick evaluation: "My hit chance", risk label, "My take"

Every pick card (singles, props, parlays, long shots, non-sports) shows an evaluation box above the price stats. Logic: `js/evaluate.js` (`window.PickEval`, also `require()`d by `scripts/update-picks.mjs`). Text: `STR.eval` in `js/strings.js`. CSS: `css/style.css` section 11.

Box contents:
1. **How often it wins:** "Wins about 5 out of 10 times" / "All 3 win about 1 in 4 times" (§25) and a bar colored by risk.
2. **Risk badge**: Good chance / Coin flip / Hard to hit / Very hard to hit (legend "How hard?" shown once above the picks).
3. For combos: a same-game note ("affect each other, this chance already allows for that") or a different-games note.
4. **My take:** a one-line verdict.
5. 🔮 **Prediction line(s):** "My prediction: SF wins 30–17 (66%)", shown only when a game prediction matches (from `sections.predictions` or `data/predictions.json`). There's nothing to show if no predictions exist; never invent one.

### Fields (all optional in picks.json, on every pick type)

| field | type | meaning / default when missing |
|---|---|---|
| `hit_prob` | number 0-100 | estimated true chance the bet wins. Default: singles use `fair`, else `price`. Combos use the product of each leg's `fair` (else `price`). Product assumes independence, so **set it yourself for same-game combos** (correlation) |
| `risk` | `safer` / `coin_flip` / `risky` / `long_shot` | default from `hit_prob` using the thresholds below |
| `verdict` | string, max 120 chars | "My take" line. Default from `action` + edge (rules below) |
| `same_game` | boolean | combos only. Default: true when every leg's `market_id` has the same teams+date (`aec-nfl-was-sf-2026-10-19` style), false when they differ, unset if unknown |
| `prediction_id` | string | id of the game prediction to show on the card. Default: match by the prediction's `game` text appearing in the pick's `event` (same slate date, max 3) |

### Risk thresholds (`RISK_LEVELS` in js/evaluate.js)

| label | hit chance |
|---|---|
| Good chance, key `safer` (green) | 60% or more |
| Coin flip (yellow) | 45% to under 60% |
| Hard to hit, key `risky` (orange) | 25% to under 45% |
| Very hard to hit, key `long_shot` (red) | under 25% |

### Default "My take" rules (`verdictFor`)
- `action` skip: "Skip. Not worth it today." `action` wait: "Wait for the news, then play it small."
- Singles/props/nonsports, by edge (`fair − price`, points): 3 or more = "Good price, I'd play it"; 1 to under 3 = "Fair price, small play only"; under 1 = "Thin price, tiny play or skip".
- Parlays/long shots with `quoted_multiple` and `skip_below`: quoted below skip = "The app pays too little. Skip."; under 5% above skip = "Barely worth it, small play only"; otherwise "Good payout, I'd play it small". With only `skip_below`: "Small bet, only if your app pays enough (see the "Only bet if" line)" (long shots: "Hard to hit. Tiny bet, only if …"; the numbers are on the card's dollar line, §25). With neither, a long shot says "Hard to hit. Tiny bet only." and a parlay says "Fair price, small play only." A single with no edge data also says "Fair price, small play only.".

### Validation and backfill
`update-picks.mjs` validates the fields: hit_prob 0-100, risk enum, verdict string ≤120, same_game boolean, prediction_id string. `picks` fills missing values with `PickEval.fillDefaults` (never overwrites explicit ones) and validates again before writing. `fill` does the same on the existing data/picks.json. The browser also computes defaults at render time, so an unfilled file still shows a full box.

## 19. Build-a-bet filters (js/picker-filters.js + js/picker.js)

A step-by-step panel above the search box. It's a `<details>`, so it folds away on phones; the summary line keeps showing the active filters ("Today · 49ers · Brock Purdy · Player props").

1. **Pick a day:** one chip per snapshot day from today on, plus *All days*. Then sport chips (*All sports*, NFL, MLB, …), listing only sports that play that day.
2. **What kind of bet?** Two checkboxes, each with sub-checkboxes and live counts:
   - **Team bets:** *Who wins* (full-game moneyline), *Spread*, *Total score* (full-game `group: lines`), and *Other game bets* (halves, quarters, periods, innings, first to score, team totals…).
   - **Player props:** buckets built from each prop's `smt` (`football_player_receiving_yards` → `receiving_yards`), first match in `PROP_BUCKETS` wins. The buckets are Yards, Catches, Touchdowns, Passes/carries/interceptions, Fantasy points, Hits/bases/RBIs, Home runs, Strikeouts & pitching, Goals, Assists, Points, Rebounds, 3-pointers, Blocks & steals, Shots & saves, and Other. Only buckets that exist for the chosen day/sport/team are shown. **Add a regex there when Polymarket adds a new stat**; until then it lands in "Other player bets".
3. **Pick a team:** a custom dropdown (logos come from `Teams.badge`) listing every team playing that day (and sport). Team keys look like `nfl:sf`, because the same abbreviation exists in several leagues.
4. **Pick a player:** shown only when Player props is on and a team is picked. It lists that team's players with props that day, using the index's `players: [[name, abbr]]`, so no game file is needed.

**Matching (all must pass):**
- Day and sport.
- Team: the game includes that team. All team bets of that game pass (a total belongs to both teams), but player props pass only for that team's players.
- Player: only that player's props pass, and team bets are hidden.
- Bet type: kind on, and its sub-type not unticked.

Unticked sub-types are stored as a list of *off* keys, so a new bucket is on by default.

**Results (grouped, js/picker-groups.js):** whenever anything is narrowed, or there's search text, results appear as a tree. Every header has a count pill:

```
Game card: both logos, "Commanders @ 49ers", "NFL · Mon Oct 19 · 7:15 PM CT"  (sticky inside the results box)
  🏟️ Game bets (blue)    -> Who wins / Spread / Total score / Other game bets
  🙋 Player props (green) -> one dropdown per stat category (Passing yards, Rushing yards, Catches,
                             Touchdowns, Hits, Strikeouts, Goals scored, Assists, Points, Shots…)
                             -> players (team logo + name) -> their lines, low to high (175+, 200+, 225+)
```

- **Order:** games by start time (with a search, best match first). Game bets come before Player props. Stat categories follow `STAT_ORDER` (most-bet first per sport). Players are sorted A–Z (best match first when searching). Spreads are sorted by the size of the line.
- Reed asked for categories **first**, then players. With a Player filter, the categories stay and hold only that player's lines.
- **Default open/closed** (`defaultOpen`):
  - 25 or fewer results, or a Player filter: everything is open.
  - Games: open with 2 or fewer games, a Team filter, or 40 or fewer results.
  - Sections: open with 60 or fewer results, or a Team filter.
  - Type/category: open with 12 or fewer. A player inside a category: open with 8 or fewer.
- **Open all / Close all** buttons sit in the results header.
- **Speed:** a node's body is only built when it's opened (an NFL game has ~700 bets). Grouping a whole NFL game takes ~15 ms, and "Open all" on 199 props takes ~0.1 s.
- **"Show N more"** is per list (10 at a time). Open/closed state and page sizes are tracked by stable node ids, e.g. `g|<game>|prop|passing_yards|Brock Purdy`.
- `STAT_ORDER` is per sport (football, baseball, hockey, basketball, soccer; sport = the `smt` prefix). Basketball: Points, Rebounds, Assists, 3-pointers made, PRA and other combos, Blocks, Steals. A sport with no order yet falls back to the bucket order.
- Category names are in `STR.calc.f.stats`. An unknown stat is made readable automatically ("shots_blocked" becomes "Shots blocked"). With nothing narrowed and no search, it only shows "N bets for Today…". **Reset filters** goes back to today, all sports, all bets, any team, and clears the search.

**Search fix ("San" showed only game bets):** search rows used to carry both teams' names on every market, so "San" scored all ~700 49ers-game bets the same, main bets got a bonus, and only the top 30 were shown, so no props made the cut. Now a player prop carries only its **own team's** words (nickname, `full` name with city, which the snapshot added on 2026-10-19 because NHL/NBA `name` is only "Sharks", plus abbreviations) plus its stat in plain words and its bucket label. Game bets carry both teams. Results are grouped so props can't be crowded out. Verified: "San" + Player props on 2026-10-19 → 199 props: all 148 of the 49ers player props plus 51 San Jose Sharks props. Ties are sorted by start time, so the 6 PM Sharks game comes first.

**Props in the snapshot:** `fetch-markets.mjs` keeps every open prop that has a price. Dropped props are closed, or have no ask and no bid (nothing to buy). Games 2+ days out often have **no props yet** (Polymarket US posts them about a day before), and the panel says so instead of showing empty boxes.

**Memory:** sessionStorage `betdash_picker_filters` (see §7), cleaned with `PickerFilters.sanitize`. A saved day that's no longer in the snapshot falls back to today.

**Tests:** `node tests/picker-filters.test.js`. tests/smoke.js covers "San" with all bets, then with Player props only (every row must be a 49ers player), plus the team list, the player dropdown, the remembered state after reload, Reset, and no sideways scroll at 390px.

## 20. Game start times on slips and saved bets (js/gametime.js)

Every leg on the slip being built, and on saved bets in My bets (open cards and the settled table), shows its game's start in the viewer's own time zone: `🕒 Mon Oct 19 · 7:08 PM CT · Starts in 2h 5m`.
- The countdown ("Starts in 25 min / 2h 5m / 3 days", or "Started" in yellow) appears only on the slip and on open bets.
- A past start only ever says "Started", never "Final", because the app doesn't know scores.
- Zones show as CT/ET/MT/PT (from CDT/CST, etc.); other zones show as the browser names them.

**Where the time comes from (never invented):**
1. `leg.startTime` (ISO): set by `Picker` when a leg is added from the picker (the event's `start_time`), or from `start_time` on a pick or its leg when loaded from the Picks page, and saved on the bet (storage.js schema).
2. Otherwise, `GameTime.lookup(leg, index)` searches `data/markets/index.json`: first by `eventSlug`, then by a game slug contained in `marketId` (`tsc-mlb-cle-tb-2026-10-19-7pt5` contains `mlb-cle-tb-2026-10-19`). `app.js legStart()` writes the result onto the leg. `backfillBetTimes()` (run after each My bets render) saves it into older bets in localStorage, so the time survives after the game leaves the 4-day snapshot.
3. Typed-in legs and games not in the snapshot show no time.

**Order:** slip legs are sorted earliest game first when a leg is added or a pick is loaded (typed legs stay at the end). Saved bets are displayed in game order; the stored order is unchanged.

**Shared bet log:** `GitHubLog.buildRecord` copies `start_time` per leg only when it is a strict ISO string. Still no other leg fields, and no dollars.

**Tests:** `node tests/gametime.test.js`, the github-log test (strict ISO only), and tests/smoke.js. The smoke test adds an MLB leg plus an NFL leg plus a typed leg and checks the order and times, the saved `startTime`, the shared-log legs, an old bet backfilled by market id, and no sideways scroll at 390px.

## 21. Player positions (js/positions.js, scripts/fetch-positions.mjs, data/positions.json)

**What users see:** a small grey badge after every player's name: `Brock Purdy [QB]`, `Jalen Brunson [PG]`, `Auston Matthews [C]`. Tapping it (or hovering on desktop) shows the full name, e.g. "QB = Quarterback" (`STR.posTip`). It's shown on:
- Build-a-bet prop rows and player group headers, and the Player dropdown, as plain text: "Brock Purdy · QB".
- Slip legs and saved bets (My bets). The leg stores `player`, `playerTeam` and `league`. Older legs have none, so they get no badge.
- Pick cards: after the player's name in the market line, and in front of parlay legs. `fetch-markets.mjs` tags picks/legs with `player`, `player_team` and `league` from the matched market.

**Where positions come from:** ESPN's public APIs (no key).
- Rosters: `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams` and `…/teams/{id}/roster`. These give each league's own codes and names: NFL QB/RB/WR/TE…, NHL C/LW/RW/D/G, MLB **SP/RP**/C/1B…DH (starting vs. relief pitcher comes straight from ESPN).
- **NBA:** the roster only says G/F/C, so the script reads `…/teams/{id}/depthcharts` and uses each player's highest spot there (PG/SG/SF/PF/C). It falls back to the roster code.
- Nothing about positions is hardcoded in the app. Codes and full names travel in `positions.json`. A new league needs one line in `ESPN_PATHS` (and an abbreviation alias in `ABBR` if Polymarket and ESPN differ, e.g. WNBA `gsv` → `gs`). Leagues without a path are listed in `skipped_leagues`.

**Name matching** (`Positions.matchName`; tests in `tests/positions.test.js`). `normName` strips accents (Dončić → doncic), Jr./Sr./II–V, periods and apostrophes (C.J. → cj, De'Aaron → deaaron), and hyphens. Then, accepting only a **unique** hit:
1. same name on the player's team
2. same name anywhere in the league (traded players)
3. first initial + last name on the team ("J. Jennings")
4. short/long first name with the same last name on the team ("Chris" / "Christian")

Anything else gets **no badge**. It's never guessed, and it's listed in `positions.json → unmatched` and in the script output.

**File:** `data/positions.json` = `{schema_version, updated_at, source, leagues:{<league>:{names:{QB:"Quarterback"}, players:{"<polyTeamAbbr>|<normName>":"QB"}}}, stats:{<league>:{players, matched, rate, by:{team, league, initial, nickname}}}, unmatched:{<league>:["Name (abbr)"]}, skipped_leagues:[]}`. It holds only names and positions, no money.

**Refresh:** automatic inside `node scripts/fetch-markets.mjs` (skip with `--no-positions`). It covers every player with a prop in the snapshot, and its counts are in the commit body. Standalone: `node scripts/fetch-positions.mjs [--commit] [--no-push] [--force]`. ESPN responses are cached in `.cache/espn/` (git-ignored) for 20 hours, so a second run the same day is instant. `--force` ignores the cache.

**Match rate on 2026-10-19:** 100% in every league with props: NFL 34/34, NBA 27/27, NHL 71/71, MLB 14/14, WNBA 13/13, soccer (EPL 1, La Liga 3, Serie A 5).

## 22. Payout explainer next to every price (replaced by §25 on Oct 19, 2026)

> The text formats below are history. Since §25, cards and slips say "Bet $10 → get $24.39 back" + "Wins about 4 out of 10 times" instead of `STR.pay.line`. The math (`payout`, `slipPays`, `exStake()`) is unchanged.

Reed didn't know what "Kalshi 41¢" meant, so every price now has a small second line in plain words.

**Math** (`BetCalc.payout(cents, stake)` and `slipPays(stake, multiple)` in js/calc.js, tested in tests/calc.test.js):
- A share costs the price and pays $1 if it wins, so stake ÷ (cents ÷ 100) shares pay that many dollars back (the stake is included).
- The chance is the price read as a percent.
- A slip pays stake × multiple.

**Example stake:** the user's own standard bet (`betdash_profile.unit`), or $10 when it isn't set. It is computed in the browser only (`exStake()` in app.js) and never written to any repo file.

**Formats:**
- `STR.pay.line` "41¢ · $10 pays $24.39 · 41% chance": pick cards (single bets), parlay legs on pick cards, slip leg hints (plus the 1.18x), saved-bet legs.
- `STR.pay.short` "$10 pays $24.39": Build-a-bet Yes/No buttons, Kalshi prices, the "Other apps" line (both prices).
- `STR.pay.slip` "Your $X pays $Y if all legs hit". It appears:
  - on combo pick cards, using the app's quoted payout, else our estimate marked "(at these prices)"
  - under the slip calculator, using the typed stake (else the standard bet) × the typed quote (else the estimate)
  - on open multi-leg bets

The price itself follows the user's chosen display format (cents, American or decimal); the payout and chance are the same in every format.

**"How prices work" (i)** (`STR.tips.howPrices`): shown once per screen. It's in the Picks tab legend row, the Build-a-bet results header and game header, the slip total and the Record compare title.

**Record compare table:** its cells are cent *differences*, not prices, so instead of payout lines it gets a one-line `STR.pay.diffNote` ("+3¢ means that app charges 3¢ more for the same $1 share…") plus the (i).

CSS: §16 `.payx` (12px muted second line), `.slip-pay`, `.pbtn-pay`. Checked at 390px with no sideways scroll.

## 23. Next-day picks and the Today / Tomorrow switcher

Since Oct 19, 2026, `data/picks.json` can hold **more than one game day**. Reed wanted the Oct 20 opening-night NBA slips on the page while the Oct 19 games were still to be played.

- **Schema:** each pick can have an optional `slate_date` (YYYY-MM-DD, the game day in Central time) and `start_time` (ISO, first leg's tip). If `slate_date` is missing, the pick belongs to the file's top-level `slate_date`. Legs can have their own `start_time`. The validator checks the formats; ids must be unique across all days.
- **UI** (app.js `renderPicks`, helpers `pickDays` / `pickDayOf` / `defaultPickDay` / `dayWords`):
  - With more than one day in the file, chips appear above the picks, e.g. "Today, Mon, Oct 19 (7)" and "Tomorrow, Tue, Oct 20 (3)". Every section shows only the selected day.
  - Default: today (CT) if it has picks, else the next day with picks, else the latest.
  - The selection lasts while the page is open.
  - Strings: `STR.picks.dayGroup` / `dayToday` / `dayTomorrow` / `titleTomorrow` / `titleDay`. CSS: `.chips` / `.chip` plus §17 `.pick-days` (wraps, so both days show on a phone).
  - On a day other than the file's own slate, the top `notes` are hidden (they describe that slate) and empty sections are skipped.
  - Pick-card legs with a `start_time` show "🕒 Tue 6:00 PM CT".
- **Writing:**
  - `add-picks <file>` (`{"sections":{"parlays":[...]}}`) appends to the current file. It fills the §18 defaults, validates (including duplicate ids), and commits.
  - `picks <file>` replaces the file but **carries over** existing picks whose day is on or after the new `slate_date`, unless the new file has the same id or the id is passed with `--drop`. `--replace-all` turns this off.
  - Carried picks get an explicit `slate_date`. Picks from earlier days drop off as before.
  - Covered by `tests/update-picks.test.mjs`.
- **Other apps' prices** (§17) are keyed by the file's `slate_date`. Next-day picks get them once their day becomes the slate (the 7 AM run). Predictions are matched by the pick's own day.
- **Oct 20, 2026 example:** ids `2026-10-20-x-safer-nyk-sa-duren`, `2026-10-20-x-balanced-det-cade-wemby` (parlays) and `2026-10-20-l-embiid-lebron-cade-wemby` (longshots).
  - The Oct 20 7 AM run carries them over. It should update them by id with fresh prices, or `--drop` them, and never re-add the same slips under new ids.
  - Pending news to clear: Embiid/LeBron playing (76ers report before 6 PM CT) and Chet Holmgren (quad, day-to-day).

## 24. Reed's standing rules for building picks and slips (Oct 19, 2026)

These apply to every singles, props, parlay and long-shot pick: the daily routine, ad-hoc slip research, and anything written to `data/picks.json`.

1. **Merit only. Overlap with open bets is never a reason to skip.** Don't drop or down-stake a player, prop or game because it's already in Reed's (or anyone's) open slip. Pick legs purely on price vs. sportsbook no-vig, stats and news. Overlap gets **one short FYI line** in the reasoning ("FYI: also in your open 7-pick combo"), nothing more.
   - This replaced an earlier habit: `p-white-td` had been set to skip for overlap alone. It was re-scored on merit (41¢ vs 44%) and is now a small bet.
   - Still leave a player out when the **price** is bad (e.g. Daniels 175+ passing yards, Avalanche ML on Oct 19), and say why.
2. **Mix sports freely.** A slip can combine MLB + NFL + NHL + NBA/WNBA legs whenever that makes the best combination. Don't keep a slip to one sport. Set `sport` to the mix (e.g. `"NFL + MLB"`); `same_game` is false once legs span games.
3. **Rebuilding a slip:** use `add-picks <file> --replace --drop <old-id>` (§8) so the old version is updated or removed, never duplicated. Tonight's slips use stable ids (`x-tonight-safer`, `x-tonight-balanced`, `l-tonight-longshot`); reuse them for later rebuilds the same day.
4. **Slip tier names (Oct 19, 2026).** Title the three daily slips by payout size, in the `market` field: **"Small payout · 3 picks"** (steadiest), **"Medium payout · 3 picks"** and **"Big payout · 4 picks"** (hardest to hit; goes in `longshots`). Change the count to match the legs. Never use "safer / balanced / long shot" in titles. The ids keep their old `safer` / `balanced` / `longshot` words so `--replace` still matches. The combo card shows `market` as its title, and the legs list below says what's in it.
5. **Write reasoning in 2nd-grade words (§25).** No ¢, %, "x" multiples or "books 64.5%" in `reasoning`, `verdict` or `notes`. Say "a bit cheap compared with the big sportsbooks", "they help each other", "all 4 hitting is rare". (No `$` either: the privacy scan rejects it.)

## 25. 2nd-grade money words (Oct 19, 2026)

Reed: the ¢ values and explanations were still too technical, so make them simple enough for a 2nd grader. Helpers live in `js/plain.js` (`window.Plain`, pure, tested in `tests/plain.test.js`); sentences in `STR.plain`; rendering in app.js (`chanceText`, `chanceHtml`, `betGetText`, `appPrices`, `priceLineHtml`, `spreadHtml`, `tapHtml`, `plainLegHtml`); CSS §18.

**Rules (keep them):**
- **Dollars first:** "Bet $10 → get $15.75 back". The amount is the user's standard bet (`exStake()`, else $10), worked out in the browser only.
- **Chance in words, no %:** `chanceWords(p)`. From 30% up it's "Wins about 6 out of 10 times"; below that it's "about 1 in 4" (and from 1 in 10, rounded to 5s: "1 in 20", "1 in 30"); 95%+ is "almost every time". Combos say "All 3 win about 1 in 4 times" / "Both win …". Ten dots (`●●●●●●○○○○`) show it at a glance.
- **No cents on screen (updated Oct 19, 2026, §29).** ~~Cents once, small: "Price on <My platform>: 63.5¢".~~ Another app shows only when it's cheaper: "Cheaper on Kalshi (63¢)" (`appPrices`: pick/leg `price` = Polymarket US, `kalshi_price` = Kalshi, plus book-odds rows for singles). With Kalshi as My platform, the Kalshi price leads.
- **No "tap" in titles:** `splitTap()` cuts `(tap "Guardians +1.5")` and `— YES` / `— NO (4 or fewer)` off the title. The card then shows a separate "👉 Tap: Guardians +1.5" / "Tap: No (4 or fewer)" line. Keep writing leg `desc` with those markers; the app does the split.
- **Spreads explained:** `spreadNote()` gives "+1.5 = they win, or lose by just 1 run" (MLB runs, NHL goals, otherwise points) and "-1.5 = they must win by 2 runs or more". It ignores "1+ hits" props.
- **Combo cards (no tiles):** "If all 3 win: your $5 turns into $23.40" (suggested stake = `stake_units` × the user's standard bet, × the app quote, else our estimate), then "Only bet if the app says your $5 pays at least $21.30" (stake × `skip_below`).
- **Single cards:** "Bet $10 → get $X back", then a deal word from the edge (≥1¢ "Good deal", over −1¢ "Fair price", else "A bit pricey"), then the price line.
- **Risk labels:** Good chance / Coin flip / Hard to hit / Very hard to hit (same keys and thresholds in picks.json). The legend reads "6+ out of 10 … less than 1 in 4".
- **Verdicts carry no numbers:** "Small bet, only if your app pays enough (see the "Only bet if" line)." The dollar line on the card gives the number.
- **Build a bet:** the buttons show "$10 → $15.75" in bold, the cents small below, and Kalshi only when cheaper. Slip legs: "Bet $10 → get … back · Wins about 6 out of 10 times", plus "Cheaper on Kalshi" when it beats the typed price. Total: "If all 3 win: your $10 turns into …" plus the chance sentence. The quote field is "What your app says it pays (type it in)".
- **My bets:** "If all 3 win: your $5 turns into $X" plus the chance sentence. Settled rows say "If it wins you get $X back" (no "2.97x").
- **Record:** the price-difference cells say "3¢ more" / "0.2¢ less" / "same" (`STR.record.diffMore/diffLess/diffSame`).
- **Tips (ⓘ):** kid words ("The price is like the cost of a ticket. If you're right, every ticket turns into $1…"). New tips must follow the same style.

Checked at 390px with no sideways scroll (tests/smoke.js prints `"%" or "x" left in money lines: 0`).


## 26. American odds and "Vegas" numbers on the small price line (Oct 19, 2026)

Reed wanted the +/- number next to the cents, e.g. `44¢ (+127)`, and real sportsbook odds where they exist.

> **Update (§29):** cents are no longer shown at all. The small line is now "Vegas +133 (Bovada)" when real, else the app's own price as +/- ("Polymarket US price: +127", Build a Bet just "+127").

**Always shown (client-side math, js/vegas.js `americanOf`, tested in tests/vegas.test.js):** the user's own app price, converted: under 50¢ = +round(100×(100−p)/p), 50¢ and up = −round(100×p/(100−p)); 50¢ shows as +100. It appears on the small price line of Build a Bet Yes/No buttons, single pick cards ("Price on Polymarket US: 63.5¢ (-174)"), combo legs and slip legs. Cents always come with it, whatever price format the user chose.

**Shown only when real: "Vegas: +120 (DraftKings)"** = the best American price among our books (FanDuel, DraftKings, BetMGM, Bovada, ESPN Bet, ...; Kalshi is a prediction market and is left out) for the exact same side, from `data/vegas-lines.json` (`{updated_at, lines:{"<market_id>|yes|no": {p, b, n}}}`, n = books that priced it). No entry (alt lines, props that weren't fetched, books that don't post it) = nothing shown. Never guessed. Entries older than 36h are hidden (`Vegas.lookup`).

**How the file is made:** `scripts/fetch-book-odds.mjs` (same daily run, same `--max-credits 12` cap, same key rules). After the pick lines are planned it **widens each sport's one `/odds` call to all 3 game-line markets** (h2h, spreads, totals; sports with the most games first, only while it fits the cap) and matches **every full-game moneyline/spread/total** of every game in the snapshot (`FULL_GAME` regex; period, half, quarter, first-5 and team-total markets are skipped because the books' featured markets are full-game only). That runs BEFORE player props, so a tight cap now trims props first (pick prop Vegas numbers and Record prop rows only appear when they fit; rows from earlier runs the same day are kept for markets not re-priced). Cost: 3 credits per sport per run (NFL, MLB, NHL, NBA = 12; WNBA is skipped by the cap). The Odds API only posts the main puck line / spread / total, so alt lines show cents + American but no Vegas line.

**ⓘ tip** `STR.tips.americanOdds` ("+127 means a $100 bet wins $127. −150 means you bet $150 to win $100...") sits in the Build a Bet results and game headers, on single cards, the first leg of each combo, and the slip leg price line. CSS §19.

## 27. Hand-read sportsbook odds (Bovada props): data/vegas-manual.json

The Odds API run (§26) spends its 12 credits on game lines, so most player props have no "Vegas" number. Fill the gap by reading odds by hand and ingesting them:

1. **Daily routine step (after fetch-markets + update-picks):** open bovada.lv, and for the games with picks, read the props that match Polymarket markets: player, stat, line, both sides where shown. Write them to `data/manual-odds/<date>-bovada.json`:
   ```json
   { "book": "bovada", "read_at": "2026-10-19T17:40:00Z", "source": "bovada-manual",
     "entries": [
       { "game": "nfl-was-sf-2026-10-19", "player": "Brock Purdy", "stat": "football_player_interceptions_thrown", "ou": 0.5, "over": "+110", "under": "-145" },
       { "game": "nhl-sj-tor-2026-10-19", "player": "Auston Matthews", "stat": "hockey_player_goals", "plus": 1, "yes": "+115" } ] }
   ```
   `game` = snapshot event slug, `stat` = the snapshot `smt`. Use `ou` for an over/under line (X.5) and `plus` for "N+" / anytime markets.
2. **Ingest:** `node scripts/ingest-vegas.mjs data/manual-odds/<date>-bovada.json [--dry-run] [--commit]`. It writes `data/vegas-manual.json`: same shape as vegas-lines.json plus per-entry `at` and `src: "bovada-manual"`.
3. **Exact matches only.** Polymarket "N+" = Over N−0.5, so o0.5 matches 1+, o252.5 matches only a 253+ market (none exist: Polymarket's passing yards are in 25s, so most Bovada yardage lines and alts don't match and are reported "unmatched"). Alt lines are separate entries and match when Polymarket has that exact line. Over → Yes side, under → No side. **Yes-only** markets (anytime TD/goal, one-way "1+ points") get no No price. Names ignore accents. Bad odds or a non-.5 o/u line are skipped. Nothing is ever guessed.
4. **In the app:** js/vegas.js loads both files. Each entry is hidden after 36h (by its own `at`), and when both files price a side the bigger payout is shown, e.g. "Vegas: +110 (Bovada)". Re-ingesting replaces the same keys and drops entries older than 36h.

Tests: tests/ingest-vegas.test.mjs (matching), tests/vegas.test.js (two-file lookup). Oct 19, 2026 first read: 60 entries, 37 sides matched (NHL points/assists/goal, Purdy/Daniels INT and pass TDs, Purdy 20+ rush yds, McCaffrey 5+ receptions, anytime TDs, Ramírez/Caminero hits/HR/RBI/total bases).

## 28. Fade Trent tab (data/trent-picks.json, js/trent.js, scripts/trent-picks.mjs)

Tracks the betting picks @BookitWithTrent (X user id **66287704**) posts, graded on real final scores, plus what fading him (betting the other side) would have done. Tab: 🙃 "Fade Trent" (app.js `renderTrent`, `STR.trent`, CSS §20).

**Daily routine step:**
1. Read his new posts with the x MCP tools: `get_users_posts` `{id: "66287704", max_results: 25, exclude: "retweets", since_id: <newest id already read>}` (page with `pagination_token`). `search_posts_all` (`from:BookitWithTrent since:YYYY-MM-DD`) works too.
2. Keep **only picks he wrote out in the text**: league, game, pick, odds and units if stated, post time, post link (`https://x.com/BookitWithTrent/status/<id>`). One post with two picks = two rows (`<id>-tb`, `<id>-nd`). Pick only in an image (PrizePicks lineups, "Saints ❌", "Surgical Six"), or bet type unclear (e.g. "jake ferguson +1600") → skip, or add with `unclear: true` (stays pending, never counted). Never invent a pick or a line.
3. `node scripts/trent-picks.mjs add new.json --read-through <newest post time>` merges by id (graded rows are never overwritten).
4. For finished games, look up the **real final** (ESPN / MLB.com / AP) and run `node scripts/trent-picks.mjs grade <id> win|loss|push --score "Packers 23, Cowboys 13" --source <url>`. Postponed = push, note "no action". Grade on the final even if his own ✅/❌ post disagrees (Broncos +2.5 on Oct 15 is an example), and say so in `note`.
5. `node scripts/trent-picks.mjs summary`, then commit (`--commit`). `validate` runs on every save.

**Tweet links ("View on X" button, Oct 19, 2026):** every pick stores `post_id` (the real X post id from the x tools, never made up) and `url` = `https://x.com/BookitWithTrent/status/<post_id>` (`Trent.postUrl`). `add` always builds the link itself from `post_id`, the row id (`<postid>` or `<postid>-tb`) or a given url, and skips any row with no real id. `validate` and tests/trent.test.js fail if a link doesn't match its id. Each card shows a full-width "View on X ↗" button (x.com links open the X app on phones).

**Math (js/trent.js, tests/trent.test.js):** "5u" = 5 units risked. Wins at his stated odds; spreads/totals with no odds use the standard -110 (counted in "assumed"); moneylines with no odds get no unit result. Win % leaves pushes out. Fade = flipped result; fade units only for spreads/totals at -110 (a moneyline's other-side price isn't known).

**First read (Oct 19, 2026, posts Oct 14–19):** 11 picks found (8 graded, 1 pending, 2 unclear). His record 5-2-1 (71.4%), +7.91u. Fading him: 2-5-1.

## 29. No cents anywhere on screen (Oct 19, 2026)

Reed: drop the Polymarket/Kalshi cent values. Cents stay **internal** (picks.json, calc, book-odds), but the UI shows only:
- dollars: "10 dollars → 22.73 back" (money sign in the UI) / "Bet 10 → get 22.73 back";
- odds: the real **Vegas** number when we have one ("Vegas +133 (Bovada)"), else the app's own price as American odds ("+127" on Build a Bet, "Polymarket US price: +127" on cards and slip legs). "Cheaper on Kalshi (+138)" also uses odds.
- `fmtP` never returns cents (decimal if the user picked it, else American); the Settings "Cents" option is gone and the default is American (`storage.js`).
- Record: price differences say "pays a bit less / pays less / pays a lot less / pays more / same" (under 2¢, 2–5¢, over 5¢ internally).
- Pick text: `Plain.noCents()` turns any "41¢" in reasoning/notes/news into "+144" as a safety net, but **write picks.json text and the daily digest without cents** (dollars + American odds).
- Tips (howPrices, price, fair, advantage, colDiff, americanOdds) are rewritten without cents. tests/smoke.js checks that no "¢" is visible on Picks, Build a Bet and Record.

## 30. NBA is a first-class sport (audit Oct 19, 2026)

**One list:** `APP_CONFIG.sports` in config.js (`NFL, MLB, NHL, NBA, WNBA, Soccer`) is "our sports" and their display order. Build a Bet's sport chips and the **new Picks-tab sport chips** (shown when a day has picks from 2+ sports; a combo like "NBA + NFL" shows under each) both read it. `tests/sports.test.mjs` fails if a sport in that list is missing from `MarketsCore.LEAGUES`, the Kalshi series map (fetch-markets.mjs), the Odds API `SPORT_KEYS` (fetch-book-odds.mjs), team logos (`teams.js ESPN_LEAGUES`) or positions (fetch-positions.mjs). To add a sport: add it to config.js, then make that test pass.

**Audit result:** NBA was already wired into markets, Kalshi, Vegas odds, logos, positions, picks validation (free-text `sport`) and spread wording (default "points"). What was missing: no shared sport list (Build a Bet had its own hard-coded order), no sport filter on Picks, and **no NBA singles, props or game predictions**, only 3 NBA combo slips for Oct 20. No NBA games on Oct 19.

**Daily routine:** treat NBA like MLB/NFL/NHL: game predictions (`add-predictions`), singles and props judged on merit against Vegas fair (`data/book-odds.json`, `data/vegas-lines.json`), NBA legs in mixed slips. Run fetch-book-odds as usual (the cap ranks sports by picks, so NBA gets lines once it has picks).

**First NBA picks (Oct 20 opening night, Polymarket US prices at 1:41 PM CT):** Celtics @ Pistons Under 221.5 (0.25u), Joel Embiid 25+ points (0.5u), Cade Cunningham 25+ points (0.5u), LeBron James under 15 points (0.25u); predictions DET 51, NY 64, SA 56. All are "Fair price, small play only" (edges about 1.5 to 2.6 points vs the books).

## 31. Live line-movement checker (scripts/live-watch.mjs, Oct 19, 2026)
Trial for WAS @ SF (nfl-was-sf-2026-10-19). Compares Polymarket US live prices to their own
pregame open (free API, no Odds API credits).
- `node scripts/live-watch.mjs snapshot [--slug <event-slug>]` saves opening mids for moneyline,
  main spread/total (line nearest 50%) and liquid props for key players (`--players`) to
  `/workspace/live/<tag>-open.json` (outside repo; prices only, no dollars).
- `node scripts/live-watch.mjs check` prints only moves of 10+ pts from open (`--open-move`) or 6+
  since last check (`--step-move`); state in `<tag>-last.json`. Skips closed/paused markets and
  thin ones (bid/ask gap > 6 pts, or <4% / >96%). Shows the side that got cheaper in American
  odds + "$10 pays $X" + event link. No cents.
- `--dir` overrides the working folder (handy for simulated tests).
- Oct 19, 2026: tests added. `node --test tests/live-watch.test.mjs` runs on TEST DATA (made-up prices) in tests/fixtures/live-watch-sample.json. The script now exports its pure helpers plus `findMoves()` and only runs the CLI when executed directly.
- Oct 19, 2026: side and sign fix. Alerts name the side that got cheaper based on the move that fired (open or step), signs are from that side's view (negative = cheaper), and snapshots store each side's buy price so open and now are both buy prices. Old snapshots fall back to the mid.
- Oct 19, 2026: watch mode. `node scripts/live-watch.mjs watch [--every 150] [--max-checks 200]` runs check in a loop, stops when the game ends, keeps going after a failed check, and appends alerts to data/live/<slug>-alerts.json (side, kind, American odds, chance points; no dollar figures). The script writes this file but doesn't commit it.
- Oct 19, 2026: per-sport mapping and dated file names. `SPORTS` maps nfl/nba/wnba/nhl/mlb slugs to their real gateway market types (checked against live events that day). The default player list applies only to the WAS @ SF trial; other games need `--players` to watch props. Snapshot files are now `<teams>-<date>-open.json`/`-last.json` (e.g. was-sf-2026-10-19-open.json), so an old `was-sf-open.json` has to be re-snapshotted or renamed.

### Requests for Reed's bot
- (live-watch, Oct 19, 2026) Optional: show a small "Live price moves" list for a game from `data/live/<slug>-alerts.json` (side, open → now American odds, "$10 pays $X" worked out from `now_chance`). Fields are in §31.

## 32. Live Bets: Richie's area (Oct 19, 2026)

The Picks tab has a two-option toggle at the top: **"Today's Picks" | "Live Bets 🔴"**. It is remembered in localStorage (`betdash_prefs.picksView`) and linkable: `#picks` opens Today's Picks, `#live` opens Live Bets. The bottom-bar Picks button reopens whichever view was used last.

**Richie owns the Live Bets view.** Reed's bot does not edit these:
- `js/live-bets.js`: the view. Today it is a placeholder ("Live bets coming soon", text in `STR.live.soon`).
- `css/live-bets.css`: its styles. Scope every rule under `.live-bets-root`.
- `scripts/live-*` (e.g. `scripts/live-watch.mjs`, §31) and its tests (`tests/live-watch.test.mjs`, `tests/fixtures/live-watch-sample.json`).
- `data/live/`: any data the view reads (e.g. alerts written by live-watch).

**Richie should avoid** (Reed's bot's files; ask in a "Requests for Reed's bot" note instead): `js/app.js`, `js/strings.js` (except adding keys under `STR.live`), `css/style.css`, `index.html`, `config.js`, `js/storage.js`, `data/picks.json`, `data/predictions.json`, `data/markets/`, `data/book-odds.json`, `data/vegas-*.json`, `data/trent-picks.json`, and the other `scripts/*.mjs`.

**The tie-in (all of it):**
- `index.html` loads `css/live-bets.css` and `js/live-bets.js` (before app.js).
- `js/app.js renderPicks()` draws the toggle. For the Live view it creates an empty `<div id="live-bets-root" class="live-bets-root">` and calls `window.LiveBets.render(root)`. That's the whole contract.
- The toggle styles are in `css/style.css` §21. The labels are `STR.live.today` / `STR.live.live`.

**How to wire data in:**
1. Have a script under `scripts/live-*` write a JSON file under `data/live/` (e.g. `data/live/alerts.json`), and commit only that file.
2. In `LiveBets.render(root)`, `fetch('data/live/alerts.json?ts=' + Date.now())` and draw into `root`.
3. Escape all text from data (set `textContent`, or use `esc()`-style escaping), and only allow `https:` links.
4. `render` is called fresh each time the view opens, with a new `root`. If you auto-refresh, stop when `!root.isConnected`.

**Site rules still apply:**
- American odds only, no cents.
- "$10 pays $X" is worked out in the browser.
- No dollar amounts, stakes, bankrolls or keys in committed files.
- 2nd-grade wording, phone-friendly at 390px (no sideways scroll).

## 33. Live Bets data: edges vs open (Richie, Oct 19, 2026)
- `node scripts/live-watch.mjs publish [--slug nfl-was-sf-2026-10-19]` writes `data/live/<slug>.json` for the Live Bets view. An **edge** is a side whose live buy price is cheaper than its opening buy price: **big** = 10+ points cheaper, **slight** = 4-9. Wide-gap (> 6 pts) and extreme (< 4% / > 96%) markets are skipped.
- File: `slug, game, url, start_time, status (pregame|live|final), updated, open_taken_at, thresholds, open[] (opening buy prices per market), edges[]`. Each edge has `side, market, question, open_odds, now_odds` (American), `open_chance, now_chance` (points), `edge, tier, first_seen` and `status` (`open`, or `gone` once it drops below 4 points). There are no dollar figures in the file; the page works out "$10 pays $X" from `now_chance`.
- The opening prices are kept inside the published file, so later `publish` runs on any machine reuse the same open (no local snapshot needed). Opening snapshot for WAS @ SF: real gateway prices taken Oct 19, 2026, 2:57 PM CT, pregame (kickoff 7:15 PM CT), 119 markets.
- View (Oct 19, 2026): `js/live-bets.js` draws only inside `#live-bets-root`. It fetches `data/live/nfl-was-sf-2026-10-19.json` right away and then about every 60s, and stops once the view is closed. It shows game status (pregame/live/final with kickoff in CT), then edges sorted big to small (gone ones last and dimmed): side, market, American odds + "$10 pays $X" (worked out in the browser), edge points, opening odds, first-seen time, and a Polymarket link (https only). With no edges it shows "No edges yet" and the pregame note. All text goes in through textContent. Styles are in `css/live-bets.css`, all under `.live-bets-root`. Tests: `node tests/live-bets.test.js` (helpers + the real data file's shape: no `$`, no `¢`). The game slug is the `SLUG` constant at the top of js/live-bets.js; change it for the next game.
- Formatting fix (Oct 19, 2026): "$10 pays $X" is whole dollars rounded down (40 → $25, 30 → $33, never cents) in both `live-watch.mjs pays()` and `live-bets.js pays10()`. Even odds (50) show as **+100**, not -100.
- More game lines (Oct 19, 2026): the snapshot now covers every liquid **game line** on the gateway: moneyline, main + alt full-game spreads and totals, team totals, and 1st/2nd half and Q1–Q4 winners, spreads and totals. That's 277 game lines vs 116 props (before: 3 vs 117). Each market and edge carries `group` (`game` | `prop`), plus `mtype`, `period`, `line`, `teams` (team each side is for) and `player` (props). Re-snapshotted at 3:2x PM CT, pregame, real prices.
- Why-it-moved rules (Oct 19, 2026): `scripts/live-context.mjs`. Each `publish` also fetches ESPN's free public API (scoreboard to find the game, then `summary?event=401873008`) and stores `game_context`: score, period, clock, possession, `game_state` (pre/in/post), the pregame injury report, in-game injuries parsed from play-by-play text, and team stat leaders. Every edge gets `class` = `edge` (real; slight 4-9, big 10-24) | `score` | `injury` | `news` (25+ pts unexplained) | `unverified` (ESPN fetch failed). It also gets a `reason` and a one-line `context` ("WSH down 7, Q2 9:14, no key injuries"). The score rules are a simple heuristic, documented at the top of the file: trailing moneyline, a spread not covering now, totals vs pace (pace = line × share of game played), and half/quarter lines once that period starts. Props are only explained by injuries (we don't read player stats). Tests: `node --test tests/live-context.test.mjs` (test data shaped like ESPN). ESPN team codes: WAS is `WSH`. Note for /workspace/live-loop.sh: game state is stored as `game_state`, so its `"status": "final"` grep still only matches the top-level status.
- Opening prices are never overwritten (Oct 19, 2026): `snapshot` now **merges**. Markets already in the open keep their price and `taken_at`, new markets are added with their own `taken_at`, and markets that went thin are kept. Each `open[]` entry in the site file has `taken_at`. Repair: the 3:2x PM re-snapshot above had replaced the 2:57 PM prices. I restored them from commit 09bc33f, so the 119 original markets (3 lines + 116 props) are at 2:57 PM CT (19:57 UTC) and the 275 added game lines are at 3:23 PM CT (20:23 UTC). All are real pregame gateway prices.
- View update (Oct 19, 2026): the header shows the ESPN score and clock ("WSH 10 – SF 17", "Q2 9:14 · WSH ball"; pregame shows the kickoff time; if ESPN fails it says "Game info unavailable"). Real and unverified edges are split into **Game lines** and **Player props** (stacked on phones, side by side at 760px+), each sorted big to small and capped at 5 (`CAP`) with "Show N more". Score, injury and likely-news moves go in a collapsed **"Moved for a reason"** section, with the reason. Every card has a one-line context. Pure helpers `groupEdges()` and `scoreboard()` are tested in tests/live-bets.test.js.
- Injuries are internal only (Oct 19, 2026, Richie): injury data still decides whether an edge is real. An edge with `class: 'injury'` (prop player out/questionable/IR or hurt in-game and not back, or that team's QB/key starter out) is **dropped from the view**. There's no injury label, section or card text. Card context is score + clock only ("WSH down 7, Q2 9:14", or "Pregame"). "Moved for a reason" shows only `score` and `news` items.
- Alerts feed (Oct 19, 2026): `publish` keeps `alerts` (newest first, last 50) and `alert_seen` (ids already alerted) **inside the same data/live/<slug>.json**, so /workspace/live-loop.sh needs no change. Events, each sent once: `new_edge` (and again if slight moves up to big), `gone`, `news` (25+ pts, likely news) and `removed` (a shown edge now explained by injury, worded only as "removed from list"). There are no alerts before kickoff. Entries hold the time, a plain sentence, side, market, American odds, chance and link. No dollar figures; the page works out "$10 pays $X". `liveAlerts()` is tested in tests/live-watch.test.mjs.
- Odds limit (Oct 19, 2026, Richie): `ODDS_LIMIT = 500` in scripts/live-watch.mjs. Any side whose **current** price is longer than +500 or shorter than -500 (chance under 16.7% or over 83.3%) is not tracked anywhere: no edge, no alert, no "Moved for a reason" item. An edge or alert that crosses the limit later is dropped quietly (no "gone" alert, and its old alert is removed). js/live-bets.js applies the same limit as a safety net (`inLimit`). Tests are in both test files.
- Alerts box (Oct 19, 2026): the top of the Live Bets view shows the `alerts` feed newest first (scrolls past about 3 on phones). Each entry has the CT time, a plain sentence, American odds + "$10 pays $X" (whole dollars) for new edges and news, and a link. Entries newer than the viewer's previous refresh are highlighted "NEW". Last seen is kept in localStorage `liveBets.alertsSeen.<slug>`, and a first visit highlights nothing. Empty state: "No alerts yet. They'll show up here once the game starts." The same +500 / -500 filter applies to the edge lists, Moved for a reason and the Alerts box.
