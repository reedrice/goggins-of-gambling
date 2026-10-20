# HANDOFF: guide for maintainers and AI agents

> Agents: start with [AGENTS.md](AGENTS.md) (rules, run/test/deploy), [DESIGN.md](DESIGN.md) and [STATUS.md](STATUS.md). This file is the detailed log.

> Product direction, tiers and the legal checklist: see [ROADMAP.md](ROADMAP.md).

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
- **Analyzer, not pick seller (Reed, Oct 20, §54):** never write instructions or sizes in any text: no `tap "Yes"/"No"`, no `— tap …`, no "Suggested bet", no "tiny/small bet", "play it small", "bet it", "skip it", "I'd play". Write information: the chance, and the price read ("Price looks fair vs Vegas", "Good price compared with what it should be", "No edge now"). `stake_units` stays as an internal field for Record units, but it's never shown as advice. The validator rejects instruction text.
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
4b. **Lottery tickets (§44):** optionally fill `sections.lottery` with 3-4 huge combos (about 7, 10, 14 and 19 legs) from the most likely, fair-or-better legs (65%+ preferred, favorites' moneylines, unders, props), mixing sports, with no conflicting legs and nothing that works against another pick on the page. `market` = "Lottery ticket · N picks", `stake_units` 0.1 max, `risk` long_shot, `hit_prob` = product of leg fair %. Polymarket US combos max out at 10 legs, so say to split bigger tickets.
6. Read `data/bet-log.json` to compare quoted vs. estimated multiples per platform and tune `skip_below`.
7. **If you changed anything in css/ or js/ (or index.html), run `node scripts/bump-version.mjs` before committing** (§49). Data-only commits (data/*.json) don't need it.

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
- **No "tap" in titles (updated by §54):** `splitTap()` cuts `— YES` / `— NO (4 or fewer)` off the title (still write those markers so the side is clear). The "👉 Tap:" line is gone and `(tap "…")` / `— tap …` instructions are now REJECTED by the validator.
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
- ✅ **DONE Oct 19, 2026 (Reed's bot, see §33).** (Live Bets alerts, Oct 19, 2026, Richie) **Please add site-wide Live Bets alert notifications.** Richie's files need no change for this; the data and the last-seen marker already exist.
  1. **Badge:** show the number of new alerts on the "Live Bets 🔴" toggle (app.js `renderPicks`) and on the bottom-bar Picks nav item.
  2. **Optional toast:** on any page, a small dismissible banner or toast when a new **big edge** alert arrives (`type === 'new_edge' && tier === 'big'`), e.g. "New big edge: <text>" with a link to `#live`.
  - **Data:** `fetch('data/live/' + LiveBets.SLUG + '.json?ts=' + Date.now())`. `window.LiveBets.SLUG` is the current game (today `nfl-was-sf-2026-10-19`). Read the `alerts` array: **newest first**, up to 50. Each entry has `id` (unique, stable), `key`, `at` (ISO UTC time), `type` (`new_edge` | `gone` | `news` | `removed`), `tier` (`big` | `slight`), `side`, `market`, `now_odds` (American), `now_chance` (0-100), `edge` (points), `text` (plain sentence, no dollar figures) and `url` (https Polymarket link). There are no alerts before kickoff, and anything past +500 / -500 is already filtered out.
  - **Last seen:** js/live-bets.js stores the `at` of the newest alert the viewer has seen in `localStorage['liveBets.alertsSeen.' + LiveBets.SLUG]` (today `liveBets.alertsSeen.nfl-was-sf-2026-10-19`). It updates when the Live Bets view draws. New count = `alerts.filter(a => !lastSeen || a.at > lastSeen).length`. With no stored value, either show all or none (the Live Bets view itself highlights none on a first visit). Opening Live Bets clears the badge, because the view writes the new last-seen. Treat the key as read-only, and for "dismiss" on the toast keep your own key (e.g. the dismissed alert `id`).
  - **Polling:** about every 60 s, while the page is visible (`document.visibilityState === 'visible'`). The data file updates about every 2 minutes during the game, plus a GitHub Pages build delay.
  - Site rules: American odds only, "$10 pays $X" in whole dollars worked out in the browser (`Math.floor(1000 / now_chance)`), set text with textContent, and only allow https links.
- ✅ **For Pablo (Oct 19, 2026, Reed's bot):** the all-time graded record of live alerts is done, without touching your files. **Read `data/live-record.json`** (ours, outside data/live/). It has one entry per alert, kept for good, graded on the real Polymarket US settlement, plus totals per tier. It is built by `scripts/grade-live-alerts.mjs`, which only *reads* data/live/*.json. It shows under your `#live-bets-root` in the Live Bets view (§35).

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

## 33. Live Bets alerts badge + big-edge pop-up (done for Pablo/Richie, Oct 19, 2026)

Built exactly as Pablo asked under "Requests for Reed's bot" (§31). The code is in js/app.js ("live alerts" block) and the styles are in css/style.css §22. **Richie's files are untouched.**

- **Feed:** `data/live/<LiveBets.SLUG>.json` (Richie's file, read only), fetched with `?ts=` and `no-store`. It uses the first 50 `alerts`.
- **Badge:** a red count on the "Live Bets 🔴" toggle and the bottom-bar Picks button.
  - It counts alerts whose `at` is newer than `localStorage['liveBets.alertsSeen.' + SLUG]`. That key is **read-only for us**: Richie's view writes it when it draws, so opening Live Bets clears the badge (we repaint 0 / 1.5 / 4 s after the view opens).
  - With no stored value yet, every alert counts. Above 9 it shows "9+".
- **Pop-up:** shows on any page except the Live view itself, for the newest alert with `type === 'new_edge' && tier === 'big'` that hasn't been dismissed.
  - It reads "🔴 New big edge: <text> See it →" and links to `#live`.
  - Tapping it or the × dismisses it. Dismissed ids are kept in **our own key** `betdash_liveDismissed` (the last 100).
- **Polling:** every 60 s, only while `document.visibilityState === 'visible'`. It also checks right away when the page becomes visible again.
- **Safety:** a missing `LiveBets` / `SLUG` / file, or bad JSON, just means no badge and no pop-up. Text goes in with `textContent`. The only link is `#live`. No cents, no dollars.
- **Wording:** the pop-up words ("New big edge:", "See it", "Close") sit in app.js `LIVE_TXT`, because this change was limited to index.html, app.js and our CSS. Move them to `STR.live` later if wanted.
- **Test:** `CH=<chromium> NODE_PATH=<puppeteer-core> node tests/live-alerts.smoke.js <site url>` serves made-up TEST alerts by intercepting the feed request (nothing is written to data/live). It checks the badge count, the pop-up on two pages, dismissal, and that the badge clears on opening Live Bets.
- First-visit alerts window (Oct 19, 2026, Richie, option C): when `localStorage['liveBets.alertsSeen.<SLUG>']` is unset, js/live-bets.js sets it to **now − 30 minutes** (ISO via `toISOString()`, same format as alert `at`). It does this at **page load**, since index.html loads it synchronously before app.js, so Reed's badge (§33, commit 89b6d1c) and our NEW highlighting count only the last 30 minutes for first-time visitors. A value that's already set is never changed. `seedSeen()` is tested in tests/live-bets.test.js. No change to Reed's files was needed.

## 34. Lineup notes on pick cards (lineup check, Oct 19, 2026)

A routine runs around **noon and 4 PM CT** to check confirmed lineups, starting goalies, starting pitchers and injury/inactive news for that day's picks. Sources, in order: Daily Faceoff team line pages (`https://www.dailyfaceoff.com/teams/<team>/line-combinations`) for NHL lines and goalies, then X: @FiredUpFantasy, @GameDayGoalies, @GameDayLines (hockey), @UnderdogMLB, @UnderdogNFL, @UnderdogNBA. **Never invent news; every note names its source.**

- **Field:** `lineup_note` on any pick or combo: `{status, text, source, source_url?, checked_at}`. `status` is `confirmed` (green ✅ "Lineup: good to go."), `at_risk` (orange ⚠️ "heads up") or `out` (red ⛔ "not playing"). Validated in `validateLineupNote()` (text ≤ 240 chars, source required, ISO `checked_at`).
- **Write it with** `node scripts/update-picks.mjs lineup /tmp/notes.json` where the file is `[{id, status, text, source, source_url?, clear_pending_news?, pending_news?}]`. The note is **replaced by id**, never appended, so the 4 PM run refreshes the noon note instead of stacking a second one. `clear_pending_news: true` clears the yellow "Waiting on news" flag once the news is in; `pending_news: "..."` rewrites it (an entry may do only that, with no note, e.g. NFL inactives that aren't out yet). Commits only `data/picks.json` to main with one line per pick in the body.
- **Rendering:** `lineupHtml()` in `js/app.js`, just above the yellow news flag; wording in `STR.plain.lineup` (`js/strings.js`); styles `.lineup*` in `css/style.css`. Shows the source (linked when `source_url` is set) and the check time in CT.
- **Messaging Reed:** only when news changes a pick (a starter out, a goalie swap, a scratched player in a prop or combo leg), 2-4 short lines saying keep, skip or swap. Otherwise the notes on the site are the whole output.
- **Gap to know about:** NFL inactives (about 90 minutes before kickoff) and NHL warmups land after the 4 PM run, so late scratches after 4 PM aren't caught by this routine.

- Discord push (Oct 19, 2026): `node scripts/live-discord.mjs [--slug ...]` posts **only** new `new_edge` alerts with tier `big` and `news` ("likely news") alerts from data/live/<slug>.json to a Discord webhook. The URL comes **only** from env `DISCORD_WEBHOOK_URL` (never logged or committed, and scrubbed from errors). Without it the script exits quietly. Each alert posts once: posted ids are stored outside the repo in `/workspace/live/discord-posted.json`. It respects the +500/-500 limit, skips alerts older than 30 min, posts at most 5 per run about 1 s apart, and retries a 429 once after `retry_after`. Messages use `allowed_mentions: none`. Each message has the bet, market, American odds, "$10 pays $X" (whole dollars), edge points, score/clock context and the link. Tests use a mocked fetch: `node --test tests/live-discord.test.mjs`. The box loop (/workspace/live-loop.sh, not in the repo) runs it after every publish.

## 34. Play money + leaderboard (Oct 19, 2026)

**What:** points only, labeled "Play money, just for fun". No real money is involved anywhere.
- Each person picks a display name and starts with **1,000 points**.
- Two ways to bet:
  - **"🎮 Play"** on any pick card whose picks all have a real `market_id`. It fetches the live Polymarket US price, shows a confirm box ("Bet 100 pts, get X back", American odds), and places a 100-point bet.
  - **"🎮 Bet play points on this slip"** at the bottom of Build a Bet. You choose the points. Only picks from the game list count; typed-in picks can't be played.
- Prices are the live Polymarket US buy price at the moment the bet is placed, shown as American odds. No cents.

**Where:** My Bets tab → toggle **"My bets" | "Play money 🎮"** (`#bets` / `#play`, remembered in `betdash_prefs.betsView`). It shows:
- the points, won-lost, ROI ("Gain per point bet") and best hit;
- open and finished play bets;
- the leaderboard and a **Post my score** button.

**Code:**
- `js/play.js` (`window.Play`) holds the pure math, used by the browser, the script and the tests:
  - payout = stake × Π(100/c), rounded down;
  - settling: any loss = lost; a voided pick is dropped; all voided = refund;
  - stats, name rule, bet/submission validation, replay.
- app.js "PLAY MONEY" block holds the UI.
- `Store.getPlay/setPlay` uses key `betdash_play` (included in backup export/import).
- Wording: `STR.play`. CSS: style.css §23.

**Results (real only):**
- `settlePlay()` reads each game from the public Polymarket US gateway (`/v1/events/slug/<game>`; CORS is open). When the market is `closed`, the side priced `"1"` won (the `long` side = our "yes").
- It runs when the Play view opens (at most every 2 min) and on "Check results".

**Shared leaderboard: the backend choice:**
- **Chosen: GitHub issues + a script.** "Post my score" opens a pre-filled public issue titled `Play score: <name>` with a JSON block (name + the newest 40 bets: market, side, price, stake).
- `node scripts/play-leaderboard.mjs --commit` then:
  - reads those public issues and keeps each GitHub user's newest post;
  - **re-settles every bet itself from real Polymarket US results** (statuses from browsers are ignored);
  - drops bets the points couldn't cover;
  - writes `data/play/leaderboard.json` and commits only when it changed.
- No keys or sign-up needed: public issues are readable without auth. An optional `GITHUB_TOKEN` in the job's environment only raises the rate limit and is never printed. **Add it to the daily routine** (after fetch-markets), or run it hourly on game nights.
- Tradeoffs:
  - (+) free, nothing to sign up for, no secrets on the site, every score is re-checked.
  - (−) posting needs a free GitHub account and the post is public (it shows the GitHub login).
  - (−) the board updates only when the script runs, not instantly.
  - (−) the price at bet time is self-reported. The script checks it's 1-99 but can't prove it was the real price then. That's fine for play money.
  - (−) friends without GitHub only see the board; they can't post.
- **Alternatives:** Supabase or Firebase free tier would give instant, account-free posting. But Reed would have to sign up, create a project, add row-level-security rules, and put a public anon key in the site (safe only with strict rules). It also means another service to keep an eye on. Not needed for play money.

**Tests:**
- `node tests/play.test.js` (math).
- `node tests/play-leaderboard.test.mjs` (builder on made-up issues, stubbed results).
- `CH=<chromium> NODE_PATH=<puppeteer-core> node tests/play.smoke.js <url>` (phone-width flow; settles a real finished game: Packers beat Cowboys on Oct 18).

## 35. Live Bets record (all-time graded live alerts, Oct 19, 2026)

**Rule (Reed): the Live Bets record lives ONLY inside the Live Bets view.**
- It is drawn by our js/app.js into `<section id="live-record-root">`, placed right below Pablo's `#live-bets-root` on Picks → "Live Bets 🔴".
- It is **not on the Record tab**, and it is fully separate from it.
- **Never add new bottom tabs.** Keep exactly: Picks, Build a Bet, My Bets, Record, Fade Trent, Settings.

**Files (ours):**
- `scripts/grade-live-alerts.mjs`
- `data/live-record.json`
- app.js `liveRecordHtml`, `STR.record.live`, `STR.tips.liveRecord`, css/style.css §24
- tests: `tests/grade-live-alerts.test.mjs`, `tests/live-record.smoke.js`

The script only **reads** Pablo's `data/live/*.json`. It never writes there.

**Logging:**
- Every bet alert (`type: "new_edge"`, or the older watcher format with no type) becomes one entry: id, time CT, game, market, side (+ side index), tier (big / slight), odds at alert, opening odds, edge, link.
- Entries are **never deleted or rewritten** once logged, even after Pablo's file drops them (it keeps only the newest 50). Losses stay.

**Grading (real results only):**
- The script reads Polymarket US settlement from the public gateway (`/v1/events/slug/<game>`, market matched by its id).
- A closed market with the side priced "1" = win, "0" = loss. A middle price = push. Archived with no price = void.
- Not settled, or the side can't be told, = pending. Nothing is guessed.

**Totals** (all / big / slight):
- W-L-P, hit rate (pushes left out), and expected rate (the average chance implied by the odds at alert time).
- Units at a flat 1u per alert (a win pays the alert's American odds), ROI, and sample size (graded count).
- The page carries a note that small samples are noisy.

**Routine step:** `node scripts/grade-live-alerts.mjs --commit`. Run it after games finish, e.g. in the Play Money Leaderboard Update routine. It commits `data/live-record.json` only when something changed (pull --rebase, never force).

## 36. Self-learning loop: closing-line value, calibration, trust (Oct 19, 2026)

**Files (ours; Pablo's files untouched, no new tabs):**
- `scripts/capture-closing.mjs` writes `data/pick-history.json`.
- `scripts/learn.mjs` writes `data/learning.json`.
- The "How we're learning" card is on the **Record tab** (app.js `learningCardHtml`, `STR.record.learn`, css/style.css §25).
- Tests: `tests/learn.test.mjs`, `tests/learning.smoke.js`.

**1. Pick history + closing prices** (`node scripts/capture-closing.mjs --commit`). Each run does three things:
- (a) **log:** adds every new pick from data/picks.json, with its **publish price** (the picks.json `price`, per leg), hit_prob, stake, sport, type and prop stat. Picks are never removed.
- (b) **close:** for legs whose game starts within 20 min (`--window`) and hasn't started, it saves the live Polymarket US buy price as the **closing price**, once. After the start, nothing is back-filled.
- (c) **grade:** reads the real Polymarket US settlement (closed market; the winning side is priced 1).
- CLV = close − publish, in chance points. Positive = the market moved toward our pick.

**2. Learning** (`node scripts/learn.mjs --commit`). It uses graded pick history, `data/predictions.json` and the store CSV `predictions.csv`; rows with the same date + game as predictions.json are not counted twice. It writes:
- `calibration.picks` / `calibration.predictions`: 10-point buckets of our stated chance → n, average said, actual, `adjustment_pts` = (actual − said) × n/(n+100).
- `market_shrink.weight` w: a least-squares fit of the outcome on our hit_prob vs the market price, pulled toward 1.
- `categories[]` (sport · bet type · prop stat): W-L, hit rate, flat-1u units, ROI, avg CLV, and `trust` = clamp(1 + ROI × n/(n+100), 0.5, 1.25).
- `clv`: average and beat-the-close %.
- **Gate:** every adjustment is 0, w = 1 and trust = 1 until that bucket or category has **30 graded** (`status: "collecting data"`).

**3. How the daily digest MUST apply data/learning.json** (when building picks, before `update-picks.mjs picks`):
1. Start from your raw chance `h` and the Polymarket US price `m` (for combos, the product of the leg prices).
2. `h1 = m + w × (h − m)`, with w = `market_shrink.weight` (1 while collecting data).
3. `h2 = h1 + adjustment_pts` of the `calibration.picks` bucket that `h1` falls in (0 if that bucket is still collecting data). For game predictions, use `calibration.predictions` on `win_prob` the same way. Clamp to 1-99.
4. Write `h2` as `hit_prob`, and judge the edge with `h2` (`fair` stays the book number).
5. Stake: `stake_units × trust` for the pick's category key `<SPORT> · <type> · <stat>` (e.g. "NHL · prop · pts"). Fall back to "<SPORT> · <type>", then 1. Round to the nearest 0.25u and never go above the usual max for that pick type.
6. Mention any applied change in the digest ("calibration −0.8, trust ×1.06"). While everything says "collecting data", change nothing.

**Routine commands:**
- After publishing picks, every ~10 min from about 30 min before the first game until the last start, and the next morning: `node scripts/capture-closing.mjs --commit`
- Next morning, after that run and after grading predictions: `node scripts/learn.mjs --commit`

Both commit only their own file, and only when it changed (pull --rebase, never force).

Started Oct 19, 2026 with 20 picks logged, 0 graded. Picks published before then have no history.

## 37. "Refresh prices" on Picks + the night-of re-price (Oct 19, 2026)

- **Picks tab:** the button `#picks-refresh` sits under the "Updated" line. It uses `js/live-picks.js` (`LivePicks.reprice(doc, getPrice)`, pure, tested in `tests/live-picks.test.js`).
  - It re-loads data/picks.json, then gets live Polymarket US buy prices in the browser for each leg whose game has not started (`Picker.livePrice` → `gateway.polymarket.us/v1/markets/{id}/bbo`).
  - **CORS is open:** this was checked in real Chromium in `tests/refresh.smoke.js`.
  - Started legs keep their old price. The old price is kept as `price_morning`. A single's `edge` is re-computed as fair − price.
  - The status line says "Live prices from <time>". If no price comes back (network or CORS), it falls back to the saved picks.json prices: "Could not get live prices. Showing saved prices from <time>."
  - Nothing is written back to the repo.
- **Build a Bet** already had `#refresh-px` (live per leg, with "Live prices from…"). It is unchanged.
- **Vegas lines** always come from committed data. No key ever reaches the browser.
- **Night-of manual re-price:** commit d101ed5 re-priced the not-started Oct 19 legs in data/picks.json.
  - Each changed leg keeps `price_morning`, and each pick got `price_checked_at`.
  - Picks with no edge left, and combos with a leg that already started, were set to `action: "skip"` with a plain verdict.
  - `data/pick-history.json` keeps the original publish prices (mergeHistory never replaces), so CLV is still measured from the morning price.

## 38. Seeded bets: off-app slips in My Bets (Oct 19, 2026)

My Bets lives in localStorage (`betdash_bets`), so bets placed straight on Polymarket (from screenshots) are added via **`data/seed-bets.json`** (committed, **no dollars**: `stake_units` + `quoted_multiple` = total return / stake). On start, `seedBets()` in `js/app.js` copies each new id into localStorage with `stake = stake_units × profile.unit`, then remembers the id in `prefs.seededBets` so deletes/settles stick and nothing is re-added. Seeded bets are `share:false` (not pushed to `data/bet-log.json`). To add more: append to `bets[]` with a new unique id. First batch: Reed's 6 open combos from 10/19 (4-leg, 2× 2-leg, 3-leg, 9-leg WAS@SF SGP, 7-leg NHL week + CLE@TB). No tabs added.

**§38 update (Oct 19, 2026, late):** added a 7th seed, `seed-2026-10-19-2leg-tennis-dong-jeong` (ITF M15 Shenzhen Dong + ITF M15 Singapore Jeong, 1u, 3.857x). seedBets() tracks seeded ids one by one in prefs.seededBets, so browsers that already seeded the first 6 pick up only the new id; fetchData uses no-store, so no cache bump is needed.

**§38 update (Oct 19, 2026, night):** added 3 seeds for 10/20 games: `seed-2026-10-19-single-bos-det-under-221-5` (0.25u, 2.964x), `seed-2026-10-19-single-spurs-ml-vs-okc` (0.5u, 2.932x), and `seed-2026-10-19-3leg-knicks-lebron-islanders` (Knicks ML + LeBron 6+ reb + Islanders ML, 0.5u, 4.10x). Units only.

## 39. Record tab: tap a "Recent picks" row to see its slip (Oct 19, 2026)

- Each row in Record → "Recent picks" (from `data/predictions.json`) can be tapped (or focused + Enter). It opens a bottom sheet (centered card on wide screens) — `openPredSlip()` / `openSheet()` in `js/app.js`, styles in `css/style.css` §27, words in `STR.record.slip`.
- The sheet shows: who we picked + matchup, result badge, our chance (with fair odds), Polymarket price as American odds (never cents), the Vegas line via `Vegas.lookup()` when it's fresh, "$unit → $X if it wins" (user's own unit, browser only), our guessed score, players, reasoning, and an "Open on Polymarket" button.
- Price comes from `data/markets/events/<sport>-<teams>-<date>.json`, game-winner market (`aec-` id). It's the last saved price, not the price at pick time — the sheet says so. No file = no price lines.
- Closes with the × button, a backdrop tap, or Esc. Still 6 bottom tabs.
- The Record tab doesn't list `data/pick-history.json` picks anywhere yet, so there's nothing to hook up there; `openSheet()` is generic if we add that list later.
- Smoke test: `tests/record-slip.smoke.js` (screenshot to /workspace/shots/record-slip.png).

## 40. Record tab: "Our Picks-page picks" list + full slips (Oct 19, 2026)

- New section on the Record tab, below the game-winner list (now titled "Game winner picks"): "Our Picks-page picks", built from `data/pick-history.json` by `pickHistoryHtml()` in `js/app.js`. Words live in `STR.record.hist`.
- Summary boxes: Won, Lost, Not finished, Units won/lost. **Units only, never dollars.** Units = stake_units × (multiple − 1) on a win, −stake_units on a loss. The multiple is the product of 100/`publish` over the legs, i.e. the price when we posted the pick.
- Rows (newest first, up to 40): date, pick name (the leg text minus the "— tap…" hints, or "3-leg combo: A + B + C"), sport · category, our chance, and the result badge.
- Tap or Enter on a row runs `openHistSlip()`, which opens the same bottom sheet as §39 (`openSheet()`). It shows every leg with its American odds and won/lost/not-finished badge, odds if all legs win, the units we said to bet, units won/lost, and "$unit → $X if it wins". No cents anywhere.
- Smoke test: `tests/record-picks-list.smoke.js`. Still 6 tabs, no Pablo files touched.

## 41. Record tab: same 5 stat boxes for both sections (Oct 19, 2026)

- "Our Picks-page picks" is renamed **Props & Combos**, with the subtitle "Every play from the Picks screen. Tap one to see its slip." The game-winner section is titled **Game Winner Picks**.
- Both sections use `statBoxes()` in `js/app.js`, which shows the same boxes in the same order: Picks that won (%), Won-Lost, Not finished, Total picks, Units won/lost. Units only, never dollars.
- The old top summary moved under the "Game Winner Picks" header. The "When we say X%…" calibration table sits under the game-winner rows, since it's about game winners.
- **Game-winner units:** 1u flat on every pick. A loss is −1u and a win is +(100/price − 1)u. `data/predictions.json` has no stored price, so `predPrice()` reads the saved game-winner market (`aec-…`) in `data/markets/events/<slug>.json` and uses the last saved price. That price may differ from the price at pick time. A win with no saved price counts as 0u, and the note under the boxes says how many wins that was. Pending picks count 0u.
- Phone layout: 2 boxes per row, and the Units box spans the full last row (`.kpis-5 .kpi-wide`). At 700px and wider, all 5 sit in one row.
- Smoke test: `tests/record-unified.smoke.js` (renamed to `tests/record-split.smoke.js` in §42) (the §39 and §40 tests still pass).

## 42. Record tab: Game Winners / Single Bets / Combos + cache-busting (Oct 19, 2026)

- The Record tab now has three sections: **Game Winners**, **Single Bets** and **Combos**. "Props & Combos" was misleading because it held single bets.
- The Picks-screen picks (`data/pick-history.json`) are split by **leg count, not the category label**: 1 leg means Single Bets (single, prop, nonsports), and 2+ legs means Combos (parlay, longshot). See `pickHistoryHtml()` and `histSectionHtml()` in `js/app.js`. Words are in `STR.record.hist.singlesTitle/combosTitle`.
- Each section has the same 5 boxes (`statBoxes()`, §41), its own rows, and tap-to-open slips (§39/§40). Units only.
- **Cache-busting (updated Oct 20, §49):** every CSS/JS include in `index.html` ends in `?v=<stamp>`. **Whenever css/, js/ or index.html changes, run `node scripts/bump-version.mjs`** — it sets the same stamp on every `?v=`, on `window.APP_VERSION` in index.html and in `version.json`, so phones auto-reload. `node scripts/bump-version.mjs --check` verifies they match. Don't hand-edit with sed any more.
- Smoke tests: `tests/record-split.smoke.js` (was record-unified; it checks 3 sections, the same boxes, 1-leg-only singles, multi-leg-only combos and `?v=`) and `tests/record-picks-list.smoke.js` (labels updated).

## 43. Expanded next-day board (Oct 19, 2026, late)
Reed wanted many more options for Tue 10/20. Added by new ids via `add-picks --replace` (no duplicates): 9 more singles (moneylines/totals/spreads, every one labeled "Strong edge" (3+ points vs no-vig Vegas), "Slight edge" (0.5-3) or "Fair, no edge" in `reasoning`/`verdict`, with the Polymarket US and best-Vegas American prices in the text), 7 more NBA props, 6 cross-sport combos (2-3 legs, every leg 55%+), and 1 labeled long shot. Game-winner predictions for all 14 NBA+NHL games live in data/predictions.json. No NHL point props: none had 3+ points of edge (rule §24/new rules). Picks page has no card cap, so no UI change. Avoided conflicts: no single on a side whose opponent is a combo leg (e.g. no Canucks/Sharks/Kings singles because Hurricanes/Canadiens/Capitals are combo legs). Prop edges come from single-book alt lines, so they're thin. Re-price by id at the 7 AM run.

## 44. Lottery tickets section (Oct 20, 2026)
Reed wanted huge "lottery ticket" combos (7 to about 20 legs) inside the Picks page (no new tab).
- **Data:** new `sections.lottery[]` in picks.json, same MultiPick schema as `longshots` (legs[], est_multiple, hit_prob, skip_below, stake_units ≤ 0.1). Allowed by `update-picks.mjs` (SECTIONS/MULTI_SECTIONS), `js/evaluate.js` (MULTI, long-shot verdicts), `scripts/capture-closing.mjs` (category `longshot`).
- **UI:** `PICK_SECTIONS` adds `['lottery','longshot']`, so it renders after Big payout combos with the same day and sport chips (a ticket's `sport` is "NBA + NHL", so it shows under each). Title `STR.picks.sections.lottery`. `pickCard` adds a yellow `.lotto-line`: "$1 → $X · $10 → $Y · +American" plus "Just for fun" (`STR.picks.lottoFun`). The hit chance ("about 1 in N") comes from the normal eval box. CSS: `.card.lotto` (dashed gold border, logos on their own row). Cache stamp `?v=20261020-0020`.
- **Build a Bet / My Bets:** "Load into calculator" works as for long shots; the saved category is `longshot`.
- **Record:** no separate block. Tickets have 2+ legs, so §42's leg-count split puts them under **Combos**.
- **Leg cap:** Polymarket US's app allows **2-10 legs per combo** (docs.polymarket.us Combos FAQ; the API allows 2-50). Tickets over 10 legs say to split them into two combos.
- **Oct 20 tickets:** ids `2026-10-20-lotto-7/-10/-14/-19`. The 7- and 10-leg tickets are all Vegas-checked legs. The 14- and 19-leg ones add NHL "Under 7.5 goals" legs that have no Vegas line (fair = the Polymarket price).
- Screenshot: /workspace/shots/lottery.png (390px phone, headless Chrome, after onboarding).

## 46. Share a pick: link + picture (Oct 20, 2026)
- **Where:** a "⤴ Share" button on every Picks card with an `id` (singles, props, combos, long shots, lottery; under the BET badge) and on the Record-tab slip pop-up (`openHistSlip`). Code: `js/share.js` (`window.Share`: `menu`, `draw`, `png`, `link`) plus the app.js block "Share a pick" (`shareInfoPick`, `shareInfoHist`, `afterPicksRender`). CSS §46 at the end of style.css. Cache stamp `?v=20261020-0030`.
- **Copy link:** `?pick=<id>` (a query string, because the hash is used for tabs). Uses `navigator.share({url})` when available, else the clipboard plus a "Copied!" toast. On load, `pendingPick` opens Picks, switches to that pick's day (and clears the sport chip), scrolls to it and highlights it (`.pick-hl`, 4s), then drops the query string. If the id isn't in picks.json, it looks in `data/pick-history.json` and opens the Record slip pop-up.
- **Save as picture:** pure canvas text (no logos or remote images, so the canvas is never tainted; no library). 1080 wide by 1350 tall, growing up to 1920 for big tickets (the font shrinks after that), drawn at 2x. It has the wordmark (APP_CONFIG), date, title, every leg (sport, text, American odds), combined odds, "$10 → $X" (a fixed example, never the user's stake), the hit chance in words and a "just for fun" footer. No cents, units or bankroll. Order of tries: `navigator.canShare({files})` → share sheet ("Save Image" on iPhone) → on desktop a download → on touch devices an overlay saying "press and hold to save".
- **Test:** `tests/share.smoke.js` (Share on every card, the menu, an untainted export, no cents/stake words, deep-link highlight, old pick → slip). Shots: /workspace/shots/share-menu.png, share-example.png, share-slip.png.
- Richie's/Pablo's live-bets files are untouched; the 6 tabs are unchanged.

## 47. For Pablo: Live Bets feed went dead during MNF + scheduled tick (Oct 20, 2026)
Written by Reed's bot. Reed OK'd editing your live files this one time.

**What was wrong:** during MNF WAS@SF the view only ever showed one McCaffrey edge.
`data/live/nfl-was-sf-2026-10-19.json` was last published 3:39 PM CT (status "pregame")
and nothing ran `live-watch.mjs` after kickoff, so the file never changed. The view
also gave no sign the feed was dead ("Updated 3:39 PM CT · checks every minute").

**What changed**
- NEW `scripts/live-tick.mjs` (also `node scripts/live-watch.mjs tick`): one fast pass, then exits.
  Lists Polymarket US events (free, no key) in nfl/nba/wnba/nhl/mlb that start within 30 min
  (`--lead N`) or started up to 8 h ago, plus any data/live game from the last 24 h not yet final.
  For each non-final game it runs your existing `live-watch.mjs publish --slug X` (snapshot if
  missing, edges, alerts, ESPN context). Final games are skipped forever. Rewrites
  `data/live/index.json`. `--push` commits+pushes data/live/ only if git sees a change; without
  it, git is never touched. `--dry` lists what it would do. Always exits 0 (errors are logged).
  No Odds API, no Discord posts, prices only.
- `scripts/live-watch.mjs`: `tick` command added; `buildLive` status is also "final" when ESPN
  says `post` (markets can stay open after the game). Nothing else changed.
- `js/live-bets.js`: shows "Updated X min ago (h:mm CT)"; a red "Feed is stale" box when
  updated is >20 min old and the game is live or past start time. Picks the game from
  `data/live/index.json` (live → soonest pregame → latest), falls back to the old SLUG; a small
  game-switcher row appears when 2+ non-final games are listed. SEEN_KEY unchanged (badge safe).
- `css/live-bets.css`: `.lb-stale`, `.lb-games`, `.lb-game-btn` appended at the bottom.
- Tests added in `tests/live-watch.test.mjs` and `tests/live-bets.test.js`. Cache stamp → `?v=20261020-0335`.
- Ran a tick: WAS@SF is now marked final (WSH 17 – SF 23).

**Your schedule (you own it, Reed's side won't run it):**
```
cd /path/to/goggins-of-gambling && git pull -q --rebase origin main && node scripts/live-tick.mjs --push
```
Every 10 min (5 is fine too; it's free) from about 11:00 AM to 11:59 PM CT, plus 12:00–1:30 AM CT
for late West-coast games. Cron (CT box): `*/10 11-23,0 * * *`. One tick takes a few seconds per
game. Needs git push rights to main. Opening snapshots live in /workspace/live (`--dir`), else
they're rebuilt from the published file, so any machine keeps the same open.
Player props (update, Oct 20 3:35 AM CT): the tick passes `--players all`, so every player prop
Polymarket lists for the game is watched, no hand-picked list. They all come in the same single
event request, so props add zero extra calls. Thin markets (bid/ask gap > 6 pts, under 4% / over
96%) are skipped at snapshot, and the +500/-500 limit still filters edges. The view's top 5 +
"Show more" per group is unchanged. `--dry` prints counts; at 3:31 AM CT tonight's BOS@DET showed
39 game lines + 80 props (14 players), NHL games 6-23 props each. If you want Discord, run `live-discord.mjs --slug X` per game after
the tick yourself (DISCORD_WEBHOOK_URL env).

## 48. Tap a bet → price chart + prop bet bars pop-up (Oct 20, 2026)
Reed asked for two charts (inspired by Outlier's bars and Polymarket's price chart). No new tabs:
they open in a pop-up when you tap a pick card (Picks tab) or a Live Bets card.
- **NEW `js/viz.js`** (`window.Viz`), loaded before app.js. Plain SVG/divs, no library.
  - **Price over time:** the side's chance over time from `data/live/<slug>-history.json`, y-axis in
    American odds, dashed marks at period changes with the ESPN score, touch/drag to read a point
    ("2:39 PM CT · -160 · 62% chance · $10 pays $16 · Q2 · BOS 28–DET 25"). Polymarket US has NO free
    public price-history endpoint (Oct 20: prices-history/price-history/timeseries/candles all 404),
    so the line only exists for games our live tick tracked, from the first tick on.
  - **Prop bet history:** ESPN search (`site.web.api.espn.com/apis/search/v2`) finds the player, then
    the athlete gamelog (`/apis/common/v3/sports/<sport>/<league>/athletes/<id>/gamelog`) — both free
    with open CORS, fetched in the browser, cached per page load. Green = hit "N+", red = missed,
    dashed line at N, "Hit in 7 of 10 games · Average 24.3". Toggles L5 / L10 / vs OPP / Season.
    Pads with last season when this season has fewer than 10 games; preseason is skipped.
    Reads props from the Polymarket question, the pick leg text ("LeBron James 8+ rebounds") or the
    market slug (`astatc-…-reb-lebjam-gte8`). Stats: NBA/WNBA points, rebounds, assists, threes,
    steals, blocks, PRA; NHL goals, assists, points; NFL passing/rushing/receiving yards, catches,
    passing TDs, INTs; MLB hits, HR, RBIs, strikeouts. Anything else just shows the price chart.
- `js/app.js`: `vizSpec(pk)` + a card click handler in `afterPicksRender` (buttons/links still work).
- `css/style.css`: `.viz-*` styles at the bottom. Tests: `tests/viz.test.js`, + history test in live-watch tests.
- Cache stamp → `?v=20261020-0400`.

**For Pablo (your files, Reed OK'd):**
- `scripts/live-watch.mjs`: new pure `appendHistory()`; `publish` now also writes
  `data/live/<slug>-history.json` = `{ t0, ids:{marketSlug:id}, marks:[[min,label]], m:{id:[[min,yesMid]]} }`.
  A point is stored only when the Yes mid moves 0.5+ pts or 30 min passed; max 300 points/market;
  one line per market so git diffs stay small (~9 KB per game after the first tick). Prices only.
  The tick's `--push` already picks it up (it's in data/live/); index.json ignores it.
- `js/live-bets.js`: edge cards get class `lb-tap` and open `Viz.open(...)` on tap (the
  "Open on Polymarket" link still works). Two module vars `curSlug/curGame` set in `draw()`.
  Nothing else in your design changed.

## 49. Auto update check: phones never keep a stale site (Oct 20, 2026)
- **How:** a tiny inline script at the top of `index.html` `<head>` fetches `version.json?t=<now>` with `cache:'no-store'` on load, when the tab becomes visible again (`visibilitychange`) and on back/forward-cache restores (`pageshow` persisted). If `version.json` differs from `window.APP_VERSION`, it reloads ONCE via `location.replace(...?fresh=<version>)` (a new URL, so Safari fetches a fresh index.html and the new `?v=` files). Loop guard: `sessionStorage.betdash_reloadedFor = <version>`; if storage is blocked it never reloads. The `fresh` param is removed from the address bar after load. Free: one tiny static file, no APIs.
- Also added `Cache-Control/Pragma/Expires` no-cache meta tags (GitHub Pages ignores them for its own headers, so the check is the real fix).
- **One-step bumps:** `node scripts/bump-version.mjs [stamp]` (default = now in CT) updates all `?v=`, `APP_VERSION` and `version.json` together. `--check` exits 1 if they disagree (run by `tests/version.test.mjs`). Digest routine step 7 (§8) and §42 point here.

## 50. Prop bet pop-up: changeable line chips (Oct 20, 2026)
- In the prop bet history (§48), a row of chips like `15+ 20+ 25+ 30+` sits under "Line:". The chips come ONLY from the
  lines Polymarket US lists for the same player + same stat in the same game: `js/viz.js` fetches
  `gateway.polymarket.us/v1/events/slug/<event>` in the browser (free, CORS open, the same source as pick cards and the
  live tick) and `siblingLines(ev, prop)` keeps open `*_player_*` markets whose question parses to the same player and stat.
  No typed or made-up lines. Only one listed → one chip. Nothing listed → the bet's own line as a single chip.
- Default = the bet's own line (if it's no longer listed, the nearest listed line). Tapping a chip moves the dashed line,
  recolors the bars, updates "Hit in X of N", the price "30+: +170 · $10 pays $27 on Polymarket" (Yes buy price; for a
  No/under bet the No buy price, shown as "Under N"), and points the price-over-time chart at that line's market. The
  chosen line stays when switching L5 / L10 / vs OPP / Season.
- CSS `.viz-chip*`, `.viz-price`, `.viz-onpm` at the end of style.css. Test in `tests/viz.test.js`. Version bumped with bump-version.mjs.

## 51. Balanced action buttons (Oct 20, 2026)
- Cause: the §46 Share rule `.pick-actions { flex-direction: column; align-items: flex-end }` was meant for the card
  header (BET badge + Share) but also hit the bottom button group, so "Open in Polymarket US ↗", "Use in Bet Builder"
  and "🎮 Play" stacked right-aligned with uneven widths (and My Bets' Won / Lost / Push did the same).
- Fix: that rule is now scoped to `.pick-head .pick-actions`. The bottom groups get `card-actions` (CSS grid, §51 at the
  end of style.css): the open-in-app link is a full-width row, the other buttons share an equal-width row under it
  (one button alone spans full width). My Bets settle buttons (`settle-actions`) are 3 equal columns. All 44px tall,
  12px radius, 8px gaps. Functions unchanged. The Record slip pop-up only has the Share pill (unchanged).

## 52. No cents anywhere: one money formatter (Oct 20, 2026)
- `Plain.dollars(n)` in `js/plain.js` is THE money formatter: whole dollars, rounded ("$6.67" → "$7", "$1,235"),
  anything between 0 and $1 shows "under $1" (never "$0"), exactly 0 is "$0".
- `money()` and `cash()` in app.js now just call it, so every stake, payout, bankroll and P/L line follows it
  ("Bet $2 → get $7 back", "Suggested bet: under $1", header "$123"). The Record slip "pays" string (strings.js) uses it too.
- Checked all 6 tabs in a browser with a $123.45 bankroll: no "$x.yz" anywhere. Input boxes (stake/unit fields) still
  accept cents when typed; only display is rounded. Use `Plain.dollars` for any new money text.

## 53. Charts everywhere + live Polymarket prices in the pop-up (Oct 20, 2026)
- **Where:** a small green "📊 Chart" pill opens the §48/§50 pop-up (`Viz.chartBtn(spec)`; one delegated click
  handler in viz.js reads `data-viz`). Picks: every card header (singles, prop bets, combos, long shots, Lottery) +
  a "📊" per combo/lottery leg (card tap still works). Build a Bet: every market row in the list and every slip leg.
  My Bets: every leg (open + settled). Record: per leg in the slip pop-up + a full-width "📊 Charts for this slip".
  Fade Trent: only picks that read as a prop bet (no market ids, so bars only). Live Bets cards: tap (as before).
  Bottom button rows untouched (§51). App helpers: `vizLeg`, `histVizLeg`, `chartBtnFor`, `legChartBtn` in app.js.
- **Price history:** Polymarket US DOES have a free public endpoint (my §48 note was wrong — it's
  `GET gateway.polymarket.us/v1/price-history?symbol=<marketSlug>&fixedInterval=INTERVAL_1D&fidelity=5`, CORS open).
  The chart loads the last day (5-min) + last hour (1-min), Yes = `longPrice`, No = `shortPrice` (buy prices),
  dropping empty-book spikes (<2% / >98%). Fallback when it has nothing: live-tick history + saved snapshot points
  (pick price at posting, Record publish/closing prices). Nothing at all → the price section hides.
- **Live:** while the pop-up is open and the tab is visible, the browser polls `GET /v1/markets/<slug>/bbo` every
  ~1.5 s (public limit 20 req/s/IP) and the event every 8 s (line-chip prices). 429 → delay doubles (max 30 s), then
  eases back. Stops on close / hidden tab, resumes when visible. A status line says "🟢 Live from Polymarket · time ·
  checks every 1.5s" or that live prices aren't reachable. Their Markets WebSocket needs an API key, so it isn't used.
  Zero server/bot cost: all in Reed's browser.
- Prop bet parsing works without a league (ESPN search picks the player's league), so plain-text legs like
  "LeBron James 6+ rebounds (10/20)" in My Bets get bars too.

## 54. Analyzer, not pick seller: no bet instructions or suggested stakes (Oct 20, 2026)
- **Gone from the UI:** "Suggested bet: …" line, "Only bet if …" line, "👉 Tap: Yes/No" lines (cards + Build a Bet slip),
  the Record slip "We said to bet 0.5u" row, the stake pre-fill when a pick is loaded into Build a Bet, "Bet pocket
  change only" on Lottery cards. The card badge is information only: "News pending" / "No edge" (no "Bet" badge). Money lines use the user's own standard bet as the example stake, not the pick's size.
  "My take:" is now "The read:" and the verdict sentences in strings.js are neutral ("Price looks fair.", "No edge at this
  price today.", "Good payout for the chance.", "Hard to hit.").
- **Kept:** chance to win, fair/edge reads, "Bet $10 → get $20 back"-style frames of reference, the user's own unit calculator.
- **Data text:** `Plain.neutral(text)` (js/plain.js) drops whole sentences that tell people what/how much to bet; it's
  applied when showing reasoning, verdict, pending news and verify notes. `Plain.splitTap` also cuts any `— tap …`.
  Existing data/picks.json and data/pick-history.json were cleaned (titles + advice sentences; 5 verdicts that were only
  advice became "Price is close to fair.").
- **Future picks:** `update-picks.mjs` rejects instruction text (`INSTRUCTION_TEXT`), and the daily routine (§8) says so.
  `live-watch.mjs check` prints "Market:" instead of "Bet it:".
- **Guard:** `tests/no-instructions.test.mjs` fails if `tap "No"`, `tap "Yes"`, `— tap` or "Suggested bet" appears in any
  data/*.json or in the user-facing strings (strings.js), and checks `Plain.neutral` / `splitTap`.

## 55. Zoomable price chart, Apple-like (Oct 20, 2026)
- `drawChart` in js/viz.js is now a stock-app chart. No range buttons (Reed): pinch (touch) or mouse wheel to zoom,
  drag to pan, tap or long-press to read a point (long-press then drag scrubs), mouse hover reads on desktop,
  double-tap resets. Default view = last hour when there's more than ~1.5 h of data, else everything.
- Y-axis fits only what's in view (+12% padding) so small moves aren't flattened. Time labels adapt (seconds when
  under 10 min, weekday + hour when over 36 h). A quiet label shows the window, e.g. "4:20 AM – 4:37 AM CT".
- Live: the view stays pinned to now as new points arrive (1.5 s polling unchanged) unless you pan away; then a small
  "● Live" pill appears to snap back. A small "↺" reset pill appears only when zoomed or panned.
- The view state lives on the chart box, so live refreshes don't undo a zoom; switching line chips starts a fresh view.
  Repaints are throttled with requestAnimationFrame. `touch-action: none` stops page scroll/zoom while gesturing.
- Pure helpers `viewWindow`, `fitY`, `rangeLabel` are tested in tests/viz.test.js. Styles: "§55" block in style.css.

**§55 update (Oct 20, 2026): default view copies Polymarket US.** Their web bundle (`defaultSportsChartWindow`: pregame → "max"/All, live/finished → "game"; window options All/Game/Live/1D/1W/1M; "max" = `fixedInterval=INTERVAL_ALL&fidelity=180`) opens sports charts on All, and All is the max zoom-out. So our chart opens fully zoomed out on the whole market history (`v.span = null`) and zoom-out stops at All (no 24 h cap). `loadApi` now also fetches `/v1/price-history?fixedInterval=INTERVAL_ALL&fidelity=180` and stitches All (3 h) + 1D (5 min) + 1H (1 min). While live at full view the window keeps growing with new points. Not copied: their "Game" default for live/finished games (no buttons here). Polling and gestures unchanged.

**§55 update (Oct 20, 2026): read-out + Polymarket Game window.** `drawChart` now sorts and dedupes the merged All + 1D + 1H + live series (`prepSeries`). Hover, tap and drag read the nearest real point by binary search (`nearestIdx`), with a dot on the line. The read-out shows time · American odds · chance % · "$unit → $payout" (standard bet from Settings `betdash_profile.unit`, whole dollars, $10 fallback) · ESPN score/period mark at that moment. The default view copies Polymarket's `defaultSportsChartWindow` (`defaultView`/`gameInfo`): pregame → All; live → Game (game start to now, still growing); finished → game start to game end. The 1D history is now fetched at 1-minute steps. Zooming out still reaches All, and once the user zooms or pans, a status change won't reset the view (Reset/double-tap does). No buttons.

## 56. Our chance: History + Vegas + Market blend (Oct 20, 2026)

One number per bet that doesn't rely only on the market price. The logic lives in `js/our-chance.js` (UMD: `window.OurChance` in the browser, `require` in scripts/tests). Browser estimates run client-side and are free (ESPN + Polymarket + our Vegas files); there's no bot cost.

- **History.** Props: ESPN gamelog (`Viz.loadGames`) hit rate at the exact line for Season / L10 / L5 / vs-opp / home-away. Each is shrunk with a beta prior, `(hits + k·prior)/(n + k)`: season toward 50% (k=4), the rest toward season (k=8). Plus avg-vs-line, `P(X ≥ n)` from a normal on the season mean/SD. Log-odds weights: L10 .30, Season .25, Avg .20, L5 .10, vs-opp .08, home/away .07. Game bets: ESPN team schedules (this season + last season if fewer than 10 games). Rating = shrunk average margin + home edge → normal (per-sport SD); log5 of shrunk win %; L10 form; head-to-head. Weights .5/.2/.2/.1. Spreads/totals use the normal on expected margin/total.
- **Vegas no-vig.** Both sides: `p/(p+q)`. One side only: `implied/1.045`.
- **Market.** The Polymarket price.
- **Final.** Weighted log-odds average: Vegas .45, Market .30, History .25·q, where `q = min(1, games/15)`. Without Vegas: Market .55, History .45·q. Missing parts are dropped. Clamped to 3–97%.
- **UI.** Any `[data-oc]` element is filled automatically ("Our chance X% · Market Y%" + "History 7 of 10 · Vegas 58% · Market 49%"). It appears on single pick cards (`evalBlock`), Build a Bet rows (Yes side), and the chart pop-up. Live Bets cards: wired (Reed override, see the note below). It is information only, with no instructions.
- **Digest.** `update-picks picks` runs `scripts/our-chance.mjs` on the new file first (never fatal; `NO_OUR_CHANCE=1` skips it). It writes `our_chance`, `market_chance`, `our_chance_why` and sets `hit_prob` = our chance (multi-leg from different games: product of the legs). `capture-closing` logs `our_chance` + `market_chance` to pick-history for calibration (`learn.mjs`).
- **Limits.** No minutes/role or injury data yet. Team ratings ignore opponent strength and rest. The home edge and SDs are rough per-sport constants. Prop history needs the ESPN search to find the player. Totals with no stats show just Vegas + Market.

**§56 update (Oct 20, 2026): UI label is "Analytics", one line.** The UI never says "Our chance" (Reed); code names stay `our_chance` / `OurChance`. Cards, Build a Bet rows (Yes), Live Bets and the chart pop-up show one compact tappable line: "Analytics 58% · Market 49% ›". The History / Vegas / Market breakdown lives only inside the Dig deeper sheet. ESPN team schedules now use `site.web.api.espn.com`, because `site.api.espn.com` intermittently failed to fetch in Chrome.

## 57. Dig deeper sheet (Oct 20, 2026)

Tap the Analytics line → full-screen sheet (`js/dig-deeper.js`, `window.DigDeeper.open(spec, res)`). It is not a new tab; the app still has 6 tabs. Esc, ✕ or tapping the backdrop closes it. Top: the big Analytics % · Market and the History / Vegas / Market breakdown. Below that:
- **Players.** The ESPN athlete position decides the stat picker. The one shared map is `POSITION_STATS` + `posGroup`, filtered to what the gamelog has. NFL: QB passing + rushing; RB rushing + receiving; WR/TE targets, receptions, yards, TDs; K kicking; DEF tackles/sacks/INTs. NBA: G/F/C with role-first order (minutes, usage proxy = FGA + 0.44·FTA + TOV, shot attempts…). NHL: skaters never see goalie stats and goalies only see saves / SV% / GA / SA. MLB: hitters (H, TB, HR, RBI, AB…) vs pitchers (K, outs, H/ER/BB allowed, pitches). Splits L5 / L10 / Season / vs opp, average + bars.
- **NFL RB/WR/TE.** A target share donut vs teammates (last 5 ESPN box scores) + team pass rate.
- **Game bets.** Both teams: last-10 form, record, home/away, points for/against, pace (PF+PA), with L5/L10/Season/H2H.
- **Not yet.** Snap share, batting-order spot and PP time on ice (not in the free gamelogs).
- **Design.** Chip pickers, no (i) icons or helper text, labels of a word or two. Tests: `tests/dig-deeper.test.js`.

**For Pablo / Richie (Oct 20, 2026, Reed's bot, Reed approved an override of §32):** `js/live-bets.js` `edgeRow()` has one small addition. Cards that aren't gone get an `<div class="oc oc-sm" data-oc='{marketId, side, market: now_chance, text, question}'>` after the market/odds lines. `js/our-chance.js` fills it client-side with one tappable line, "Analytics X% · Market Y% ›", which opens the Dig deeper sheet (§57). There are no network calls from your code and no data/live changes. Styles are `.oc*` in css/style.css. Feel free to move or restyle it; keep the `data-oc` attribute so it still fills.

**§55/§53 update (Oct 20, 2026): charts match Polymarket exactly.** Polymarket US's web chart (`normalizePriceHistory` in their bundle) plots `/v1/price-history` `longPrice` (Yes) / `shortPrice` (No) as-is. The only filter is a valid 0–1 price, and pregame "max" = `INTERVAL_ALL&fidelity=180`. So `pmHistory` no longer drops points above 98% or below 2%. It drops only exact 0/100, which have no American odds. The early ~95–98% plateau on thin markets (e.g. BOS@DET Under 221.5 on Sep 30–Oct 7) is really on Polymarket's chart, so it stays. Live points now use the BBO `longQuote` / `shortQuote`: the same field as the history (it equals ask and 1 − bid). Live polling is now ~1 s; 2 requests/s tested with no errors, and the 429 backoff is unchanged.

**§57 update (Oct 20, 2026): Dig deeper for every bet type, line stepper, one team at a time.**
- **Where it opens:** the Analytics line (now with a visible " ›") opens Dig deeper on Picks singles and combo legs (`ocDiv` in app.js), Record slip legs, Build a Bet, chart pop-ups and Live Bets.
- **Players:** opens on the prop's own stat and line. Bars are green when ≥ the line and red when below. The − / + stepper recolors live, and the stat chips switch to other position-appropriate stats; with no prop line, the line defaults to the season average.
- **Game bets (`teamView`):** one team at a time (team chips), Total (combined points vs the line) or Margin (win = 0.5, spread = the team's line) bars, L5 / L10 / Season / vs-opp, and a footer with For · Against · Pace. Pure helper: `teamRows`.

**§57 update (Oct 20, 2026): Dig deeper is a visible button.** Every Analytics line now ends in a clear "Dig deeper ›" pill (`.oc-dig`). The whole line is tappable too. In the chart pop-up the Analytics line + button sit at the top of each bet (above the prop bars and chart), so they're visible without scrolling. The pop-up's fine-print footer was removed (minimal rule). Prop bars show which season the games are from (`.viz-season`, e.g. "2025-26 Postseason" before a new season has games). The Josh Hart 15+ spike around 1:50 AM CT on Oct 20 (95% Yes) is in Polymarket's own `/v1/price-history` (INTERVAL_1D, fidelity 1), so it stays (§55 rule: match Polymarket).

**§56/§57 update (Oct 20, 2026): current season only by default.** Last-season games are fetched but tagged `last: true`: `Viz.loadGames` (+ `prevLog`), the pop-up's prop bars, and `OurChance.teamGames`. `pickGames`, Dig deeper and the Analytics estimate use only current-season games. A current season with no games means no History part; Analytics is then Vegas + Market. Last season appears only behind a "Last season" chip at the end of the chips.

## 58. Fade Trent: dev clarifications + dev vote (Oct 20, 2026)

This is for unclear Trent bets (ambiguous leg, line, side, odds or result). It is dev-only; normal users never see it.
- **Flag.** A pick in `data/trent-picks.json` gets `needs_clarification: true` + `question` (+ `options`, `issue`). It stays `unclear` / `pending` (not counted) until decided. `js/trent.js validate` requires a question.
- **Answers.** Answers live in `data/trent-overrides.json` (`overrides[id] = {set:{whitelisted keys}, answer, answered_at}`). `Trent.applyOverrides` applies them on render (the Fade Trent tab) and in scripts. Only the `Trent.OVERRIDE_KEYS` are honoured.
- **CLI** (`scripts/trent-picks.mjs`, add `--commit` to write + push):
  - `questions`: list open questions.
  - `ask <id> --question "..." [--issue] [--option "Label|key=value,key=value" ...]`: flag + ask. With `--issue`: a GitHub issue labelled `trent-clarify` (needs an authenticated `gh`) whose body @mentions **every current collaborator** (fetched live via `gh api repos/{owner}/{repo}/collaborators`; Reed's standing permission, unclear bets only). Each option is posted as its own comment (Option A, B, C...). Devs vote with 👍 on the comment.
  - `tally <id|issue>`: counts 👍 per option. The most votes wins. On a tie, the option reedrice 👍'd wins; otherwise it comments "@reedrice decides" and stays open. The winner is written as the override, then the script comments the result, closes the issue and commits.
  - `clarify <id> --set key=value ... --answer "..."`: direct answer without a vote (closes the issue if any).
- **Dev view.** `?dev=1` on the site shows a read-only "Dev: open questions" card on Fade Trent (ids, questions, issue numbers; no secrets, no money).
- **Issue content.** Pick text, game, X post link, quote and the question only. Never money, keys or tokens.

## 59. Data archive for self-learning (Oct 20, 2026)

`scripts/archive.mjs` writes `data/archive/<kind>/<YYYY-MM>/<day>.ndjson.gz`. The kinds are picks, analytics (inputs/outputs per leg), results, vegas, trent, prices (raw Polymarket history once per closed market) and espn (team results). It is idempotent (dedupe by `key`, unchanged records untouched, `.done` markers for one-time fetches) and cheap (local files + a few public GETs). It runs after `capture-closing.mjs --commit` (`--no-archive` skips). Schema and join keys: `data/archive/README.md`. Privacy: stakes, money and secrets are stripped. Size: ≈ 2–7 MB/month.

## 60. Dev accounts: GitHub sign-in, dev = collaborator (Oct 20, 2026)

- **Today (no new infrastructure).** A dev pastes their own GitHub token in Settings (the existing token field, stored only in their localStorage). `GitHubLog.isDev(token)` calls `GET /repos/reedrice/goggins-of-gambling/collaborators/{login}`: 204 = dev, cached per tab. Only then does Fade Trent show the "Dev: open questions" card with a link to the `trent-clarify` vote issues. Non-collaborators and visitors without a token see nothing. No secrets in the repo.
- **Planned one-tap "Sign in with GitHub" (OAuth device flow).** GitHub's device-flow endpoints (`github.com/login/device/code`, `/login/oauth/access_token`) don't send CORS headers, so a static page needs a tiny proxy. Steps for Reed:
  1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Name "Goggins dev sign-in". Homepage `https://reedrice.github.io/goggins-of-gambling/`. Callback URL: the same. Tick **Enable Device Flow**, then copy the **Client ID**. A client secret isn't needed for device flow; if one is ever used, it goes only in the Worker env.
  2. Create a free Cloudflare account → Workers → Create Worker `goggins-gh-auth`. It forwards only POSTs to those two GitHub URLs, adds `Access-Control-Allow-Origin: https://reedrice.github.io`, and stores nothing.
  3. Give the bot the Client ID + the Worker URL. The site then adds "Sign in with GitHub": show the user code → poll → token in localStorage, using the same `isDev` gate. Scope: `read:user` (+ `public_repo` only if devs should vote/comment from the site).

**§60 update (Oct 20, 2026): GitHub sign-in wired.** OAuth App Client ID `Ov23li16KIAkVHvjd1mq` (public) is in `config.js` (`githubClientId`). `js/gh-auth.js` runs the device flow through the Worker in `workers/` (`goggins-gh-auth.js`, deploy steps in `workers/README.md`). Tokens expire, so the refresh token + expiry live in `betdash_gh_oauth` and `GhAuth.ensureFresh()` runs before the dev check. The "Sign in with GitHub" button in Settings stays hidden until `config.js` → `githubAuthWorker` is set to the Worker URL. The client secret lives only in the Worker's env (used for refresh).

## For Pablo (Richie's bot) — Oct 20, 2026

Tonight's changes, in plain words:

- **Charts match Polymarket.** The pop-up plots every point from Polymarket's `/v1/price-history` (All, then the Game window once live) and polls live about every 1 s using the same field as Polymarket's chart (`longQuote` / `shortQuote`). Spikes that are in Polymarket's own history stay (§55).
- **Analytics pill.** Every bet type (props, moneylines, spreads, totals) shows one button, "Analytics X% · Market Y% ›". It opens the full-screen stats sheet (code name Dig deeper, `js/dig-deeper.js`). "Dig deeper" and "Our chance" never appear in the UI. It shows **current-season games only** by default, with last season behind a "Last season" chip (§56/§57, DESIGN.md). Live Bets cards in `js/live-bets.js` got the same pill (Reed-approved override of Richie's file, see the §57 note).
- **Fade Trent dev clarification (§58, AGENTS.md).** Only when a Trent bet is unclear, it gets `needs_clarification` + `question`. `node scripts/trent-picks.mjs ask <id> --question "..." --issue` opens a `trent-clarify` GitHub issue that @mentions every collaborator (fetched fresh each time). Devs vote with 👍 on option comments. `tally <id>` counts the votes, and reedrice breaks ties. `clarify <id> --set k=v --answer "..." --commit` writes `data/trent-overrides.json` and closes the issue. Open now: #1 and #2.
- **Data archive (§59).** `scripts/archive.mjs` writes append-only gzip NDJSON under `data/archive/` (picks, analytics, results, vegas, trent, prices, espn). Re-running it is safe, and stakes, money and secrets are stripped. Schema: `data/archive/README.md`.
- **GitHub sign-in (§60).** Settings → "Sign in with GitHub" (device flow) goes through the Worker `https://goggins-gh-auth.reedrice9.workers.dev` (code in `workers/`). Dev tools show only for repo collaborators. There's no CLIENT_SECRET yet, so expired tokens can't refresh: the user just signs in again.

**What Pablo should do:**
1. Keep running the live tick as before.
2. Run `node scripts/archive.mjs` after each capture-closing run (it runs automatically after `capture-closing.mjs --commit`), and commit `data/archive/` if it changed.
3. Check open `trent-clarify` issues (`gh issue list -l trent-clarify`). When one @mentions Richie (@rgarzz), tell Richie the question and link. Do **not** vote or comment for him; only he votes.

## Live Bets fix: why it was blank + new schedule (Oct 20, 2026, Pablo)
**What broke**
- Last night (MNF WAS@SF) nothing ran `live-watch.mjs` after kickoff (see §47), so the file froze at pregame and no alerts were ever made. With zero alerts, `data/live-record.json` stays 0-0-0; nothing to grade.
- Today the tick ran from a shell loop on my computer, but that computer pauses when idle, so the loop fired once (11:14 AM CT) and then stalled. Log showed 1 tick in 2+ hours.
- The Discord step ran `live-discord.mjs` with no `--slug`, so it defaulted to the old MNF game and never posted new edges.

**What changed**
- NEW `scripts/live-run.mjs`: pull, `live-tick.mjs --push`, then `live-discord.mjs --slug X` for each non-final game in `data/live/index.json`. Always exits 0, never prints secrets, skips Discord if no webhook is set.
- Schedule moved from the shell loop to a server-side scheduled run every 10 min, 11:00 AM-12:59 AM CT, that wakes my computer and runs `node scripts/live-run.mjs`.
- Test tick 1:31 PM CT: BOS@DET published (pregame, 0 edges yet, which is expected until prices move off the opening line after tip).

## For Pablo: Kalshi badges on Live Bets cards (Oct 20, 2026, Reed's bot)
Pablo, Reed asked for this and OK'd touching your Live Bets files. All changes are additive:
- **New `scripts/live-kalshi.mjs`.** After each successful `live-watch.mjs publish`, `live-tick.mjs` calls `annotateGame()`, which sets `edge.kalshi` on every edge (`true` = Kalshi has the same market, `false` = we checked and it's not there, `null` = couldn't check) and `d.kalshi_checked`. It's wrapped in try/catch, so it can never fail your tick.
- **Matching:** the full-game moneyline, spread (the minus team's "wins by over L"), total (`floor_strike` = line), and props (same player + stat + N+, using KXNBAPTS, KXNBAAST, KXNHLPTS and the rest). Quarter, half and team-total lines come back `null` because there's no Kalshi series for them in the table.
- **Cost:** about 2–11 free GETs per game, cached in `.cache/live-kalshi/` (gitignored) for 10 minutes.
- **UI:** `js/live-bets.js` `platRow()` and `platBadges()` add "Polymarket ✓" on every card, "Kalshi ✓" when the value is true and a dim "Kalshi —" when it's false. Nothing extra shows for null. Tapping a badge shows a one-line note. The styles are at the end of `css/live-bets.css`.
- **If you run publish without tick**, the field is missing and the cards just show Polymarket ✓.
- **Tests:** `tests/live-kalshi.test.mjs`.

## For Pablo: no edges on sides the app won't sell (Oct 20, 2026, Reed's bot)
Pablo, this is a Reed-approved change to your files. Reed saw "take No" on Ausar Thompson rebounds, but the Polymarket US app only offers Yes on that prop.
- **The real reason:** the gateway's `markets[].marketSides[]` entries each carry a `tradable` flag. For BOS@DET, 282 of 299 props have `No: tradable:false`. All game lines (spreads, totals, moneyline) and 17 props are tradable on both sides. NHL props checked today were tradable on both sides. A side with `tradable:false` may still have a `price`/`quote`, so a price is not proof you can buy it.
- **`scripts/live-watch.mjs`:**
  - New `sideBuyable(m, i)`.
  - `buildLive` skips a side whose `tradable` is false and adds it to `outOfLimit`, so it drops quietly with no "gone" card. The same handling covers edges listed before this change.
- **`js/markets-core.js`:** `compactMarket` writes `yes_buyable:false` / `no_buyable:false`, only when false, into the data/markets snapshot.
- **`scripts/update-picks.mjs`:**
  - `picks` and `add-picks` now REJECT incoming picks or legs on a side the snapshot marks unbuyable (`unbuyableLegs`).
  - **The 7 AM digest must only pick buyable sides.** Run `fetch-markets.mjs` before writing picks so the snapshot has the flags.
  - Today's lottery tickets (lotto-7/10/14/19) already had NBA "No" legs that can't be bought (SGA 8+ assists, Brunson 30+ points, and others). Those were written before this check.
- **Tests:** `tests/buyable.test.mjs`.

## Lottery tickets: swapped legs you can't buy (Oct 20, 2026, 3:15 PM CT)
Reed's call. In `2026-10-20-lotto-7`, `-10`, `-14` and `-19`, every NBA "No" leg the app won't sell (`tradable:false`) was swapped for a Yes leg you can buy, at about the same price (fresh Polymarket US asks; the fair price is the mid). The swaps were done with `add-picks --replace`, which now checks that each side can be bought.
- SGA 8+ assists NO → SGA 1+ steals YES
- Brunson 30+ points NO → Josh Hart 1+ threes YES
- Maxey 25+ points NO → Maxey 1+ steals YES
- Brunson 8+ assists NO → OG Anunoby 15+ points YES
- Vassell 15+ points NO → De'Aaron Fox 1+ steals YES

No new legs come from games that already started, and none bet against Reed's open bets or the other picks. Watch out: lotto-14 and lotto-19 still have the BOS@DET Celtics +4.5 leg (that game has started) and are over the 10-leg combo limit, so they can't be placed as written.

## Two-line game charts, Polymarket look (Oct 20, 2026, Reed's bot)
Reed wanted live charts to look like Polymarket's game charts. In `js/viz.js` `priceSection` / `drawChart` / `paint`:
- **Game markets** (moneyline, spread, game/team totals; anything in the event whose `marketType` isn't `props`) draw **two stepped lines**, one per side, long side first (away team / Over). Names + colors come from the Polymarket US event's `marketSides` (`team.safeName`, `team.colorPrimary`), lifted if too dark (`legible`), else the `TEAM_COLORS` map (NBA/NHL/NFL/MLB), else green/blue. Over/Under are green/blue.
- Each side uses **its own Polymarket price**: history `longPrice`/`shortPrice` (same All + 1D + 1H windows), live BBO `longQuote`/`shortQuote` every ~1 s. Only when the other side has no data of its own (our live-tick file / saved points) does it fall back to `100 - x` (`complement`).
- A dot at each line end with the name + big whole % beside it (labels nudge apart when close). No y-axis or grid in this mode. Tap / hover reads both sides at that time.
- **Score header** (BOS 58 · Live / End Q2 · 45 DET) comes from the Polymarket US event (`score`, `period`, `live`, `teams`), the same feed Polymarket shows, refreshed every ~8 s.
- **Props** keep one Yes line (that's what Polymarket shows), now also stepped.
- Zoom, range label, 1 s live, never-blank states unchanged. Pure helpers exported and tested in `tests/viz.test.js`.

## Two-line chart polish (Oct 20, 2026, Reed's bot)
- Two-line game charts drop the empty y-axis strip on the left (`lOf`) and the "📈 Price over time" heading.
- The tap read-out shows only the period name. The saved period mark's score was from the start of that period and contradicted the live header, so it's no longer shown.
- tests/record-slip.smoke.js now expects "Analytics" (renamed from "Our chance"). The old check was a stale test, not a bug.


## Routines handoff (Oct 20, 2026)
Reed's 5 routines can be run by any bot (grok, chatgpt, pablo). Only the owner in `routines/owners.json` runs each one. See [routines/README.md](routines/README.md). Every run starts with `node scripts/routine-gate.mjs check <id> <me>` and ends with `stamp`.


## 61. ChatGPT temporary live-feed takeover (Oct 20, 2026)

Reed authorized ChatGPT/Codex to maintain Pablo's Live Bets and live feed while Pablo is usage-limited, and requested shared notes. The owner is now `routines/owners.json` -> `live-feed-update: chatgpt`. Full operation, schedule, limitations and handback: [routines/LIVE-FEED.md](routines/LIVE-FEED.md).

Fixed Windows file URL handling and the Linux-only scratch path in live-watch; a real tick now refreshes both tracked events. live-tick now returns nonzero on discovery/publish/push failure. live-run checks the owner (old Pablo wrapper calls skip), supports `--owner chatgpt --no-push` for connector publication, and stamps only after a successful tick. A local Codex heartbeat runs every 10 minutes; it requires Codex/computer availability. No other Grok routines or Discord schedules were transferred. External direct tick schedules cannot be disabled here and must be paused or gated by their owner. Existing openings, filters, history and Live Bets UI are preserved. Tests: live-watch 23, live-context 11, live-kalshi 5, routine-gate 4, calc, github-log and picks validation passed.

### Section 61 publishing follow-up
Reed reauthorized local gh CLI. Connector writes returned 403; Git Bash credential helpers cannot run in this Windows sandbox. Use `live-run.mjs --owner chatgpt --no-push` then `publish-live-api.mjs` (gh API credentials stay managed by gh). Publisher verifies latest main and uses a fast-forward-only ref update. Check remote publication rather than trusting a local run stamp.


## 62. Fade Trent new-post watcher (Oct 20, 2026, ChatGPT)
Reed reported missing new picks and asked for automatic updates. Root cause: only Grok's daily digest imported X posts; no dedicated watcher. Added `trent-post-check` owned by chatgpt and a five-minute Codex heartbeat. Operation and access limitations: `routines/FADE-TRENT.md`. Browser verified NBA post 2112579730297983307; imported three picks without inventing odds and graded Celtics ML loss using ESPN final DET 121?BOS 113. Partial public access is recorded honestly; the full-read watermark stays unchanged. New trent-import validates source/id/timestamp, stable per-pick ids, repeat-import deduplication and preserves grades. Fade Trent now refreshes every minute while visible and on return, with last-check/coverage text. No new tab. API publisher accepts an optional --message for accurate commit descriptions.

### Section 62: signed-in catch-up (Oct 20, ChatGPT)
Reed signed into X in-app (@w0densday) and asked for full catch-up. Reviewed Posts and Replies back to the previous 04:22:05 UTC cutoff. No additional clear game picks beyond the three already imported. Added season-long lineup 2112584568998068608 as unclear/pending, excluded from record. No exact image-only lines or odds invented. Monitor now records signed-in source, reviewed ids, replies review and a complete watermark; cursor cannot regress on backfill. Five-minute watcher updated to use the signed-in session and both timelines.

## 63. ChatGPT: full upcoming Live Bets slate (Oct 20, 2026)

Reed requested upcoming games in Live Bets. Default ticks now capture all supported two-team games scheduled today in America/Chicago, including late games after UTC midnight, plus unfinished games from the last 24 hours. Explicit --lead N retains a narrower window. Discovery requires exactly two event teams, excluding leader/futures markets. The old NBA points-leader file is preserved with is_game:false and excluded from the index. Initial captures establish real opening prices; edges require later price movement. Existing chatgpt-owned ten-minute heartbeat refreshes the full slate. No UI change or version bump. Opening prices/history are preserved. Tests cover late games, next-day exclusion, DST and synthetic markets.

Publisher also includes new untracked data/live files, so each new daily slate is published rather than only previously tracked games.

## 64. Fade Trent polling reduced (Oct 20, 2026)

At Reed?s request, changed the active Codex Fade Trent heartbeat from every five minutes to every two hours. Updated owner schedule and operating notes. Live feed remains on its existing ten-minute schedule.

## 65. Live Bets: All games filter (Oct 20, 2026)

Reed explicitly requested combined edges across every game, authorizing this edit in Richie?s view. All games is now the default with individual game chips retained. Fetches all nonfinal feeds, combines/sorts edges and alerts, keeps original event URLs and chart targets on every card, and labels each card with its game/status. Partial fetch failures are visible; request sequencing prevents an older refresh overriding a newer filter selection. Existing grouping/show-more and odds/injury filters remain. No feed writer changes. Tests cover source attribution, overlapping keys, ordering, final exclusion and partial results.

## 66. Brandon Picks sandbox (branch only)

Reed requested an isolated clone for Brandon to simplify Today's Picks without affecting production. Branch sandbox/brandon-picks starts at 8077f93 and adds only sandbox tooling/documentation and branch-specific instructions. Run node sandbox/serve.mjs at 127.0.0.1:8877. Production HTML/assets remain unchanged; the local server injects an early write guard and banner. Local origin isolates browser storage; fetch/XHR mutations, beacons and form submissions are blocked to reduce accidental shared writes. No new scheduler/deployment. Read sandbox/README.md; use PR review before any production merge.
