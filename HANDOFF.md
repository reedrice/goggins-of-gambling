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
css/style.css         dark mobile-first theme (sections 1-13; 13 = leg start times; 9 = picker/logos/toggle/tooltips, 10 = Record compare table, 11 = pick evaluation box, 12 = Build-a-bet filter panel)
js/strings.js         all UI text (plain-language rules in its header)
js/calc.js            odds and parlay math (pure)
js/evaluate.js        per-pick hit chance, risk label, "My take" verdict, prediction lookup (browser + Node, §18)
js/storage.js         localStorage schema and access
js/gametime.js        game start times on slip legs / saved bets: format, countdown, snapshot lookup, sort (browser + Node, §20)
js/teams.js           team logos: Polymarket logo -> ESPN CDN -> colored circle; ESPN abbreviation fixes
js/markets-core.js    Polymarket US event/market compaction + labels (browser + Node)
js/picker-filters.js  Build-a-bet filter rules: day/sport, bet types + sub-types, team, player (browser + Node, §19)
js/picker.js          market picker UI (filter panel, search, browse) + live Polymarket US fetches
js/github-log.js      shared log writer (GitHub REST contents API)
js/app.js             UI controller
data/markets/index.json         snapshot: list of upcoming games (small, loaded first)
data/markets/events/<slug>.json snapshot: every market of one game (lazy-loaded)
data/picks.json       today's picks (overwritten daily by the job)
data/predictions.json game predictions and grades (appended by the job)
data/bet-log.json     shared calibration log (written by the app with users' tokens)
data/book-odds.json   automatic per-app price comparisons (The Odds API, written daily by fetch-book-odds.mjs, §17)
tests/calc.test.js        node: math
tests/gametime.test.js    node: start-time format (CT/ET), hints, lookup, leg order
tests/evaluate.test.js    node: hit chance / risk / verdict defaults (js/evaluate.js)
tests/picker-filters.test.js node: filter tree rules (js/picker-filters.js)
tests/github-log.test.js  node: log writer against a mocked API
tests/smoke.js            headless Chrome UI walk-through (puppeteer-core, --no-save)
scripts/update-picks.mjs  daily-job CLI: validate, write, commit, and push picks/predictions
scripts/fetch-markets.mjs daily-job CLI: refresh data/markets from Polymarket US + match Kalshi, enrich picks.json
scripts/fetch-book-odds.mjs daily-job CLI: other apps' prices for today's picks (The Odds API, ODDS_API_KEY) -> data/book-odds.json
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
node scripts/update-picks.mjs fill                         # backfill missing hit_prob/risk/verdict/same_game in data/picks.json, commit, push
node scripts/update-picks.mjs add-predictions /tmp/p.json  # append [{id,date,sport,game,pick,win_prob,projected_score?,...}]
node scripts/update-picks.mjs grade /tmp/grades.json       # [{id, result: win|loss|push, final_score?}]
node scripts/update-picks.mjs grade <id> win "SF 30 – WAS 17"
# flags: --dry-run (validate + print the commit, write nothing), --no-push, -m "extra body line"
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
1. Build the new slate in the `picks.json` schema. Use **units, not dollars**, and the platform's actual ask prices (Reed's app is **Polymarket US**, a different exchange from polymarket.com). Set `verify_note` whenever a price came from somewhere else. Set `updated_at` to now (UTC is fine; the UI shows CT).
2. `grade` yesterday's predictions.
3. `add-predictions` today's game predictions (`result` defaults to `pending`; ids like `2026-10-20-was-sf`).
4. `picks` the new slate. Fill in `hit_prob` (your real estimated chance, especially for same-game parlays), and `verdict`/`prediction_id` when you have something better than the defaults; anything missing is computed and written for you (§18). Pages redeploys in about a minute, and the app cache-busts its fetches.
5. `node scripts/fetch-markets.mjs --commit` (see §13). Run it **after** step 4 so the new picks get Polymarket/Kalshi links and Kalshi prices.
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
- `data/markets/index.json`: `{schema_version, updated_at, source, dates[], events:[{id, slug, sport, league, title, start_time, date (CT), url, polymarket_url, kalshi_url, teams:[{abbr, display, name, short, full (name with city, for search), logo, color}], market_count, players:[[name, teamAbbr]], file}]}`.
- `data/markets/events/<slug>.json`: the same event plus `markets:[{id (market slug), type (moneyline|spread|total|prop|other), group (lines|props|other), smt, label, line, side_yes_label, side_no_label, yes_ask, yes_bid, no_cost (cents), player?, team?, kalshi?:{ticker, yes, no}}]`.

**Refreshing it:**
```bash
node scripts/fetch-markets.mjs --commit          # next 4 days, match Kalshi, enrich picks.json, commit + push
#   --days N   --no-kalshi   --no-push   (no --commit = write files only)
```
Takes 30-60s. It covers NFL, MLB, NHL, NBA, WNBA and the main soccer leagues (`MarketsCore.LEAGUES`), deletes event files for games that dropped out, and never writes dollars. Run it daily after the picks update; running it again later in the day just makes the snapshot fresher.

## 14. "I bet on" platform and Kalshi links

`betdash_prefs.platform` decides where every **Open** button goes:
- **Polymarket US:** `polymarket_url` (`https://polymarket.us/sports/{league}/{event slug}`).
- **Kalshi:** `fetch-markets.mjs` matches each game through the public API `https://api.elections.kalshi.com/trade-api/v2` (event tickers like `KXNFLGAME-26OCT19WASSF`; MLB adds the start time, `KXMLBGAME-26OCT192008CLETB`; sibling series such as `KXNFLSPREAD`, `KXNFLTOTAL`, `KXNFLPASSINT` share the suffix). Markets match by team code (who wins), favorite + `floor_strike` (spreads), `floor_strike` (totals), and player name + `floor_strike = line − 0.5` (props). Series and team-code tables are `KALSHI_SERIES` and `KALSHI_ALIASES` in the script.
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

All UI text lives in `js/strings.js`, grouped by screen and commented. Rules (also in its header): no jargon (EV, implied probability, vig, no-vig, correlation, edge, units, multiple, independent). Use "Chance to win", "Fair price", "Your price advantage", "Payout (how many times your money)", "Picks that affect each other", "Expected profit per $10 bet, on average over time". Anything that needs more explanation gets an (i) button: add the text to `STR.tips` and render `tip('key')`. Sizes show as dollars ("$5.00 (half your standard bet)"); `units` stay in `picks.json` only. Pick text in `picks.json` (reasoning, notes) should follow the same rules.

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
| **Price vs. Polymarket** | same | average `diff` in cents, e.g. `+3.2¢` (red = that app charges more) |
| **Total** | both | logged count + feed count |

Feed status notes sit next to the app name, not in a cell: "We compare other apps to this one" (Polymarket US, the baseline), "Needs a paid odds plan" (`oddsApiPaid`, no rows), "Not in the odds feed" (`oddsApi: null`, bet365), and "Coming soon, waiting on odds feed" (whenever `status` isn't `"active"`).

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
- **Matching** is documented in the script header: game by both team names within 36h; h2h by team; spreads by team + signed line from the side label; totals by Over/Under + line; props by player name, with Polymarket "N+" = Over N−0.5 and anytime TD/goal = "Yes". Prop types are mapped in `PROP_MARKETS`, and sports in `SPORT_KEYS` (NBA/WNBA are ready, but only called when a pick needs them).
- **UI:** the Record tab's "From odds feed" column shows each app's count and average difference; "Total" adds the logged bets. Single-bet pick cards show an "Other apps" line: "cheapest is Kalshi at 48.1¢ (+108), 0.9¢ less than Polymarket US (49¢)" or "none cheaper…". It uses today's rows whose `refs` point at that pick.

## 18. Pick evaluation: "My hit chance", risk label, "My take"

Every pick card (singles, props, parlays, long shots, non-sports) shows an evaluation box above the price stats. Logic: `js/evaluate.js` (`window.PickEval`, also `require()`d by `scripts/update-picks.mjs`). Text: `STR.eval` in `js/strings.js`. CSS: `css/style.css` section 11.

Box contents:
1. **My hit chance:** a % and a bar colored by risk.
2. **Risk badge** (legend "How risky?" shown once above the picks).
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
| Safer (green) | 60% or more |
| Coin flip (yellow) | 45% to under 60% |
| Risky (orange) | 25% to under 45% |
| Long shot (red) | under 25% |

### Default "My take" rules (`verdictFor`)
- `action` skip: "Skip. Not worth it today." `action` wait: "Wait for the news, then play it small."
- Singles/props/nonsports, by edge (`fair − price`, points): 3 or more = "Good price, I'd play it"; 1 to under 3 = "Fair price, small play only"; under 1 = "Thin price, tiny play or skip".
- Parlays/long shots with `quoted_multiple` and `skip_below`: quoted below skip = "The app pays too little. Skip."; under 5% above skip = "Barely worth it, small play only"; otherwise "Good payout, I'd play it small". With only `skip_below`: "Play it only if the app pays at least Nx" (long shots: "Long shot. Tiny play, only if the app pays Nx or more"). With neither, a long shot says "Long shot. Tiny play only." and a parlay says "Fair price, small play only." A single with no edge data also says "Fair price, small play only.".

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

**Results:** whenever anything is narrowed, or there's search text, the list shows "N bets match" with two groups, *Game bets* and *Player props*, each with its own count and 20 rows at a time plus "Show N more". With nothing narrowed and no search, it only shows "N bets for Today…". **Reset filters** goes back to today, all sports, all bets, any team, and clears the search.

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
