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

## 66. Brandon sandbox and required production review (Oct 20, 2026)

Brandon (apexlegend883-pixel) is experimenting with a less cluttered Picks screen in the separate reedrice/goggins-picks-sandbox repository and Pages preview. Production is maintained independently; there is no automatic promotion.

Reed grants Brandon (apexlegend883-pixel) and Brandon's bot standing permission, effective Oct 22, 2026, to make, merge and publish site changes in reedrice/goggins-of-gambling and reedrice/goggins-picks-sandbox without asking Reed or Reed's Codex agent for per-change approval. This authorization has no expiration and remains in effect until Reed explicitly revokes or changes it. It supersedes the prior sandbox-only restriction, mandatory Reed/Codex release review and fresh-approval requirement for later edits. Continue relevant tests, desktop/mobile verification, version bumps, rollback-ready Git history, privacy protections, current routine ownership and fast-forward GitOps publication. Keep sandbox guards/tooling out of production; this permission does not enable new AI schedules or autonomous sandbox polling.

Bring across only approved changes after checking Picks filters, refresh, charts, Analytics, sharing, builder links, Play and other tabs. Preserve production data, routines and browser storage; exclude sandbox tooling. Follow version-bump and deployment verification rules.

## 67. On-demand longshot combo generator (ChatGPT, Oct 20, 2026)

Reed requested a lottery-style combo from live and upcoming same-day game lines/player prop bets. Build a Bet now has a collapsed Longshot combo panel, 3-6 legs, and Mixed/Game lines/Player prop bets choices. Each click reads fresh Polymarket events for today in America/Chicago, excludes known final/closed/non-team events, requires buyable quotes in the 17-55 point range with bid/ask width at most 6, and selects at most one leg per game. Player markets require a team in the event. No stale-snapshot fallback or claimed predictive edge. Whole-dollar illustrative payout multiplies standalone prices under independence, explicitly not a guaranteed executable platform combo quote. Preview includes source game, price, charts and oldest price-check time. Use in builder explicitly confirms replacement of existing legs and refreshes prices through the existing picker; previews expire after two minutes. Generator does not submit orders or write shared data.

Implementation js/combo-lab.js, small picker.makeLeg export, scoped app mounting and STR strings. Existing builder/manual behavior retained. Tests cover dates, finals, tradability, missing/wide quotes, invalid player attribution, unique games, count and payout math; fresh source check found enough eligible games. Live-feed and Fade Trent ownership unchanged.

Section 67 follow-up: Reed requested 10, 15 and 19 legs too. Selector now offers every count from 3 through 20. Explicit Allow same-game legs checkbox permits additional distinct player markets when separate games are insufficient. Keeps at most one game-line market and one selection per player in each event to avoid directly opposing/nested lines. Same-game correlation warning remains visible; no true combined chance or executable quote is claimed. Insufficient markets returns no partial combo.

### Longshot full-game market correction (Oct 20, ChatGPT)
Reed caught ambiguous totals while trying to reproduce a generated combo. Period/half totals were losing period context in Picker side descriptions. Longshot generation now restricts non-player markets to the normalized full-game lines group; period/half/team markets are excluded. Regenerate older previews; they cannot safely be mapped from the shortened labels. Regression checks cover period and unknown-group exclusion. Existing manual picker behavior unchanged.

## 68. Brandon sandbox UI promoted with Reed approval (Oct 20, ChatGPT)

Reed explicitly approved all current sandbox changes at 3f8b382. Ported compact Picks disclosures, matchup names/logos, league score ticker, Live Bets edge/game filters and activity, and ESPN game/player progress. Applied only UI/modules/tests to current production; preserved combo generator, market snapshots, live feed/history, Trent, routines and private storage. Excluded sandbox guards, publisher and old index/version. Rollback base 652bf6bd26325c6f517f3d3408d343d528f60e46; revert the release code only, preserving later data updates.

Review corrected No-side game margins and refuses unrecognized period/half contracts rather than using full-game stats. No settlement grades or feed jobs are written by browser progress. All 35 unit test files passed; 18 progress cases passed after corrections. Local preview connection timed out, so browser preflight used the approved hosted sandbox: Details and real progress checked at desktop/mobile, with final integrated production checks after publication. Version bumped. The former fresh-approval requirement was superseded by Reed's Oct 22 standing authorization (see AGENTS.md).

## 69. Broader Today's Picks sports (Oct 20, ChatGPT)
Reed requested college football/basketball, soccer, tennis, NFL, golf and MLB. All supported sport filters now remain visible; aliases normalize college/tour labels, combos still match each sport, and empty sports explicitly say no published picks. Existing NBA/NHL/WNBA retained, including women's college basketball. Score ticker adds ESPN college football, men/women college basketball, ATP/WTA and PGA/LPGA. Tennis uses individual match statuses and per-set games; golf shows tournament status without invented two-player scores. Public ESPN payloads verified; tests cover both shapes. Existing team sports/soccer retained. No picks fabricated or Grok routine run.

Request for daily-slate-odds-digest owner (Grok): expand verified daily slate/pick coverage across these sports when markets/data are available. Current published picks file is NBA/NHL only; filters and scores do not create new analyzed picks. College/tennis/golf market ingestion and analytics require verified source mapping before claiming full bet coverage. Ownership unchanged. Brandon release deployment 0b010e0 succeeded; browser integrated interaction check timed out, so do not claim a complete production UI walkthrough.

## 70. Picks sport filters wrap (Oct 20, ChatGPT)
Reed reported the expanded sports row clipping off-screen. Scoped Today's Picks filters now wrap onto additional rows instead of inheriting the generic single-row strip with a hidden scrollbar. Long labels can wrap within the available width. Other chip groups unchanged. CSS-only fix; no new test logic or data changes.

## 71. Manual Live Bets feed refresh (Oct 20, ChatGPT)
Reed requested a manual new-edge check, authorizing Live Bets UI edits. Persistent Check for new edges button immediately reloads the published index and game JSON using cache bypass and 15-second request timeouts. Disables during a request, reports unchanged/new published data or failure, retains last good cards on failure, and preserves current game/tier/Details state. Automatic refresh skips an in-flight request; existing request sequence guard handles game changes. This is a client feed refresh, not a server-side scan trigger: the existing ten-minute ChatGPT market scan remains unchanged. No secrets, GitHub credentials or background writer added to the browser.

## 72. Live Bets sport then matchup filters (Oct 20, ChatGPT)
Reed requested sport-first selection followed by teams. Added Sport dropdown (All sports plus NFL/NBA/college/soccer/tennis/golf/etc.) and Team / game dropdown narrowed to that sport. Selecting a sport resets the matchup to All games and loads only its published nonfinal feeds. Existing tier filters, source URLs/chart targets and manual refresh retained. Soccer league prefixes collapse into Soccer; college/tour aliases normalized; unknown feeds retain their own category. Empty sports display no qualifying edges, not invented games. This UI does not extend the feed writer's existing sport coverage. Tests exercise cross-sport exclusion, empty/all categories, soccer grouping and final handling.

## 73. Private browser Polymarket account sync (Oct 20, ChatGPT)
Reed authorized read-only account syncing, live progress for My Bets, and running totals. Verified Polymarket US API CORS allows signed portfolio GETs from browser (OPTIONS 204; unauthenticated GET 401). Added Polymarket account panel to My Bets: user enters API credentials directly into their own HTTPS browser, chooses a 12-character local unlock password, and keys plus full account cache are AES-256-GCM encrypted with PBKDF2-SHA256 (310k iterations, random salt/nonce). Store vault is excluded from manual backup/export/sharing. Unlock material stays in memory; page reload locks it. No shared private data or credentials. API key scope remains potentially broad at exchange, but code allowlists only GET positions/activities on api.polymarket.us with redirects refused; no trading or funds endpoints. User must complete connection in their browser; do not claim connected before successful sync.

Positions and complete paged activities poll every 30 seconds while visible/unlocked. Failed pagination/auth/network preserves last successful cache with error. Imported positions are separate from manual ledger to avoid double-counting bankroll or existing bets. Reported realized settlement deltas generate gains/losses/net and W-L-Even per settlement, deduplicated by trade ID or market/time. Missing delta fields make money totals unavailable, not fabricated zeroes. Spending/sale totals require confirmed fills with explicit direction and cost basis; documented activity does not guarantee direction, so this may remain unavailable pending real-payload verification. These metrics are not guaranteed lifetime totals beyond API-retained history; sold positions are not graded as settled wins.

Extended BetProgress to visible My Bets (manual legs plus imported position/combo leg metadata), 15-second ESPN polling/cache, with source checked time. Missing/unsupported stats stay explicit. Fixed saved-leg side/description/marketId mapping. API data uses textContent; no secrets in HTML attributes. Old Windows local-only helper remains on feature/private-polymarket-sync, unused by this browser route; localhost blocked in session. No feed/routine changes.

Section 73 validation also found the earlier expanded config sports list advertised unsupported market integrations and failed sports.test.mjs. Split Picks filter categories into picksSports while preserving the actual integrated sports list; all requested Picks categories remain visible. This fixes that prior regression without inventing league/Kalshi/ESPN mappings.

Validation: all existing unit files passed except the prior sports wiring regression, which now passes after the category split. New sync tests cover real Ed25519 verification, large vault encryption, wrong-password/tamper rejection, GET-only/host restrictions, pagination errors, settlement deduplication, missing spend direction and combo leg identity. Progress suite passes 19 cases including saved-leg mapping. No real credentials used in automated tests.

## 74. Readable account activity (Oct 20, ChatGPT)
Reed found raw market slugs, TRADE_STATE_NEW and missing cost fields confusing. Activity now starts collapsed, uses an available human market title or neutral Bet/Combo bet fallback, and says Trade recorded or Settled without implying a pending API trade is filled. No raw IDs, API enums or unknown cost placeholders appear in this list. Disclosure state survives automatic sync redraws. Simplified footer; account sync and private storage unchanged. Progress mapping limitations remain unresolved and must not be presented as working.
Open position headings also use leg counts for combos instead of crossd IDs; summaries show reported cost and current value without net-contract jargon.

## 75. Account leg progress resolves public market details (Oct 20, ChatGPT)
Reed connected the account; read-only check confirmed syncing but all imported leg progress was unavailable because portfolio metadata lacked full labels. BetProgress now resolves exact market slug and long/short side against public event markets, with credential-free requests cached ten minutes per game. Labels regain team/spread, Over/Under target or exact player name/threshold. Selected team sides are normalized once to avoid double inversion; player No retains under semantics. Every imported combo leg gets its own progress host. Unknown markets remain unavailable rather than inferred from abbreviated IDs.

Added signed score-margin meter (center = covering boundary), alongside existing regulation clock bars; stat and total bars show verified current value against target. Recognized fh/sh and quarter IDs use only corresponding ESPN splits; second half includes available overtime and waits until its start. Unrecognized periods and missing player statistics stay unavailable. Decimal sub-minute ESPN clocks now produce elapsed bars. Thirty progress/account tests and no-instructions checks pass. No trading endpoints, account-data publication, manual ledger changes or settlement auto-grading added.
Live public-data verification caught future-quarter split absence during Q3. Only not-yet-started quarters count as zero within an already-started half; a missing current/past split remains unavailable. Added regression test.

## 76. Plain-language bet progress and clock transitions (Oct 20, ChatGPT)
Reed found adjacent margin and elapsed-time bars confusing. Removed elapsed-time bars from bet progress. Win and spread legs now lead with plain team-specific status (down/up/tied, covering, or extra score margin needed); player/total targets retain current/target bars and clearer remaining/under-limit notes. Margin bar has an explicit center marker and behind/ahead guide. Shared renderer applies to imported singles, every combo leg and other existing progress hosts. Final text describes game statistics only, not exchange settlement.

ESPN public scoreboard and summary currently show a normal fourth-quarter clock, but a prior screenshot showed transient 0.0. Renderer now keeps score, quarter splits and clock together from the scoreboard snapshot, instead of mixing summary game status. Active zero clock is labeled Clock updating until the source identifies a period break or completed game; only completed:true displays Final. No inferred ticking clock or fabricated end-of-game state. Tests cover transition zero, normal fourth quarter, halftime/final and outright/spread status wording; 33 account/progress checks and no-instructions tests pass. No private data or credentials committed.

## 77. Combo compatibility guard (Oct 20, ChatGPT)
Reed requested an alert or prevention for legs that cancel each other out after a full-game/second-half combo proved incompatible at halftime. Generated combos now strictly use one leg per event, even if an old caller supplies allowSameGame:true; removed same-game toggle. The requested 3–20 counts remain available only when enough different games have eligible markets. Returns no combo when insufficient rather than adding unverified same-game legs.

New shared ComboSafety checks exact opposite sides of a market, duplicate outcome legs, shared game identity and missing event identity. Builder blocks saving known opposite/duplicate markets and suppresses payout/chance estimates for those slips; same-game/unknown combinations show a prominent compatibility warning and can only be saved with explicit confirmation as records of existing bets. Play-money creation refuses unverified same-game/unknown or known conflicting slips. Published combo cards and synced account combo cards also display warnings; actual account records are preserved. Public wording explicitly states that same-game compatibility is unverified, not that all same-game combinations are impossible. This conservative guard does not claim to solve every cross-market/player/period constraint or infer halftime from odds. Individual market cards are independent; availability of two singles is not an assertion that they combine. Tests cover prior full-game/second-half pair, opposing sides, duplicates, distinct games, unknown identity, snake-case imported fields and generator refusing repeated-game 19-leg output. No trading capability or private account-data publication.

## 78. Remove same-game compatibility false alarms (Oct 20, ChatGPT)
Reed showed a compatible Shai assists plus Harper rebounds combo incorrectly warned. Removed same-game and unknown-identity warnings and their save/play confirmation gates. A shared event alone is never evidence of incompatibility. Actual opposite outcomes, duplicate entries (separate duplicate label), and contradictory alternate thresholds for exactly the same player/stat/game/period still trigger guards. Threshold checks require matching canonical market families; they do not compare unrelated players or full-game versus half markets. Added regression tests for the user's compatible player pair, unknown metadata, incompatible/compatible alternate targets and period separation. All five guard tests plus no-instructions pass. Generator remains one leg per game; this does not claim exhaustive detection of cross-period conflicts requiring halftime data. This supersedes the broad warnings in section 77.

## 79. Verified halftime cross-period compatibility (Oct 20, ChatGPT)
Reed correctly noted removing blanket warnings also removed the alert from his genuinely conflicting full-game/second-half combo. Added a separate verified-stat guard in BetProgress for imported account positions. After exact public market-side labels and ESPN halftime splits load, full-game and second-half win/spread outcomes are expressed as strict bounds on the same final away-minus-home margin. Second-half bounds include the verified halftime margin; integer-score feasibility determines conflict. This catches Spurs +11.5 full game versus OKC -1.5 H2 with halftime 65–44, without flagging independent player prop bets or compatible same-game spreads. Missing halftime/current period/team identity leaves the check inconclusive, never guessed. Alert updates with per-leg hydration and stays separate from static duplicate/opposite checks.

Regression covers Reed's exact scores and lines, compatible same-game side, unrelated game, missing splits and compatible player pair. 31 progress/guard tests plus no-instructions pass. Current live-stat guard is on synced account combo cards; generator remains one leg per game and builder static checks remain unchanged. No private account data or keys stored in repo.

## 80. Scheduled public Record closeout (Oct 20, ChatGPT)
Reed requested the Record tab update after each day's last game. Added scripts/record-closeout.mjs and routines/RECORD-CLOSEOUT.md. Existing feed heartbeat now invokes it after tick, commits only the four changed public Record data files and publishes alongside the feed via gh API; no independent scheduler or other routine ownership change. Ready slate dates require all indexed games final, independent of the next day's games. Pending predictions grade only from exact, unambiguous official ESPN finals with matching team; unsupported/draw/ambiguous outcomes remain pending. Existing settlement graders refresh history/live alerts and learning, retrying pending exchange settlements on later passes. Historical-ready slates also permit settled individual history to update before current day's last game. No private account data is published. Record tab fetches current data whenever opened.

Tests cover final-slate gating, late/next-day games, exact official winner/loss matching and rejection of ambiguous/nonfinal games. First run refreshed already-settled public history while today's prediction slate remains pending until its last tracked game. Heartbeat updated through automation tool, not raw config edits. Computer availability and Pages delay still apply. Later maintenance must preserve simultaneous Grok grades and notes.

## 81. Record tab uses existing published-pick log (Oct 20, ChatGPT)
Reed clarified that Record is the site's Picks-screen bet log, not private account tracking or a separate game-winner forecast leaderboard. Confirmed Grok's existing capture-closing history and graders already provide that log; preserved all history and settlement scripts. Record now renders data/pick-history.json only, grouped once into Game lines (moneyline/spread/total), Single bets (remaining one-leg picks, including player markets), and Combos (2+ legs). Removed separate prediction leaderboard/calibration/price-comparison panels from this view, not their stored data or learning pipeline. Shows history update timestamp and all logged rows instead of truncating at 40. Push/void rows no longer count as unfinished.

Existing log has 62 rows: 14 game lines, 25 other singles and 23 combos. Verified every currently published eligible market pick is already present in history. Group partition and closeout tests plus no-instructions checks pass. Historical bankroll/private account data never included. Continues to use the daily closeout heartbeat and existing settlement grading; unpriced/non-market commentary is not fabricated as a settled bet. This supersedes the older Game Winners section shown from predictions.json.

## 82. Progress on Live Bets Record cards (Oct 20, ChatGPT)
Reed identified missing bars on the Live Bets Record list beneath the live feed. These cards used a separate renderer. Added the same read-only BetProgress hosts to every displayed record card with a known side, for pending live stats and final game stats. Resolve numeric alert market IDs against exact public event markets, then retain canonical market slug for period parsing and chosen-side team/player labels. Added Vegas slug alias veg to ESPN VGK. Existing waiting/won/lost badges still reflect exchange settlement, independently of ESPN stat progress; missing player stats/unsupported periods stay unavailable. No record grades, feed math or private account data changed. Twenty-seven progress tests plus no-instructions pass, including numeric alert ID, selected No spread and Vegas matching regression.

## 83. Uniform progress styling and correct selected-team labels (Oct 20, ChatGPT)
Reed reported inconsistent progress bar appearance across Picks. Replaced browser-native progress/meter controls with one shared 10px rounded track/fill component, consistent label rows and single checked/final footer, plus a center marker only for score-margin bars. Accessible progressbar/meter roles retain min/max/current values and descriptive labels. Green means currently meeting target/covering, red means behind/over a limit or final shortfall, blue means a still-open target not yet reached. Under markets no longer share one amber color regardless of outcome. Fixed My Bets label flex selectors that had been scoped only to Picks. Shared renderer applies across Picks/Live Bets/My Bets/Live Bets Record.

Screenshot also exposed a selected-team inversion: Spurs to win (No on Thunder) was labeling Thunder as ahead. Public market-side resolution now runs for every identified market, once, and normalizes the displayed chosen side before calculating margin. If the exact market cannot resolve, show unavailable rather than guessing/inverting an already selected-team label. Regression asserts Spurs selected No-side shows Spurs behind 12 for final OKC 116–SA 104. Twenty-eight progress checks and no-instructions pass. Existing 15-second ESPN updates retained.

## 84. Collaborative live-alert quality feedback (Oct 20, ChatGPT)
Reed requested gradual positive/negative associations from Reed/Brandon/Richie, not instant reaction to a win/loss. Added Juicy/Bad alert controls and optional public notes on settled Live Bets Record cards. Submissions go to GitHub issues with live-feedback label, directly with existing site GitHub token where permitted or via explicit prefilled GitHub fallback requiring the user to finish submission. No credential setup or PowerShell requirement. No real reviews fabricated; label created, initially zero reviews. Counts and team notes show from public snapshot after scheduled sync.

Importer verifies actual GitHub authors against repository collaborators, known settled alert IDs and strict schema; one latest review per collaborator per alert. Records retain source links and optional notes, no private account/bankroll data copied. Currency/credential phrases rejected; notes treated as untrusted observations. Pattern memory groups sport/type/segment/tier, averages reviewers per alert and shrinks toward neutral with ten prior observations. Ten distinct reviewed alerts plus two reviewers makes a pattern eligible for measured rule review. This supplies persistent positive/negative evidence to bots; it does not automatically rewrite price/probability/edge math or erase losses. Scheduled feed prompt updated to read feedback, sync and publish data/live-feedback.json with the four existing public Record files. Other routine owners unchanged. See routines/LIVE-FEEDBACK.md.

Tests cover public allowlist, invalid/pending/private inputs, canonical GitHub form URL, noncollaborator rejection, latest-vote deduplication and conservative association eligibility. No test issue/comment posted. Users initiate all feedback submissions.

## 85. Two-button feedback entirely on site (Oct 20, ChatGPT)
Reed removed optional notes and requested no GitHub feedback-form detour. Juicy/Bad alert buttons now directly submit the selected rating; no form, textarea or separate Share button. Counts update only after API acknowledgement, replacing the current author's previous displayed vote rather than adding a duplicate. Errors do not claim success or open an issue form. Shared issue storage/import and conservative pattern memory remain unchanged; historical notes remain valid data but new UI sends an empty note.

Browsers lacking an authorized site GitHub token show an inline Connect feedback action. Existing device-flow worker handles one-time GitHub authorization, requesting read:user/public_repo only for the feedback connection; default Settings sign-in remains read:user. GitHub OAuth's public_repo grant is broader than issues-only, so the inline explanation explicitly states public-repository access before user action. User performs GitHub authorization themselves; no credentials copied or embedded. After success the originally selected rating submits on site. If denied or still unauthorized, show failure, never pretend saved. No new backend secret or Polymarket access. Five feedback tests cover acknowledgement, count replacement, failure and unauthenticated states plus existing schema/privacy/collaborator/association checks. No real vote submitted during testing.

## 86. Expanded edge discovery for today and tomorrow (Oct 21, ChatGPT)
Reed requested options before games begin, across tracked sports including tennis and hockey. Default feed now captures Chicago today/tomorrow plus recent unfinished games, using event start timestamps rather than slug dates. Added college football/basketball and configured soccer leagues plus ATP/WTA singles/doubles. Verified actual public gateway tennis and soccer market types; distinguish tennis game/set spreads and totals, and set winners. Soccer full-time winners remain Yes/No when a draw means the opposing side is not the other team. Four concurrent event subprocesses have distinct files, one final index writer, per-event timeouts and aggregated failures; wrapper timeout expanded. Existing price thresholds/liquidity/tradability/openings/history are preserved. New captures require later movement before edges appear; no fabricated pregame alerts. Missing ESPN context explicitly unverified. Golf tournament futures currently have no two-team event and remain outside this live-game feed; minor tennis tours not included. No private data or trading added.

## 87. Live alert record by sport (Oct 21, ChatGPT)
Reed requested the same record statistics broken out by sport. Added a By sport table directly below existing All/Big/Slight totals, retaining all original columns and flat-one-unit settlement math. Canonical sport groups combine soccer leagues and ATP/WTA singles/doubles while separating college/pro and women’s college basketball. Empty sports show zero graded and unavailable rates rather than invented performance. Pending/push/void handling matches the main table; tests prove every alert partitions once and totals reconcile. Scheduled grader refreshes by_sport with each settlement pass. Expanded event discovery also requires daily closeout to use actual Chicago start dates, not tennis tournament slug dates; fallback retained for legacy rows without start timestamps.

## 88. Distinguish empty coverage from stale prices; default to now/today (Oct 21, ChatGPT)
Reed reported an older zero-game Tennis screen with a misleading old-data banner. Empty successful aggregate selections no longer count as stale solely because they have no oldest timestamp. Added When selection: Now & today (default), Tomorrow, Today & tomorrow. Chicago calendar boundaries use actual event start times; ongoing overnight games remain in now/today. Existing sport/team filters apply within that window. Empty selection and freshly checked markets without qualifying movement have distinct messages; no lowering of thresholds or invented edge cards. Expanded scheduled scan captured an actual qualifying tennis movement on its second pass, preserving the original baseline. Regression covers Chicago midnight, overnight live inclusion and empty nonstale selection.

## 89. Modern price-chart visual overhaul (Oct 21, ChatGPT)
Reed disliked blocky staircase charts. Prepared two SVG design directions locally, then implemented restrained Aurora: bounded cubic curves, low-opacity series fills/glow, refined dark surface, compact typography and separate responsive quote cards instead of clipped SVG end labels. Game charts use full plot width and original team colors. Single-series charts share the curve/fill treatment. Curves pass every real sample with controls bounded to segment endpoint values; no price data, smoothing averages, chances or historical samples are changed. Tap/hover readouts still use actual samples, and zoom/pan/pinch/reset/live controls remain. Updated DESIGN override to supersede prior stepped Polymarket styling. Tests verify exact endpoint/control path and input preservation plus existing chart tests.

## 90. Optional read-only Kalshi account connector (Oct 21, ChatGPT)
Reed requested My Bets support for Kalshi users alongside his existing Polymarket account. Added independent encrypted Kalshi vault, optional My Bets card, Ed25519 and RSA PKCS8/PKCS1 signing, verified read-only scope gate, GET-only fixed endpoint access, bounded cursor pagination and atomic snapshot replacement. Open positions refresh every 30 seconds while visible/unlocked; settled/live and historical position/fill data refresh about every five minutes. Histories are deduplicated at their handoff boundary. Settled record uses reported position P/L sign, not per-fill wins; missing values stay unknown. Spending/sales use explicit fill direction, quantity and side price; no volume inference, fees excluded. Manual and platform ledgers stay separate; no combined/lifetime claims. Human-readable market titles fetched where available; unavailable metadata uses a neutral label, never a raw ID. Both vaults excluded from exports/sharing; existing Polymarket behavior preserved.

Production browser-origin Kalshi requests returned 403, while server requests without Origin succeed. Prepared separate stateless Cloudflare relay with strict GET route/query allowlist, fixed upstream, origin/timestamp checks, no logging/storage/private-key handling. Deployment requires access to Reed's Cloudflare account; no Cloudflare credentials are configured in this environment. config.js kalshiRelay remains empty and UI explicitly says activation pending; it does not solicit keys or claim working sync before relay setup. This is a deployment dependency, not an authenticated test success. No actual Kalshi account/key used. Six tests cover cryptographic signing for all key formats, permission denial, crypto vault/wrong password, dedupe/unknown metrics, pagination and worker write/origin/path rejection. Existing eight Polymarket tests pass. Actual account sync remains to verify after hosting activation with a consenting Kalshi user.

## 91. User-owned, browser-isolated Kalshi panels (Oct 21, ChatGPT)
Reed clarified this is for Brandon/Richie/other Kalshi users, and he must not access their keys or bets. Replaced main-site account reader with a URL-only launcher. It never signs/fetches account data or receives parent messages. It embeds a cross-origin personal Worker panel (or opens it directly when embedded storage is restricted). Native same-origin policy prevents parent-site code from reading its key fields, cache, position data or DOM. Worker serves its own self-contained assets with self-only script/connect CSP; the parent origin is explicitly denied API requests/CORS. No main-origin key entry or shared relay setting remains. Keys/cache are password-encrypted on the personal origin; only signed GET headers and responses pass through the ACCOUNT HOLDER’S Worker to Kalshi. Cloudflare still processes that user’s traffic; no claim of direct browser-only API transport. Read-only permission verification and all data handling tests preserved.

Added an isolated deployable kalshi-private-relay folder with Wrangler configuration, disabled observability, no storage/secrets bindings, static assets and strict read-only worker. Cloudflare’s official Deploy button copies that folder into the user's own GitHub account and deploys into their own Cloudflare account; no terminal required. Main setup has three steps: deploy personal panel, paste its HTTPS workers.dev address and affirm ownership, enter read-only keys inside that isolated panel. Reed’s Worker subdomain is rejected. No personal service/account was deployed or connected by the agent; actual account sync still requires a Kalshi user to complete those steps. Template copies do not auto-update from Reed’s repo.

## 92. Sandbox explicit-testing-only resource policy (Oct 21, Reed / ChatGPT)
At Reed’s request, published sandbox commit 874bc09b174eb6da5b337c718d742c64c3796c20 in reedrice/goggins-picks-sandbox: all seven copied routine gates disabled, owners off, schedules unset; AGENTS and sandbox README require a fresh explicit human test/work request, no background monitoring/polling/AI tasks, and cleanup of agent-started servers/watchers after testing. No sandbox automation definition found in Reed’s accessible local automations. GitHub sandbox only has on-push Pages deployment, no scheduled AI workflow. No preview server listening on checked port 8878. Production routines unchanged. Other people’s ChatGPT/Codex schedules cannot be controlled here: Brandon/Richie must pause any sandbox automations in their own accounts. No messages sent to collaborators.

Private-panel validation: isolated Wrangler dry-run passed with six static assets and only the ASSETS binding; no secrets/database resources. Five privacy boundary/encryption tests, six Kalshi reader tests, eight Polymarket regression tests and no-instructions checks passed. Main-origin Kalshi vault accessors removed; main site retains only a nonsecret panel URL. User-owned live deployment/authentication requires each Kalshi account holder’s own onboarding and was not fabricated.

## 93. Guided Kalshi onboarding (Oct 21, ChatGPT)
Reed reported clutter and missing Cloudflare signup/deployment guidance. Replaced the dense list with three numbered sections: create accounts, deploy panel, connect URL. Added direct Cloudflare/GitHub signup links and expandable browser-only instructions for email verification, GitHub authorization, deployment, finding workers.dev URL and entering keys only inside the personal panel. Clarifies no domain/DNS/PowerShell or Cloudflare key upload is needed. Fixed ownership checkbox sizing and responsive controls. Privacy boundary, URL validation, isolated iframe and account sync unchanged. Guidance follows official Cloudflare Deploy Buttons and Dashboard docs.

## 94. Desktop Kalshi extension exploration (Oct 21, ChatGPT)
Reed authorized exploring PC browser extensions without per-user Cloudflare/GitHub accounts. Added an uninstalled Manifest V3 prototype and dependency-free packaging script. Toolbar click opens an extension-owned tab; exact external-api.kalshi.com host permission only. Reuses private reader/encryption with direct Kalshi requests and an additional fixed-host/GET/path/query/redirect gate. No website permissions, content scripts, externally connectable messages, web-accessible pages, telemetry, startup work or alarms. Encrypted vault stays on extension origin; results deliberately do not enter main-site My Bets DOM. Existing production connection unchanged. Future browser side panel could display alongside My Bets while preserving isolation; mobile remains separate research. Three prototype security tests plus existing reader/encryption checks pass. Browser extension installation and actual authenticated Kalshi access remain UNVERIFIED: extension host permission removes the browser CORS requirement but does not guarantee Kalshi server acceptance. No browser installation, real key access, store submission or new automation was performed. Local ZIP prepared for account-holder testing. Installed extension code/updates must be trusted; no absolute protection from compromised devices or malicious updates is claimed.

## 95. Collapse private account sections (Oct 21, ChatGPT)
Reed requested independent expand/collapse for Polymarket and Kalshi. My Bets now wraps each in native keyboard-accessible details/summary and remembers each choice in local prefs.accountPanels. Initial default opens selected platform only. Closed sections are lazily mounted; closing Polymarket hides its body so existing sync visibility guard pauses subsequent polls, reopening restarts through mount. Closing Kalshi removes the iframe to stop its browsing context; reopening reconstructs the personal panel, whose own unlock applies. No private account data moves between origins. Existing preferences and connection vaults preserved.

## 96. Verified ESPN tennis scores and progress (Oct 21, ChatGPT)
Reed authorized connecting ESPN ATP/WTA live scores, confirmed with real Boulter–Golubic snapshots. Added shared pure tennis-scores adapter: flatten tournament groupings, match both participants in either order, require singles/doubles structure and bounded match dates, reject ambiguous/repeated fixtures. Accented names and doubles surnames match through explicit participant aliases; no fuzzy guesses. Actual Polymarket startDate avoids stale tournament/slug date assumptions. Browser caches one scoreboard per tour/date for 15 seconds, uses existing visible-card scan and no summary endpoint for tennis. Scores display games by set and ESPN set status; match-winner bars use completed sets / best-of target, spreads and totals use their actual games/sets contract units, set winners use only their requested set. Missing scores, suspended/retired status and doubles deciding match tie-break game conversions stay unavailable instead of inferred. Existing score-to-time pace rules are never used for tennis. Feed context now reads the same scoreboard adapter, uses verified set deficits/adjusted spreads for existing score explanations, and preserves opening baselines/history. No fair win-probability model or automatic settlement grading added. Existing private account connections untouched. ESPN public endpoints are undocumented and have no latency/availability guarantee; missing coverage remains unverified. Tests cover matching/date/draw ambiguity, games vs sets, selected-side normalization, segment progress, doubles and retirement boundaries plus existing progress/live regressions.
Tennis UI verification caught ESPN's generic ATP format.periods=5 on an ordinary Almaty match. Set targets now use tournament major/draw/qualifying context (standard tour matches need two sets; men's major main draw three), not that generic field; special Next Gen format stays unsupported. Added regression for misleading period count, qualifying and doubles surname-initial ordering. Current point score is not inferred from game counts. Verified progress is descriptive, not a live win probability.
Fresh browser-confirmed tennis context removes the older feed snapshot's unverified-context banner on that card, while retaining the original price-movement/record classification. A failed or unsupported score read still displays its explicit unavailable state.

## 97. GitHub Actions feed and grading migration (Oct 21, ChatGPT)
Hosted proof: https://github.com/reedrice/goggins-of-gambling/actions/runs/39569818895 passed refresh and deployment; generated commit cca83bc6389c12aaeab0dcc2525e1c534998af84. Public feed index and all four record/feedback JSON checks matched main. Pages publishing source is now workflow; normal-push deploy workflow also passed. Both Codex automations (keep-live-bets-feed-updating and update-fade-trent-from-new-posts) were paused via the app after verification. Fade Trent new-post ingestion is paused, not migrated; preserve its watermark and records until a separate source is authorized. No changes to the five Grok routines or sandbox. No private credentials committed. Schedule is best-effort every ten minutes, independent of ChatGPT and the local PC.
Reed requested recurring non-AI execution and disabling Codex automations after verification. Added scheduled and manually dispatched public-data maintenance, ownership handover only on successful fast-forward publication, due-game freshness gate, explicit output allowlist, bounded race regeneration and separate static Pages deployment. Uses built-in ephemeral GitHub token, no PAT secret, no model calls, no personal account data. Repository/main guards prevent copied sandbox workflows from running. First real hosted run and public JSON verification required before pausing the local feed monitor. Fade Trent browser-only X reading cannot run on this scheduler without a separate source; its saved data/grades remain preserved when paused. Prior production Pages legacy settings are the rollback option if hosted trial fails. Documented in routines/LIVE-FEED.md.

## 98. Five former Grok routines: rules-based Actions replacements (Oct 21)
Reed explicitly chose rules-based API replacements over pausing the three news/editorial jobs. Added scheduled-routines.mjs behind the production maintenance workflow. Chicago/DST slot gates; daily fresh market snapshots and existing history Analytics with bounded candidates and no inferred projections/combos; ESPN exact-name adverse injury notes with explicit missing starter/goalie coverage; existing leaderboard settlement scripts; measured weekly learning JSON. See routines/ACTIONS.md for coverage, conservative thresholds, no paid odds calls and schedules. Manual routines_takeover tests all five before atomically transferring owners; failures leave remote Grok owners intact. Hosted test/public verification required. Other account schedules cannot be disabled here; user must ask their Grok agents to remove duplicate jobs to avoid wakeup usage. No private messages or account data.

Hosted proof for §98: https://github.com/reedrice/goggins-of-gambling/actions/runs/39571179028 passed all five routines and Pages deployment. First test generated one qualifying NHL line and two model winner predictions; no prop bets met criteria. Injury checks explicitly reported unverified coverage rather than false confirmations. All five owners transferred atomically to github-actions. Codex automations remain paused. External Grok schedules cannot be disabled from this app; Reed/Brandon/Richie must tell their bots to remove duplicates.

## 99. ESPN status database and sports-scraping deprecation (Oct 21)
Reed confirmed duplicate external schedules disabled, requested full sports ESPN ingestion, and separately retained the two-hour Fade Trent Codex routine. Added lightweight Node.js JavaScript fetcher for 24 league/tour routes across all requested sports, today/tomorrow snapshots, source/error timestamps, bounded detail requests and explicit unknown coverage. Raw JSON only in ignored cache; normalized public data in data/espn. ESPN injury strings, explicit starter flags and probable/confirmed distinction preserved. Hockey line combinations unavailable; published book lines stored separately, never inferred goalie/lineups. Lineup/scratch jobs consume central fresh details. Removed old Underdog/X sports-scraping prompts from active runbook. Fade Trent re-enabled at user request as the only AI scheduling exception, not a hosted migration. Feed Codex automation stays paused. See routines/ESPN.md.

Hosted proof for §99: https://github.com/reedrice/goggins-of-gambling/actions/runs/39572753036 passed refresh and Pages deployment. ESPN 48/48 scoreboards and 31 detail summaries. Public manifest, representative NBA/NHL/tennis/golf snapshots and live index matched main after CDN delay. JavaScript ES modules on Node.js; flat versioned JSON, no ORM/SQL.

## 100. AI usage audit and future guardrails (Oct 21)
Reviewed tracked runtime code, Workers/extensions, hosted workflow entrypoints, repository webhook metadata and accessible local Codex automation statuses. No provider SDK/API or agent CLI in runtime; odds/Analytics math/record grading/feedback parsing/account polling are native scripts. Discord formatter exists but hosted maintenance does not invoke it. GitHub reports no repository webhooks. Local site automations: feed PAUSED, two-hour Fade Trent ACTIVE by explicit Reed exception. External Grok/other-user schedules are outside local visibility; Reed confirmed duplicates disabled. Added AGENTS.md section Token-Efficiency & GitOps Rules: deterministic structured-data/JSON generation, no new AI monitors without explicit scoped approval, production Actions ownership/concurrency, bounded API requests and honest unknowns, fast-forward publication/privacy, manual sandbox only. Added no-ai-runtime regression guard to maintenance; common model endpoints/SDK imports/agent CLI and AI workflow action checks pass. This is a backstop, not universal proxy detection. No AI schedules were silently re-enabled except Reed-requested Trent.

## 101. Mandatory sports snapshot architecture warning (Oct 21)
Reed explicitly required a bold top-of-file AGENTS.md warning: all sports availability data (lineups, injuries and goalies) has migrated to free, flat-file JSON snapshots under data/espn/, generated by GitHub Actions .github/workflows/live-maintenance.yml through scripts/fetch-espn-status.mjs. No agent may build external sports scraping loops, ORM/database structures or parallel sports-data stores. Agents and new features must consume local snapshots and consult data/espn/index.json for freshness/coverage. Improve the existing approved fetcher rather than introducing another ingestion architecture. Missing/probable status remains unverified; the migration is not a claim of universal ESPN lineup/goalie/hockey-line coverage. Added the same explicit architecture statement within Token-Efficiency & GitOps Rules. Documentation-only change; runtime and the retained two-hour Trent exception unchanged.

## 102. Global Apple-inspired theme tokens (Oct 21)
Reed explicitly requested implementation of the shared theme, including all six tabs and secondary screens. Added css/theme.css, loaded last, with slate canvas #0A0E17, exact panel/control radii 24/16px, shared rgba white 3% glass + 12px blur + 5% border, white/steel text hierarchy, system font stack and shared generous spacing/navigation. Removed duplicate legacy root tokens; compatibility aliases and targeted legacy adapters cover cards, nested panels, tables, filters, account launchers, sheets and chart chrome. Outcomes/team chart colors retain meaning. Documented exact tokens at the bottom of AGENTS.md and in DESIGN.md. No backend, data, account API or privacy changes; private cross-origin panel interiors are not accessed or restyled. UI rollback starting point: 8a70670c19250f11ea4d2b964fa1430653aa8d57 (revert only frontend feature files rather than later public data commits). Local browser loopback preview unavailable; verify the authorized Pages deployment and inspect computed styles before final signoff.

## 103. Built-in colorway experimentation (Oct 21)
Reed clarified that colors are not settled and rejected the old black/orange theme. Added Ocean blue (default), Soft violet, Deep teal and Custom canvas/accent controls in Settings. Native JavaScript applies validated CSS variables and restores per-device Store preferences, with light/dark text and action-label contrast choices; no network, timers, new store or account-data access. Master geometry/spacing/glass blur unchanged. Palette defaults/overrides are centralized in theme.css; collaborators must consume role tokens. Updated AGENTS.md and DESIGN.md to supersede fixed-palette constraints. Backend remains frozen.

Frontend collaboration note (§103): css/README.md maps role tokens, explains saved/custom colorways and adding presets, and links to shared AGENTS/DESIGN policy. This is repository documentation, not a new agent task or scheduler.

Theme browser verification (§102–103): published colorway controls render; Soft violet changed the canvas and persisted across reload. Desktop computed styles on all six tabs reported shared color and no page-width overflow; checked Record/settings panels 24px, control 16px and 12px backdrop blur with exact 3% glass. Local loopback/browser viewport resizing unavailable in this environment, so no claim of a real phone-width browser run. A browser check caught that re-rendering Settings on theme selection lost select focus; selection now toggles custom fields in place. Native theme tests cover per-device persistence, invalid color rejection, custom text/action contrast and clearing overrides. No profile/keys/bets were edited.

## 104. Clearer surfaces and mobile dock (Oct 21)
Reed requested stronger card contrast, restrained edge colors and a responsive sweep. Added separate panel elevation tokens, including custom light palettes, and restored existing big/slight/explained-move semantic accents without changing scoring. Below 768px panels/padding/module gaps scale to 16px; six tabs use a compact safe-area dock and the score ticker switches from marquee to manual horizontal scrolling. Theme/privacy/no-AI checks passed (7 tests). Hosted phone-width verification follows publication; do not infer mobile success from desktop checks. Rollback is the preceding main frontend version 20261021-0425; preserve concurrent public-data commits.

Hosted responsive verification (§104): Pages version 20261021-0435 checked using the supported browser viewport override at 320, 390, 767, 768 and 1280px across all six tabs, plus Today's Picks and Live Bets. No page-width overflow or clipped dock labels; mobile panel tokens 16px below 768, desktop 24px at/above. Visual screenshots inspected for all six screens. Found and fixed long Fade Trent source text overflow at 320px; exact width-range media query also covers fractional viewport widths below 768. Ticker horizontal scrolling moved scrollLeft independently without page overflow. Existing green big-edge cards showed correct tint/accent. This verifies browser rendering, not physical iOS/Android hardware. No private keys, positions, profiles or bets were changed.

## 105. Native site health and bounded recovery (Oct 21)
Added .github/workflows/site-health.yml and scripts/site-health.mjs: ten-minute offset checks, maintenance/Pages workflow completion checks, and manual dispatch. Production-main/owner gates, public feed/ESPN 30-minute freshness, due-game timestamps and readable public record JSON. Allows CDN propagation with three bounded checks; skips active maintenance; at most one workflow_dispatch recovery within an hour (manual dispatch also counts). Only dispatches the existing gated maintenance workflow; cannot write code, change grades, force-push, access private accounts or invoke AI. Persistent failures fail the health job with an Actions summary; repository watchers should enable GitHub Actions failure notifications. It checks pipeline/publication health, not statistical correctness or ESPN coverage completeness. Both schedules depend on GitHub and can be delayed during GitHub incidents; no external uptime guarantee. Separate health concurrency prevents deadlock with production-site. Regression tests cover stale/future stamps, final-game exemptions, active work and cooldown. No simulated production outage was created.

## 106. Unresolved recovery notifications (Oct 21)
Reed authorized proactive notification after failed recovery. site-health.yml now opens one GitHub incident assigned to and mentioning reedrice when the health step fails; authenticated bot marker/title deduplicate incidents without repeated comments/mentions. A later fully healthy check closes the incident; active-recovery checks do not close it. Existing owner/repository/main gates remain, with issues:write limited to the health workflow. No private data, AI calls or credentials in incident bodies. Email/mobile delivery requires Reed's GitHub notification preferences for mentions/assignments; these settings were not changed. Unit tests verify deduplication rejects other authors, PRs and unrelated issues. Healthy hosted verification does not prove delivery of an actual outage notification; no fake outage alert sent.

## 107. User-requested iPhone push test (Oct 21)
Added manual-only notification-test.yml so the GitHub Actions bot can create a clearly labeled TEST ONLY issue mentioning/assigning reedrice, matching the real incident delivery categories without simulating an outage or disturbing incident deduplication. Production main guard; no schedule, AI, private data or site changes. Reed explicitly requested this test after enabling iPhone notifications. Actual lock-screen delivery requires Reed's confirmation.

## 108. Open-chart live refresh resilience (Oct 21)
Reed reported charts seeming frozen until reopened. Price polling already existed, but event errors could skip BBO refresh and historical hover/tap selection pinned quote/readouts without showing Back to live. Event and per-market requests now run independently, bounded by abortable 8-second timeouts; failures in one market do not block others. Cadence subtracts request duration, retains 429 backoff and hidden-tab suspension, prevents overlap and aborts on close. Live status includes seconds and is marked successful only when a chart accepts the quote. Mouse pointerleave clears historical hover; any selected historical point exposes Back to live. No synthetic price movement: unchanged exchange quotes remain flat. Regression test verifies changed quotes reach the same open subscriber despite event failure and stop/abort on close. Existing chart history/window/curve tests pass. Browser verification follows publication.

## 109. Distinct paired-chart colors (Oct 21)
Reed observed both tennis lines blue. pairSides previously handled matching colors only for spreads, and even that fallback could remain blue on blue. Every paired market now replaces the second identical normalized color with green/blue chosen to differ from the first. Existing distinct team/provider colors remain intact. Shared side metadata drives paths, dots and quote legends consistently. Regression checks cover tennis moneyline, spreads, duplicate fallback blue/green and preserved distinct colors; live polling and existing chart tests pass. No price/data changes.
§109 follow-up: the real tennis provider payload used two slightly different blues (#2e5cff/#4c8dff). Guard now handles near-matching RGB colors as well as identical values and chooses the more contrasting green/blue fallback. Real-payload regression added.

## 110. Stable chart color and adaptive overview smoothing (Oct 21)
Reed showed choppy overview traces and color changes when zooming. Removed single-series visible-trend red/green switching in favor of the theme accent. Added viewport-scaled time-bucket averaging for dense display paths (32–100 buckets), followed by bounded cubic curves; sparse zoom restores original samples. First/latest endpoints remain actual quotes, raw source arrays unchanged, axes/readouts/quote cards remain raw, and a Smoothed overview label/tooltip discloses averaging. Distinct paired colors and open-chart polling unchanged. Tests verify bounded averages, no source mutation, preserved endpoints, raw readouts and zoom detail; existing chart/color/live/neutral-text checks passed.

## 111. Early stale detection and successful-run cooldown correction (Oct 21)
Reed saw the 20-minute UI warning without notification: health threshold was 30 minutes, so successful checks correctly missed that earlier warning window. Changed watchdog threshold to 15 minutes for maintenance stamp, due games and ESPN index. Recovery cooldown now applies to failed completed dispatches only; a successful manual refresh no longer suppresses another needed refresh for an hour. Existing active-run duplicate guard remains. Failure incident still follows failed health/recovery, not every transient stale warning. GitHub scheduling remains best-effort; UI deployments serialize production work and cannot guarantee timely cron starts. Regression covers 16-minute detection and success-versus-failure cooldown behavior.

## 112. Five-minute native freshness and schedules (Oct 21)
Reed requested five-minute maximum detection or one-minute checks if no AI usage. GitHub native cron supports a minimum five-minute interval and best-effort delivery, so no strict detection maximum is promised and no one-minute workaround loop/external scheduler was added. Both maintenance (1-56/5) and health (3-58/5) now use five-minute offset schedules; watchdog stale threshold is five minutes. owners.json feed schedule updated. Native JavaScript/standard public-repository runners only; no model calls. Schedule delays and deployment lag may exceed the threshold; existing active-run guard, failed-recovery cooldown and push incident notification remain. Six-minute/four-minute threshold regression added. Supersedes earlier ten-minute/15-minute documentation.

## 113. Automatic browser feed refresh and public game checks (Oct 21)
Reed requested updates without manual refresh and alerts for persistently stale public data. Live Bets now checks every 30 seconds while visible, immediately resumes on visibility/focus/online, skips overlapping loads, and removes timers/listeners after unmount or rerender. Existing filters/expanded state retained; successful automatic loads clear old failure messages and expose automatic refresh status. No background AI and no browser notification permission required. Server watchdog additionally checks up to five oldest due/started public game files for correct slug and five-minute freshness; this is a bounded sample, not every game. Public index/ESPN checks and unresolved GitHub incident push path remain. Tests cover timers/resume/overlap/unmount and existing freshness/recovery guards. GitHub/CDN delays still prevent a hard real-time guarantee.
§113 follow-up: a successful recovery whose start is newer than the still-stale public watermark gets a two-minute CDN grace, then an unresolved incident rather than endless successful redispatches. A later genuinely fresh publication resets this condition. Regression covers this public/repository mismatch.

## 114. Shared Daily Slate Overview (Oct 21)
Reed requested daily active-event counters below the header ticker across all six screens. Added js/daily-slate.js consuming only existing data/espn/index.json and allowlisted snapshot paths, refreshed in-browser every five minutes/on return. Shared header now holds the existing score ticker once plus a swipeable row of 16px glass pills; Picks no longer remounts its own duplicate ticker. Counts use America/Chicago dates, unique league/competition ids and scheduled/live statuses; finals/cancellations/postponements/suspensions excluded. Tennis counts matches, not tournaments; golf includes currently ongoing multi-day events. Soccer/golf aggregate configured snapshot leagues. Missing/delayed coverage shows partial + or dash with a note, never a false zero. ESPN event counts do not imply tradable exchange markets. Native pure-parser tests cover UTC midnight, deduplication, exclusions, tennis and golf; ticker/theme/neutral-text/no-AI guards passed. No backend/odds/account changes. Browser verification follows publication.

## 115. Daily slate counters as Picks filters (Oct 21)
Reed requested All sports and tappable daily counters matching the existing sport-filter row. Slate pills are native 44px-minimum buttons with aria-pressed, focus styling and a shared selected state. Click dispatches an allowlisted sport to the existing Picks router, selects today and opens Today's Picks from any tab; existing filter row updates the header selection. ATP/WTA map to the existing combined Tennis category, not an invented per-tour picks classifier. Counts remain ESPN events, including clickable zero-count filters that can show an honest no-picks state. Removed the legacy router's PicksScores.stop() because the ticker is now global; it must survive screen changes. Unit coverage includes category aliases; UI verification follows publication. No backend/account/odds changes.

## 116. Compact active-only slate pills (Oct 21)
Reed refined the interactive slate: keep All sports, hide categories with no verified active events, combine ATP/WTA into Tennis, and replace the racket emoji with a ball-only CSS mark. Partial source counts still carry + and the coverage note; unknown/zero categories are omitted rather than represented as confirmed empty. Combined Tennis uses the same existing Picks Tennis category. Keyboard/native button behavior and two-way filter synchronization unchanged. Ball uses semantic sport color and aria-hidden because the button already says Tennis. Group/parser tests pass. Supersedes the prior separate ATP/WTA and visible zero counters.

## 117. Remove duplicate Picks sport filter row after verification (Oct 21)
Per Reed's explicit follow-up, removed the old pick-sports button row and its obsolete click binding after hosted verification: NHL pill from Settings opened Today's Picks with NHL selected; combined Tennis selected the existing Tennis category and displayed its honest empty state; All sports restored all picks. Header slate is now the only sport-filter control on Today's Picks. Existing day controls, calculations, builder controls and six tabs remain. No active-event sports appear as Pills only when verified counts are positive; All sports always remains reachable. Shared ticker survives navigation. Final hosted regression follows deployment.

## 118. View-aware daily slate filters (Oct 21)
Reed requested the same slate pills act on the current Today/Live toggle. In #live, pill selection now calls the live view's sport setter without routing to Picks or remounting the live view. All sports resets live sport only; game/prop expanded state, edge filter and time selector remain. Native live sport dropdown synchronizes the shared header. Separate in-memory Today and Live sport selections restore when toggling; other screens keep the existing jump-to-Today behavior. Shared allowlisted category names map to existing lowercase LiveBets sport keys. Today filtering and pill styling unchanged. Existing live, slate and auto-refresh regressions pass; hosted interaction checks follow deployment.

## 119. Remove Live Bets dropdowns after view-aware pill verification (Oct 21)
Reed explicitly requested removing Sport, When and Team/game dropdowns once tested. Hosted checks passed: NBA pill retained #live with NBA data; Today NHL selection stayed #picks; returning Live restored NBA. Removed only dropdown render/change handlers. Live defaults remain Now & today / All games within the selected sport; edge filters, Game lines, Prop bets, expanded group state, chart actions and automatic refresh remain. This intentionally removes on-screen time/team selection per Reed's request; legacy parser helpers remain for compatibility/tests. Header All sports resets the current Live selection. Existing live/helper and auto-refresh/slate tests pass; final hosted validation follows release.

## 120. Ticker startup, rescheduled-event freshness and Pages collision fixes (Oct 21)
Reed reported Checking ESPN and linked failed health run 39585599366 / older Pages run 39582044423. Browser confirmed scores eventually loaded: global ticker had mounted before #app was revealed, delaying initial refresh 60 seconds. Mount now occurs in startApp immediately after revealing #app; shared routing never stops it. Refresh try/catch/finally guarantees terminal error state and another attempt, and focus/online resume joins visibility handling. No new source/scheduler/AI.
Maintenance failure 39585570729 was real: atpdb-doumbisteven-grieksvanzan discovery moved start Oct22→Oct23 while published start stayed Oct22; todo skipped new date but checkFresh still required old date. needsTick now reconciles when either discovery or published schedule is due; strict freshness remains. Exact reschedule regression added.
Older Pages failure was HTTP400 due to an already-running Pages deployment. Both deploy jobs now share production-pages-deploy concurrency plus one 30-second retry after a failed deployment request. No force-push, grading guesses or swallowed final failure. Existing production-site gates remain. Ticker/parser, reschedule, Actions ownership/freshness and no-AI checks pass. Hosted maintenance and ticker/route verification follow release; unresolved incident stays open until a healthy watchdog closes it.

## 121. Confirm recovery and reconcile rescheduled start times (Oct 21)
Hosted release 20261021-0539 and maintenance run 39586166699 passed; public index advanced to 10:40:16Z. Health run 39586343693 passed and automatically closed incident #4. Browser ticker advanced from 5:40 to 5:43 AM CT without reload; soccer clocks advanced and 26 score items persisted across Today/Live toggles.
Follow-up: buildLive now publishes the current exchange event startTime/startDate (validated, with original start fallback) instead of retaining the opening snapshot's schedule. Opening prices and capture timestamps remain untouched. This completes reschedule reconciliation and avoids repeatedly treating the old date as due. Regression covers schedule, pregame state, invalid-date fallback and preserved baseline; all 30 live-watch/buyable/reschedule tests pass.

## 122. Sourced nationality flags in Live Bets matchups (Oct 21)
Reed requested tennis/golf country flags beside player names on the secondary matchup row, not beside the bet title. The existing ESPN snapshot normalizer now retains athlete display/short/full names and ESPN country flag metadata, including individual doubles roster athletes. No new polling service, scraping, database or AI loop. Browser AthleteFlags reads only published local ESPN snapshots, matches normalized names within sport/tour, omits missing/conflicting identities, allowlists ESPN country images and hides broken images. Team-sport rows remain unchanged. Flags have country alt/title text and compact 20x14 geometry; doubles partners retain individual nationalities. Existing feed refresh remains independent of optional flag loading. Golf support uses the same fields when ESPN publishes entrants. Eight identity/snapshot tests and existing Live Bets helper regressions pass; hosted snapshot/UI verification follows deployment.
Country coverage follow-up: the screenshot's Zhizhen Zhang and Yi Zhou are absent from current ESPN snapshots. Added a small sourced flat-file identity supplement under data/espn/athlete-nationalities.json, verified against ITF/ATP profiles, so both show China flags even without score context. This is display metadata only and creates no scraper or scheduled task. Other missing identities remain blank.
Hosted flags loaded successfully beside both screenshot players. Matchup separator normalization also handles exchange titles with no spaces around vs. while preserving readable spacing; unknown abbreviated names remain undecorated rather than guessing a nationality.

## 123. ESPN-only flag coverage and cache correction (Oct 21)
Reed reported only the manual China flags appeared and explicitly requested ESPN flags. Removed the manual nationality supplement and fallback loader entirely. ESPN snapshot requests now bypass old browser caches and include each snapshot's fetched_at watermark; previously a cached pre-flag snapshot could populate the page-lifetime index without countries. Name aliases now support sourced surname, compound surname and surname/initial formats used by doubles market titles; conflicting country aliases are omitted. No country is inferred from a name. Missing ESPN athletes/flag metadata remain undecorated. Four flag regressions include a mocked snapshot load verifying no-store/timestamp and non-China lookup, plus abbreviated doubles and ambiguity coverage. This supersedes §122's manual supplement.
Hosted verification exposed a second cause: BetProgress replaced verified matchup rows with its team-name markup, erasing country images. It now preserves participant rows marked lb-athlete while retaining existing team-sport logo enrichment and all score/progress updates.

## 124. Persistent ESPN athlete flag history (Oct 21)
Reed reported remaining flags missing, especially Zhang/Zhou. ESPN current scoreboards omit those matches but the free scoreboard date-range history publishes both athletes' country flags as Zhang Zhizhen and Zhou Yi. Added fetch-espn-flags.mjs to existing Actions maintenance after status fetching: merge current snapshots into a persistent ESPN-only country catalog; at most five historical scoreboard requests weekly covering 90 days for ATP/WTA/PGA/LPGA/DPWT, 15-second timeouts, preserve prior profiles on source failures. No per-player crawler, AI, new schedule or database. Initial catalog contains 2,834 sourced tour/name profiles, with source URLs; country images are copied from ESPN metadata, never derived from birthplace. Browser consumes local catalog alongside current snapshots and recognizes reversed two-word full names, with conflicting country aliases omitted. This supplies Zhizhen Zhang and Yi Zhou flags independent of verified live score context. Challenger players absent from ESPN history still remain blank. Parser, name order, cache and Actions/no-AI regressions pass.

## 125. Independent non-AI feed watchdog (Oct 21)
Reed reported stale data despite GitHub health checks, then explicitly requested an independent non-AI watchdog. Confirmed no scheduled updater/watchdog starts for over an hour after 15:13 UTC; manually dispatched maintenance 39633805503 and health 39633812888, verified all 189 due games fresh at 16:20 UTC and subsequent health passed. Earlier six links: one Pages deployment collision and five stale-data health failures; incidents #4/#5 closed after verified recovery. GitHub's schedule is best effort and cannot be its own independent liveness monitor.
Prepared watchdog/worker.mjs + wrangler.jsonc for a Cloudflare one-minute cron, persisted serialized operational state, five-minute public freshness checks, sampled served game files, owner gate, bounded single recovery/cooldown and GitHub assigned incident on unresolved recovery. No AI calls or new sports ingestion/database; existing Actions remains the updater. Four native tests cover due windows, deadlines/active run/cooldown, one dispatch/one issue and automatic closure, and read-only public endpoint. Cloudflare login confirmed; deployment and least-privilege private GitHub secret are pending. README documents no guarantee during a GitHub API/mobile outage and no invented independent email channel. Do not mark active until configured and verified.
Deployment update: Cloudflare Worker mib-feed-watchdog.reedrice9.workers.dev deployed with * * * * * cron and SQLite Durable Object binding; Wrangler OAuth uses only user/account read and Worker write scopes, encrypted through Windows credential manager. No AI permissions. GitHub fine-grained token form prepared for production repository only, Actions/Issues read-write; user must generate and paste directly into Cloudflare Secret, never exposed through tools. Recovery remains pending private credential and live cron verification.

## 126. Today’s Picks refresh cadence (Oct 21)
Reed reported the 7:54 AM slate still showing at noon. The digest was intentionally once daily at 7 AM; changed its existing native Actions slot to hourly 7 AM–11 PM Chicago, without another workflow or AI. Existing model/qualification rules, source evidence and human-authored entries remain intact. The visible Today’s Picks screen checks published JSON every minute and on focus/online, rendering only a new snapshot while preserving sport/day selection. Live Bets retains its separate 30-second published-feed checks. GitHub starts and publication can still delay these cadences.

Cadence follow-up: Reed requested the fastest existing native cadence. Daily slate regeneration now participates once per five-minute maintenance slot around the clock, rather than hourly; visible Picks polls published JSON every 30 seconds. No new scheduler, AI or paid data source. Source calculations still require evidence and each run publishes only after validation. GitHub scheduling, processing and Pages latency remain real limits.

Watchdog live verification: user privately saved GITHUB_TOKEN in Cloudflare. The one-minute cron detected a real stale feed and dispatched maintenance 39639780024 at 16:59:51 UTC; that run passed and public checks returned healthy at 17:03:48 UTC, with recovery_configured true and no problems. This verifies real recovery dispatch and public freshness, without deliberately breaking production. Incident creation/closure passed native mocks; prior GitHub Mobile delivery was separately tested, but no new live failure incident was fabricated. Fine-grained token expires November 20 and must be renewed privately.

## 127. Independent five-minute dispatch cadence (Oct 21)
Reed again saw a 14-minute gap. GitHub scheduled starts were absent; the independent watchdog raised incident #6 but its one-hour cross-outage cooldown prevented prompt repeat recovery after a prior healthy result. Cloudflare now supplies five-minute dispatch pacing for the existing production workflow even while public health is good, skipping recent/active runs and respecting ownership. A verified healthy result clears recovery cooldown; failed outages still get one bounded recovery and notification. No duplicate sports ingestion architecture, AI or public mutation endpoint. Publication still includes source processing and Pages delay.

## 128. Monitor both Picks and Live Bets (Oct 21)
Reed requested stale Today’s Picks coverage in the independent watchdog. Added a no-store public data/picks.json check for sections shape, five-minute updated_at freshness and current Chicago slate date. Empty sections remain valid. Either Picks or Live Bets failure drives the existing recovery/incident path, and incidents close only when all sources pass. No AI or separate schedule. Regression covers Picks-only failure while Live Bets and ESPN remain healthy.

## 129. Private open-position investment and payout (Oct 21)
Reed requested amount invested and winning payout on each Polymarket account open-position card. Added shared-theme KPI cells using reported remaining-position USD cost for longs and absolute decimal contract quantity for gross winning return at the documented one-dollar contract payout. Missing cost and short-side cost/margin remain unavailable rather than inferred from turnover. Corrected cashValue label to Unrealized P/L per official portfolio schema. This is not lifetime spending, profit or an executable cash-out quote. Account reads, encryption and private-only storage unchanged; no account data inspected or published. Synthetic regressions cover partial quantities, missing fields, shorts and currencies. Sources: docs.polymarket.us/api-reference/portfolio/get-user-positions.md and market-structure/collateral-and-margin.md.

## 130. Private Polymarket cents precision (Oct 21)
Reed requested exact cents rather than rounded whole dollars. Private account currency formatter now uses exactly two decimals for all position and settlement totals. Documented the explicit scoped override in AGENTS.md; no source values, calculations or privacy behavior changed.

## 131. Private open-position totals (Oct 21)
Added top account KPIs for total remaining investment and summed gross payout if all open positions win, with cents. Closed/expired positions excluded; any missing or ambiguous cost suppresses the investment total instead of presenting a partial sum. Missing quantities suppress payout. Totals do not depend on complete settlement history. Copy distinguishes gross payout from profit/cash-out and notes opposing outcomes may prevent every position winning. Synthetic tests only; no private account values published.

## 132. Persistent cadence and bot-authored alert correction (Oct 21)
Successful jobs that never briefly cleared CDN freshness left recovery state blocking later pacing. Independent pacing now continues after successful completed jobs regardless of health, skipping active/recent jobs. Issue #7 was authored by Reed’s PAT and did not reproduce the bot mobile test. Unresolved alerts now dispatch watchdog-alert.yml using the Actions bot token and existing deduplicated incident logic. No new credentials or AI.

## 133. Broader deterministic daily slate (Oct 21)
Expanded market discovery to every tracked sport including college football/basketball, WNBA, tennis singles/doubles and golf. Daily generator evaluates three lines per game-market type and up to eighteen player markets, publishing up to three qualifying game lines plus six player prop bets per game. Keeps buyability, full-game filtering, historical Analytics requirement, edge thresholds, NHL evidence restrictions, manual-game reservations and no auto-combo rule. At most one side per market; display uses shared sport groups. Missing historical support stays unqualified, reported per game in routine coverage rather than using another sport’s model. No model API or new scheduler.

## 134. Source-backed historical support (Oct 21)
Added scripts/espn-history.mjs within existing ESPN status ingestion, producing data/espn/history.json daily with at most 96 bounded requests, four workers and 15-second request deadlines. Team schedules for active college/soccer fixtures and prior season when sparse; tennis/golf date-range scoreboards. Current and prior records retained at most 365 days; completed finals only, sources preserved. Historical estimates require unique identities and eight matches per side; college empirical score/margin frequencies, soccer three-outcome/draw frequencies, tennis singles completed-match evidence. Tennis retirements/walkovers, doubles, match-tiebreak scoring, ambiguous identities and unsupported player stats abstain. Golf outright/first-round leader support needs at least six completed tournament fields, unique leaders and complete first rounds; later-round leaders and tied-result samples abstain. Uses existing Analytics blend with sample shrinkage and existing edges; empirical estimates are not newly calibrated or guaranteed. Qualifying picks carry history model/sample/source. No AI, ORM or parallel polling service.

## 135. Compact private open positions (Oct 21)
Reduced card padding, replaced oversized nested investment/payout tiles with a compact inline row, and moved repeated explanation/cost/P&L into expandable Position details. Matchup, every combo leg, warnings and live progress remain visible. Shared tokens and cents precision preserved. No private account data inspected or published.

Compact-card follow-up: open positions now render in a responsive grid: one column below 640px, two at 640–1099px, three from 1100px. Reduced internal padding and monetary-row gaps, retained every BetProgress host and combo leg, with wrapping and min-width guards.

## 136. Selected-sport Live Bets scoreboard (Reed, Oct 21)
Live Bets now places a compact ESPN snapshot scoreboard beside its sport/game-count/freshness heading. Hidden for All sports and absent from Today’s Picks. Uses the existing ESPN snapshot source, current Chicago day, live-first ordering, actual reported clocks/scores, explicit checked/delayed/error labels and no fabricated ticking clock. Refreshes with the existing Live Bets 30-second refresh (no added timer, AI, ingestion or backend). Horizontal constrained rail supports arrows, keyboard and thumb scrolling, remembers per-sport offset, and stacks below the heading on phones. Tennis supports competitors; golf shows tournament status rather than inventing head-to-head scores. Scoped master-token CSS; safe textContent/HTTPS logos.

## 137. Scoreboard game filtering (Reed, Oct 21)
Scoreboard games are accessible toggle buttons. Selecting a game filters both Live Bets groups using verified ESPN event_id plus sport/league matching; selecting it again or Show all games restores the selected sport. Unmatched games show zero qualifying bets rather than another matchup. Selection persists through feed refreshes, resets on sport changes, and does not affect Today’s Picks. Active border/aria-pressed and keyboard focus restoration preserve discoverability. No new fetch loop, AI, or backend changes.

## 138. Compact uniform Live Bets cards (Reed, Oct 21)
Both main Game lines and Prop bets lists use identical 360px card rows, 12px inset/gaps and smaller typography/progress tracks. Desktop >=1100px has two adjacent cards per group (four total columns). Medium screens use two total columns; phones stack one readable column. Expanded details/long content scroll inside the uniform card instead of clipping information or changing row heights. Market/Chart/Analytics/Details remain 44px actions, all progress values/bars and sport/game filtering are preserved. Master-token radii, semantic edge tints and private-account styling unchanged. No runtime/AI/backend changes.
Compact-card visual QA: Analytics is retained inside Details alongside the full original title; visible title/matchup use two-line previews. This keeps collapsed cards free of internal overflow while preserving progress and 44px Market/Chart actions. Opening Details scrolls within the same uniform card height.

## 139. Clearer compact card wording (Reed, Oct 21)
Long explicit Yes/No soccer winner questions now display a concise team + to win/not to win title; the No outcome still includes draws and is never relabeled as the other team winning. Full original wording remains in Details. Affirmative player titles omit the redundant Yes prefix; three-point field goals made becomes threes. Other markets retain exact line/period wording. Removed the repeated main-face game-context warning; unavailable progress uses one Live score unverified message, with the detailed warning in Details. Slightly larger 14px titles and restrained matchup weight improve scanning within the uniform four-column grid. No price, outcome, edge or source changes.

## 140. Bold semantic odds colors (Reed, Oct 21)
Every Live Bets card renders odds in 800 weight with sign-based color. Default close-to-even band is absolute American odds 100–120 inclusive: both -120 and +120 yellow; +121 and above red; -121 and below green. Change CLOSE_EVEN_ODDS in js/live-bets.js to adjust the band. Master css/theme.css tokens --odds-even/plus/minus reuse warning/red/green semantic colors. Invalid/missing prices remain neutral. Odds numbers, signs, math, thresholds and edge classifications unchanged; color is a price-category cue, not a claim of safety or quality. Applies to both game lines and prop bets, including expanded past cards.
Reed tightened the yellow band to -100/+100 only in a follow-up. CLOSE_EVEN_ODDS is now 100; +101 and above are red and -101 and below green. EVEN/EVS labels are also yellow. The earlier 120 default is superseded.
Reed revised the even-ish range to -110 through +110 inclusive. CLOSE_EVEN_ODDS is 110, superseding the prior 100 limit; valid +/-100 through +/-110 are yellow, +111 upward red, -111 downward green.
Reed immediately revised the final even-ish yellow range to -115 through +115 inclusive (CLOSE_EVEN_ODDS=115). +116 and above red; -116 and below green. This supersedes the 110 adjustment.

## 141. Square-like collapsed cards and expanding Details (Reed, Oct 21)
The active Live Bets main canvas uses up to1280px to give four desktop columns a square-like footprint. All collapsed cards share312px height and equal grid widths. Details and Market/Chart sit immediately together at the foot of each card, eliminating the former flexible spacer between them. Opening native Details lets only that card grow naturally with its full content; collapsing restores312px. Grid rows are automatic with start alignment so neighboring cards retain their own collapsed height. This supersedes the prior360px fixed/scrolling Details behavior. Other screens keep the normal content-width token; mobile still stacks. Existing Details state persistence and live refresh remain intact.

## 142. Never expand sparse Live Bets groups (Reed, Oct 21)
Removed the legacy lb-single-group mode that made a sole market group span the full page and double card widths. Game and prop groups now retain their reserved left/right grid lanes, even if the other group is absent. The existing two-card grid within each desktop lane, collapsed312px height, and expanding Details behavior are preserved. Sparse results leave empty slots instead of stretching cards. Responsive breakpoint changes remain viewport-based only, never based on bet count.

## 143. Live basketball prop participation gate (Reed, Oct 22)
Live price movement was being labeled big/slight without checking player minutes. Existing ESPN status summaries now retain sourced player minutes, DNP and ejection flags under data/espn; no new requests, pollers or AI services. The existing Actions job fetches those snapshots before live-tick. NBA/WNBA and college basketball prop candidates require a unique full-name match on one of the verified event teams, a snapshot no older than10minutes, an in-regulation game with at least8minutes elapsed, at least3actual player minutes, and an observed minutes share equivalent to18 of48 NBA minutes or15 of40 for other basketball. These are conservative operational thresholds, not learned probabilities or predictions of future minutes. Pregame, early-game, overtime, stale/missing/ambiguous evidence, DNP, ejection and low usage are withheld (class participation), excluded from cards/counts/new-edge alerts. Evidence/reason remains in public feed JSON for audit. Both sides use the same participation requirement; absence does not establish an Under opportunity or settlement rule. Existing openings, quoted odds, edge differences, previous alerts and settlement history survive. Other sports retain their existing checks; this is not a calibrated hit-probability or target-reachability model. Regression tests cover source parsing, bench/DNP/ejected players, identity/freshness failures, league clocks, output suppression and unchanged prices. No private positions read.

## 144. Optional interface motion (Reed, Oct 22)
Added js/motion.js presentation helper for changed scores (ticker, selected-sport scoreboard and card scores), changed odds, progress width updates across rebuilt hosts, newly published cards once per session, and reversible native Details expansion/collapse. Uses bounded in-memory identity/value caches only; no network, timers, storage or feed/model changes. Pill and Today/Live selection transitions use existing role tokens; existing scoreboard smooth lateral navigation is retained. First observations and unchanged updates never flash; old cards revealed by filters do not replay entrance effects. Reduced-motion and hidden-page updates skip Web Animations; preference changes finish active effects immediately. Native Details semantics, focus, 312px collapsed sizing and all betting calculations remain intact. Tests cover changed vs unchanged values, width baselines, reduced motion, hidden pages and once-only entrance, alongside existing progress/scoreboard/theme regressions.

## 145. Per-sport game-line and prop-bet records (Reed, Oct 22)
Live Bets record retains each overall sport total and now shows separate Game lines and Prop bets rows with unchanged W-L-P, hit rate, expected market-implied rate, flat1u profit, ROI and graded count math. Existing summarize() computes by_market within every by_sport entry, including zero-sample categories. Exact Player prop labels identify prop bets; supported spread/total/winner labels identify game lines, including tennis game/set markets. Unknown labels remain Other markets rather than being guessed. Historical entries, odds, timestamps and grades are untouched. Native Actions regenerates these partitions during its existing closeout; no additional requests, AI or schedules.

## 146. Collapsible sport record breakdowns (Reed, Oct 22)
Sport totals now act as disclosure rows. Initially only the main sport totals show; clicking anywhere on a total row or activating its native button with Enter/Space reveals that sport's Game lines/Prop bets (and Other markets when present). Sports expand independently and preserve their open state through redraws within the page session. Buttons expose aria-expanded/aria-controls, show a rotating disclosure arrow and retain44px targets; hidden detail rows are removed from display/accessibility. Shared table columns, horizontal mobile scrolling, numbers, source data, grades and native refresh jobs are unchanged.

## 147. Standing authorization for Brandon (Reed, Oct 22)
Reed grants Brandon (apexlegend883-pixel) and Brandon's bot standing permission, effective Oct 22, 2026, to make, merge and publish site changes in reedrice/goggins-of-gambling and reedrice/goggins-picks-sandbox without asking Reed or Reed's Codex agent for per-change approval. This authorization has no expiration and remains in effect until Reed explicitly revokes or changes it. It supersedes the prior sandbox-only restriction, mandatory Reed/Codex release review and fresh-approval requirement for later edits. Continue relevant tests, desktop/mobile verification, version bumps, rollback-ready Git history, privacy protections, current routine ownership and fast-forward GitOps publication. Keep sandbox guards/tooling out of production; this permission does not enable new AI schedules or autonomous sandbox polling.
Updated production and sandbox maintainer instructions so Brandon's bot can discover this standing authorization without another approval request. No collaborator permissions, credentials, branch protection or recurring automation settings were changed.

## 148. Brandon: Aurora main-site appearance (Oct 22)
Under the Oct 22 standing authorization, Brandon requested a futuristic, clean, comfortable background with more depth. Shared css/theme.css now adds restrained static teal/violet atmospheric gradients through --canvas-atmosphere, with Aurora as the default for unset appearance preferences. Existing explicit Ocean/violet/teal/custom choices remain selected; named presets receive complementary subtle depth and Custom stays flat, including custom light mode. Existing glass surfaces, typography, 24px desktop/16px mobile panels, controls, semantic odds/result colors, charts and all six tabs retain their behavior. Settings offers Aurora via STR.theme.schemes. This request supersedes the old flat-canvas-only design restriction for shared ambient backgrounds; docs updated.

Validation: full root unit-test suite passed; theme tests cover new default, explicit saved Ocean preservation, switching away from custom, color validation and custom atmosphere opt-out. Browser checked desktop and390px mobile, Appearance switching, custom light background/black text, Aurora restoration, nav and no page overflow. Only a sample local profile used. Version bumped. No sandbox files/guards, data snapshots, live scripts, calculations, private connections, routines, owners or schedules changed. Pure CSS background, no additional requests, animations or polling. Temporary local preview is stopped after verification. Rollback: revert this appearance commit, preserving subsequent production data commits.


## 149. Brandon: more visible atmosphere and typography (Oct 22)
Brandon found the initial Aurora release too subtle and requested a visible main-page refinement. Named colorways now have persistent viewport-based teal/accent and violet lighting with a third blue tonal layer. Page headings and brand use stronger system-sans weight, tighter tracking and restrained white-to-accent text; body text remains solid and readable. Glass cards receive soft elevation and an inset light edge, selected navigation has a restrained highlight. Custom canvas/accent schemes retain flat backgrounds and solid text. Forced-color users receive system text rather than clipped gradient lettering. CSS only: no animation, scripts, timers, network, data, classification or account changes. Existing panel/control geometry, six tabs, odds semantics and responsive layout remain. Bounded local preview is stopped after testing; version bumped before publication.


## 150. Brandon: continuous score ticker on desktop and mobile (Oct 22)
Removed the mobile theme override that disabled marquee motion and hid its duplicate lane. The existing seamless CSS animation now runs at all widths and stays moving on hover/focus. Corrected the Pause selector to match its existing root class so explicit Pause/Resume actually controls animation. Reduced-motion remains static with manual scrolling and only one accessible lane. Existing score snapshots, refresh intervals, grouping, logos and upcoming fallback unchanged. No new fetches, loops or schedules. Theme/ticker/version checks and bounded desktop/mobile visual motion checks completed; local preview stopped afterward.

## 148. Prospective NBA player-ability/position/role testing (Reed, Oct 22)
Implemented deterministic testing-only stat-specific count models, with explicit position/starter identity, same-team comparable-role production history, observational opportunity shares and conservative abstentions. Expanded only the existing ESPN collector with bounded NBA schedule/completed-boxscore history and current player fields. Native live publisher captures executable, explicitly tradable quotes for supported NBA stat contracts; a separate date-sharded ledger records first eligible forecasts before outcomes, independently of opening-price movement. Existing settlement requests/cache grade binary closed outcomes; uncertain refunds remain pending. The existing production Actions run collects forecasts and refreshes status. Frozen protocol/source hashes prevent silent mixing of changed rules; mismatches pause the experiment without blocking ordinary feed publication. No new AI schedules/providers, data stores, paid feeds or account access. No existing recommendation/edge/profit record was reclassified. Live Bets records now include a collapsed Testing panel with real history/forecast/settlement counts and explicit limitations. The56-day window starts only with the first eligible future forecast, not installation. Minimum coverage300 settled qualifying forecasts/100 games/30 Chicago dates per stat is not power assurance. Power and actual cost/fill verification remain unresolved, promotion disabled. Full protocol: routines/NBA-PROP-TESTING.md.


## 149. Recover Live Bets from false final status (Oct 22)
Reed reported the site appeared down. HTTP, assets and Today’s Picks were healthy, but Live Bets showed zero games: future NBA games had saved final status despite ESPN pregame and currently open exchange markets. gameOver previously treated empty arrays and inactive markets as completion, while tick permanently skipped final rows. It now requires explicit event closure/end or a nonempty set of explicitly closed markets. Discovery can recheck a saved final only when the exchange explicitly offers an open active market, within the normal refresh window; ESPN-confirmed finals stay final. Original price baselines, alerts and settled records are preserved. Regression tests cover empty/missing/inactive markets, future recovery, unknown/closed discovery and confirmed finals. No new scheduler or AI usage.

## 151. Exact private holdings badges on Live Bets (Reed, Oct 22)
Live cards show Already holding for a remaining synced Polymarket position in the exact contract and outcome. Numeric feed market IDs resolve to the canonical slug through BetProgress's existing public event cache; line and period remain part of contract identity. Signed decimal net position determines Yes/No, including equivalent displayed opponent spreads. No title/team fuzzy matching, combo-leg inference or unfilled-order assumption. Zero, expired, unknown and combo holdings are excluded. Header shows sync time or locked/stale/error state; lack of a badge never certifies no holding. Lock/disconnect clears badges; sync changes redraw them. The existing browser-only read-only account sync continues at its existing 30-second cadence while Live Bets is visible and unlocked, reusing its single timer. Keys, financial amounts and positions stay encrypted on-device or in unlocked memory; no new public snapshots, account telemetry, trading endpoints, AI routines or servers. Canonical identity lookup requests contain only public event slugs and omit credentials. Existing odds, classifications, records and filters are unchanged.

Validation: exact/opposite outcome, line/half/full-game distinctions, sold/expired/fractional/unknown positions, combo exclusion, locked state, invalid market keys, cached numeric-ID resolution and missing-ID abstention tests passed alongside account encryption/read-only API, live helpers/refresh, progress, theme and no-instructions checks. Synthetic browser preview verified a single matching badge, lock/unlock clearing/restoration and removal after closing the position. Real account credentials were not accessed for development. Public release requires unlocking the existing My Bets account on each browser after reload. Refresh/sync delay can leave cached ownership behind a newly placed or sold position.


## 152. Account progress uses published ESPN snapshots (Reed, Oct 22)
Fixed missing college league paths and verified college abbreviation differences for the current JMU/App State, East Carolina/Memphis and Liberty/Kennesaw fixtures. Progress-only slug adaptation preserves the exact frozen NBA experiment matcher hash. College football half scores use quarter splits; college basketball respects men’s halves and women’s quarters. Missing or ambiguous games still abstain. Replaced direct browser ESPN scoreboard/summary polling with existing data/espn snapshots, retaining the current visible-page refresh cadence and public market-identity cache. The existing bounded native collector preserves compact player boxscore fields from summaries it already requests, plus team/tennis metadata; no new requests, scheduler, AI, private data or database. Source timestamps replace browser-check timestamps. Pregame past its scheduled start now says waiting for ESPN confirmation; active snapshots older than ten minutes withhold bars and show an old-data message. Explicit finals may retain their sourced results; missing stats never become zero.

Validated58 tests covering private account read-only/encryption, holdings matching, college identity/half math, clock states, snapshots, summary normalization, tennis metadata, stale/overdue/source-time failures and no-instructions checks. Synthetic browser cards show the first-half spread bar, live hockey lead and honest delayed-start state. No account credentials accessed or stakes/settlements changed.

## 153. College contract periods and transparent account cost coverage (Reed, Oct 22)
Fixed missing progress for public college contracts using 1h/2h, 1q through 4q and tt1h/tt2h codes, alongside existing fh/sh/q1 formats. Resolved card labels retain their period; winner progress now uses period splits just as spreads do. Team totals use the selected canonical market-side team, while combined totals remain combined even when Polymarket uses the same football_team taxonomy prefix. Existing source freshness, missing-stat and future-period guards remain; the frozen NBA findEvent hash is unchanged. Regression checks cover real public contract shapes, opposite spread side, first-half winner math after halftime, future segments and team versus combined totals. A public-contract audit checked 386 supported sides per affected JMU/App State, Liberty/Kennesaw and ECU/Memphis event: all returned progress or an honest future-period state. Draw/unsupported contracts are excluded from that supported audit.

The open-position invested panel now shows a clearly labeled reported-cost partial subtotal when any costs are unavailable, with the excluded-position count; the complete total remains unknown internally. Trade spending/sales say Not provided instead of an unexplained dash when direction is absent. Official Polymarket US portfolio types expose nullable cost fields and activity trades without buy/sell intent; no absolute short cost, trading-volume proxy or invented fee/cost math was added. Full trade cash-flow totals remain unavailable without documented direction evidence. All account values stay private and cents are preserved. No new API endpoint, scheduler, AI calls or sports source was introduced. Synthetic browser preview verified the 1h spread bar; 59 focused tests passed.

## 154. College scoreboard selection retains matching Live Bets (Reed, Oct 22)
College feed documents may contain cards while their game_context lacks an ESPN event ID. The scoreboard filter previously required that ID and therefore hid the matching feed. The filter now bridges absent context only through a unique currently loaded ESPN snapshot with the exact league, away/home team codes and Chicago game date, including the verified JMU/App State, Liberty/Kennesaw and ECU/Memphis abbreviation differences. An explicit conflicting event ID, reversed teams, another date/league, unloaded snapshot or ambiguous doubleheader cannot fall back. Existing event-ID matches remain authoritative; display names are never fuzzy-matched. Reuses loaded snapshots and the existing click-to-toggle/Show all games flow, with no sports ingestion, edge calculation, holdings or scheduling changes. Ten relevant test cases/suites passed, including regression and no-AI/no-instructions guards. Local browser preview was blocked by the browser client; public deployment is verified separately.


## 155. Brandon: reveal five more items at a time (Oct 23)
Game lines and Prop bets retain their initial five cards. Each Show more click now reveals at most five additional cards, with the button labeling the actual next batch (including a smaller final batch). Each group tracks its own reveal count through redraw/refresh. Show less remains available after the final batch and resets the group to its initial five. Activity alert history also reveals five more per click and supports Show less after the final batch. Build a Bet leaf lists now start at five and reveal five per click rather than ten. These are all runtime Show more prompts found in the site. Filtering, source attribution, card interactions and all data/math remain unchanged. Existing shared controls and text templates are reused; no CSS or new requests/timers. Relevant Live Bets tests and browser batch-count checks performed; version bumped. Temporary preview is stopped after checks.


## 156. Brandon: sport-filtered score ticker (Oct 23)
Ticker follows the existing picks:sport-change selection used by Daily Slate and Live Bets. NFL and NCAA football are exact separate categories; tennis, golf and soccer retain their grouped league mappings, and All sports restores all groups. Live/upcoming fallback is evaluated within the selected sport, not globally; empty sports never display unrelated games. Uses the approved data/espn/index.json and validated published snapshot paths instead of direct ESPN scoreboard requests. Existing one-minute visible client refresh is retained, with source snapshot timestamp and stale warning; no ingestion job, schedule or new loop. Normalized tennis matches remain supported. Pause, continuous motion, logo safety and upcoming-date rules remain. Regression tests cover NFL/college isolation, all-sports restoration, per-sport upcoming fallback and normalized tennis. Bounded preview stopped after checks.


## 157. Brandon: college-football conferences and Top25 ranks in ticker (Oct 23)
When NCAA football is selected, the continuous ticker groups matchups by the sourced ESPN conference short name. Conference games require conferenceCompetition=true plus an explicit isConference group; non-conference games have their own group and absent evidence says Conference unavailable. Groups remain contiguous without changing game identity, score or selection. Each team receives a #1 through #25 label only for an integer ESPN curatedRank.current in that range; no badge for missing/unranked/99. National rank is not a conference standing or an invented AP/CFP poll claim.

The existing approved fetch-espn-status collector now retains these already-received cfb scoreboard fields, with no new endpoint, recurring job or ingestion architecture. A bounded two-snapshot metadata-only backfill reused normalizeFixture and verified event/team/home-away identities; all saved scores, source snapshot timestamps, injuries and lineup details were preserved. Metadata check time is recorded separately. Normal scheduled ingestion maintains these fields going forward. UI consumes local data/espn only; shared theme accent and heading-weight tokens style ranks. Conference/rank, missing data, cross-conference, normalization and existing ticker tests pass. Version bumped; temporary preview stopped after verification.


## 158. Brandon: bold conference labels and prioritized Top25 section (Oct 23)
NCAA football ticker begins with a separate Top 25 matchups group for games involving at least one verified ranked team, regardless of conference. Two-ranked-team games lead that section, then remaining games by best national rank. Each matchup appears once; remaining unranked games retain their conference/non-conference sections. When no ranked teams are scheduled/live, no empty Top25 section appears. Other sport/All sports grouping remains unchanged. Conference and Top25 labels use a shared 800-weight token and primary text color for clearer hierarchy. Tests cover either-side ranks, two-ranked priority, cross-conference grouping, no duplication and All sports preservation. No data ingestion, scores, rankings, schedules or filters changed. Version bumped and temporary test server stopped after checks.

## 159. Codex: repository sync recovery and college account progress (Oct 23)
Fetch trace showed a slow transfer of over 35,000 generated-data history objects, rather than a credential failure. Fetched a shallow current-main snapshot, verified GitHub compare reported the last published commit as behind current main, and aligned the clean checkout with reset --keep, preserving GEMINI.md. A subsequent ordinary incremental fetch completed. Recovery instructions are in routines/FADE-TRENT.md; no force-push or security verification bypass was used.

Added college display-code aliases airf→afa, wyom→wyo, umass→mass, uconn→conn to the existing progress adapter. Both away/home teams still must match uniquely. Full-game totals and first-half Wyoming spread now resolve the existing ESPN snapshots; stale/missing evidence stays unavailable and completed snapshots retain final progress. No ingestion or frozen NBA matcher changes. Regression tests cover both matchups, reversed/duplicate games, half spread, stale data and final status. Existing progress, Trent, no-instructions and NBA testing tests passed. Saved verified Trent observations were imported without inventing picks or grades; cache-busting version bumped.

## 160. Codex: capture late-listed live markets (Oct 23)
Every live-watch publish now merges the already-fetched event market list into saved baselines. Existing mid/buy prices and per-market timestamps remain unchanged; new eligible markets receive their first-observed prices and timestamp. The updated opening file is saved locally and included in the public JSON so subsequent Actions runners retain it. New markets cannot produce a price-movement edge on the initial observation. No extra market request, threshold relaxation, scheduler or AI runtime was added. Existing participation/injury/score classification, executable-side/liquidity and odds checks remain in force.
Regression covers late player and total markets, zero initial edges, later movement, restart round-trip, deduplication and old baseline preservation. Live-watch, participation, context, frozen NBA, no-instructions and no-AI tests passed. A real MEM–GS publication verified expansion from the earlier single-market baseline and preserved its original prices. This changes feed generation only; no frontend version bump is needed.


## 161. Brandon: national ranks in the sport scoreboard (Oct 24)
College-football scoreboard cards below the ticker now show the verified #1-#25 national rank beside the matching away/home team name, using curatedRank.current already preserved in data/espn. Missing, 99, out-of-range or noninteger ranks produce no badge; professional sports do not receive college rankings. Accessible game-selection labels include each rank and rank spans announce National rank. Shared accent/weight tokens retain compact readable rows; score, game identity, sport filtering and click-to-filter behavior are unchanged. No new data requests, ingestion or schedules. Scoreboard/rank regression and theme/version checks pass; bounded local preview stopped after verification.


## 162. Brandon: five-at-a-time Show less (Oct 24)
Live Bets game/prop lists, Activity alerts and Build a Bet leaf lists now expose Show N less as soon as expanded. More and Less remain available together until the respective end is reached. Each click reveals/hides at most five actual items; partial final batches are counted accurately, and collapse never goes below the initial five. Display limits clamp to the available source count after refresh, preventing stale expansion counts or overshoot. Keyboard focus returns to the corresponding replacement action (or remaining action) after redraw without forcing a scroll jump. Shared theme spacing/control styles and centralized wording reused. No data, scoring, source, scheduling or private-account changes. Relevant tests and bounded browser checks verify forward/backward counts and the baseline; test server stopped afterward.


## 163. Brandon: college-football conference and Top25 filters (Oct 24)
Selecting College Football in Live Bets now exposes All conferences, Top 25 and each conference represented in today's published scoreboard. A conference selection filters both scoreboard matchups and all displayed game/prop edges and activity to the same verified games. Top25 includes either nationally ranked team (#1-25), independently of conference; ranked games remain included in their conference too. Explicit non-conference and unavailable-metadata groups appear when present. Existing individual-game selection narrows within the group; Show all games clears only that game selection. Sport changes reset the group; normal refresh preserves it.
Uses the existing local data/espn snapshot loader/cache with no new timer, endpoint, collector or routine. Conference evidence follows the ticker's conferenceCompetition plus explicit conference group rule; missing evidence is never guessed from names. Bet identity retains authoritative event IDs and unique exact team/date fallback, rejecting conflicting IDs or ambiguous matches. Unavailable filtered snapshots fail closed rather than showing unrelated bets. Existing tier filters, card actions, five-item controls, six main tabs and shared theme roles remain. Regression covers conference/Top25 overlap, unknown/nonconference, identity isolation and invalid ranks; desktop/390px checks confirm SEC and ranked subsets, 44px controls, no filter overflow and clear-game behavior. Version bumped; bounded preview server stopped after checks.


## 164. Shared public JSON requests and Node strings repair (Oct 24)
Reed authorized request optimization without a hosting or production-schedule change. js/public-json.js now shares in-flight public JSON reads across components, bounds fan-out to six, caches mutable manifests for 30 seconds, and reuses ESPN/live files by their published fetched_at/updated revision. Live Bets, progress, scoreboard, ticker, slate, flags and app reads use it; existing visible refresh intervals and explicit source freshness guards remain. Hidden tabs do not start new shared requests (already running requests may finish); queued work checks visibility and rate cooldown before starting. HTTP 429 honors Retry-After with a host-wide cooldown; other failed reads retry after a short cooldown and never become successful cached data. No private portfolio credentials/responses, new storage, cross-tab leader, ingestion, hosting, DNS or routines were added. Public browser/CDN revision keys replace component-specific timestamp URLs on the shared path.
The college conference string addition used bare STR, which is absent when Node collectors load strings through a window object. It now consistently uses window.STR. Regression covers isolated Node strings loading, new live-feed revisions, actual progress score/final transitions, simultaneous consumers, hidden/resume behavior, rate backoff and bounded fan-out. Existing basketball testing protocol/helper hashes are untouched.


## 165. Browser scrolling and refresh rendering performance (Oct 24)
Reed authorized browser performance work with hosting and production routines unchanged. Repeated cards/pills now omit backdrop blur and broad card shadows in the shared theme; navigation/sheets retain blur, palette/geometry remain, and canvas gradients scroll with the page. Closed Live Bets activity and past-edge sections build their content only when opened and release it on collapse. Visible live content skips full replacement when its data/UI/source revision is unchanged, while freshness/holdings text still updates; changed feeds, ESPN publications, filter/detail state, eligibility and stale transitions invalidate the view. Source freshness and existing 30-second live/15-second progress checks are unchanged. Progress rendering skips replacement for identical results but repaints real score/value, source timestamp, unavailable/stale and final changes. A private in-memory holdings badge revision tracks exact held contract/outcome eligibility, excluding changes to price/cost/quantity magnitude; no private IDs or data are put in events or storage, and authenticated sync cadence is unchanged. Existing frozen NBA matching/model helpers are unchanged. Regression covers lazy open/collapse, live invalidation, actual progress writes and holdings direction/period/expiry/combo isolation.


## 166. Crowded Saturday browser work limits (Oct 24)
Reed authorized bounded presentation and collapsed results without moving hosting. Game/prop lists, opened activity and price history use six-item Previous/Next pages rather than accumulating cards; all eligible entries remain reachable and totals are unchanged. The bet log is collapsed by default, builds six entries on open, releases them on collapse, and pages across the entire published record (previously only latest thirty). Settled log rows retain result/price/time/link and no longer create live-progress hosts. Pending rows retain exact contract/period resolution. Record tables omit backdrop blur; log cards use off-screen rendering containment. IntersectionObserver prioritizes progress within 400px of the viewport; entering cards refresh immediately from the shared snapshot cache, with existing 15-second checks, hidden-tab guard, source/stale/final rules and no-observer fallback. Detached observers are pruned on scans. Live feed/scoreboard refresh cadence and GitHub Actions → data/espn architecture remain unchanged; no extra API, routine or recurring AI.
Stress regression uses synthetic 64-game/2048-option college slate, 2000 progress hosts, and 12000 record entries. Verifies bounded pages/full reachability, scoreboard matching, changed scores/finals/stale warnings, near-viewport work and detached cleanup, collapsed/settled log behavior. This is functional/load regression, not a measured device FPS or upstream API capacity guarantee. Frozen NBA model/matcher helpers are untouched. Custom column allocation was discussed as a follow-up and is not implemented here.


## 167. Live Bets column preferences (Oct 24)
Reed requested immediate deployment of the customizable allocation. A Layout select above the live lists offers game-line/prop-bet column splits 4/0, 3/1, 2/2, 1/3 and 0/4. Zero allocation omits that category DOM entirely; eligible counts and feed inputs remain unchanged. Nonzero empty categories show the existing empty state, retaining the chosen space. Desktop uses four equal grid tracks and category spans; narrower screens stack categories with two card columns. The validated selection is saved in localStorage under liveBets.layout.v1, with a safe 2/2 default if storage fails. Preferences survive feed refreshes and sport changes; six-item pages, shared score snapshots, observer-based progress, exact holdings badges and all timers are unchanged. No hosting, API, ingestion or production schedule change.

Pagination sizing follow-up: category Previous/Next controls now use the same column tracks as their cards, one card-width per button. The page count occupies a separate full-width row, including asymmetric and single-category layouts.

Oct 24 pagination refinement: Reed requested Previous/Next slightly narrower than cards. Each button is centered within its existing card track with a 4px inset per side; paging, layout allocation and refresh behavior are unchanged.


## 168. Compact visual layout chooser (Oct 24)
Reed requested one Layout button that reveals visual arrangement options. Replaced the wide native select with a native details/summary disclosure and five miniature four-column previews, a game-line/prop-bet legend, numeric splits, exact accessible option labels and pressed state. Selection saves the same preference, closes the chooser, and returns focus to its trigger; Escape closes it. Existing allocation, six-item paging and all refresh behavior remain unchanged. Previous/Next retains the separately requested 4px inset per side.

Oct 24 pagination spacing: category controls now have the same --space-3 gap above them and between tracks as the card grid. The requested centered 4px button inset remains intact. No runtime/data changes.

Oct 24 page-background seam: the shared scrolling atmosphere retained a 100vh image size after fixed attachment was removed, visibly clipping colored layers at one viewport. Background size now follows the full body content (100% 100%), including changing card layouts and expanded sections. No fixed layers, blur, extra surfaces, timers or requests added; custom palettes remain flat.

Oct 24 Layout placement: moved the compact visual chooser beside the holdings status, under the scoreboard and above tier filters, as marked in Reed’s screenshot. A wrapping flex utility row preserves mobile fit and the same preference/chooser behavior.

Oct 24 conditional holdings UI: Live Bets shows Polymarket holdings status and requests its refresh only when a saved encrypted vault or an unlocked session exists. isLinked exposes only a boolean, no credentials/positions. Existing sync already avoids private requests without an unlocked account; that guard is preserved. Unlinked visitors see Layout alone in the utility row. Kalshi remains origin-isolated and has no Live Bets holdings poller; a saved Kalshi origin is not misrepresented as synced Polymarket holdings.
