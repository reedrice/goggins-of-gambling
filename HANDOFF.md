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
css/style.css         dark mobile-first theme (sections 1-9; 9 = picker/logos/toggle/tooltips)
js/strings.js         all UI text (plain-language rules in its header)
js/calc.js            odds and parlay math (pure)
js/storage.js         localStorage schema and access
js/teams.js           team logos: Polymarket logo -> ESPN CDN -> colored circle; ESPN abbreviation fixes
js/markets-core.js    Polymarket US event/market compaction + labels (browser + Node)
js/picker.js          market picker UI + live Polymarket US fetches
js/github-log.js      shared log writer (GitHub REST contents API)
js/app.js             UI controller
data/markets/index.json         snapshot: list of upcoming games (small, loaded first)
data/markets/events/<slug>.json snapshot: every market of one game (lazy-loaded)
data/picks.json       today's picks (overwritten daily by the job)
data/predictions.json game predictions and grades (appended by the job)
data/bet-log.json     shared calibration log (written by the app with users' tokens)
tests/calc.test.js        node: math
tests/github-log.test.js  node: log writer against a mocked API
tests/smoke.js            headless Chrome UI walk-through (puppeteer-core, --no-save)
scripts/update-picks.mjs  daily-job CLI: validate, write, commit, and push picks/predictions
scripts/fetch-markets.mjs daily-job CLI: refresh data/markets from Polymarket US + match Kalshi, enrich picks.json
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
    "legs": [{ "desc": "Under 6.5", "price": "48" }],  // price as typed
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
| `betdash_prefs` | `{platform:'polymarket_us'|'kalshi', priceFormat:'cents'|'american'|'decimal'}`. Defaults: Polymarket US, cents. **One value** drives the onboarding step, the "I bet on" bar under the header and Settings |

Backups (`Export JSON`) use the format `{format:"betdash-backup", version:1, exportedAt, profile, bets, settings, prefs}`.

## 8. How the daily job updates picks

Use **`scripts/update-picks.mjs`**. It's plain Node 18+ with no dependencies. It validates the schema **and** the privacy rule before writing anything, stages only the data file it changed, commits to `main` with a descriptive generated message, then runs `git pull --rebase` and `git push`.

```bash
node scripts/update-picks.mjs validate [file]              # check only (picks.json, or predictions.json by filename)
node scripts/update-picks.mjs picks /tmp/new-picks.json    # replace data/picks.json, commit, push
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
4. `picks` the new slate. Pages redeploys in about a minute, and the app cache-busts its fetches.
5. `node scripts/fetch-markets.mjs --commit` (see §13). Run it **after** step 4 so the new picks get Polymarket/Kalshi links and Kalshi prices.
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

**What users see (Build a bet):** a search box (fuzzy, instant: "purdy", "leafs ml", "under 6.5") and **Browse games**: date chips (multi-select, default today + tomorrow), sport chips, game cards. A game opens into *Main bets* (who wins, spread with each team's line, totals), *Player bets* grouped by player, and *Other*. Every market has big Yes/No buttons with prices; tapping adds a leg to the slip. **Type a bet yourself** adds a manual leg for any other app. Slip legs have a remove ×, a "Picks that affect each other" flag when two legs are from the same game, and "Prices as of …".

**Live vs snapshot:**
- The **game list and search** use the daily snapshot in `data/markets/` (listing every game live would be tens of MB).
- **Opening a game** re-fetches that game live from `https://gateway.polymarket.us/v1/events/slug/{slug}` (CORS is `*`). The header says "Live prices as of …" or falls back to the snapshot time.
- **Each slip leg** gets a live price from `/v1/markets/{slug}/bbo` on add and on **Refresh prices**.
- **Kalshi** has no CORS, so Kalshi prices and links come **only** from the snapshot.

**Pricing rule (Polymarket US):** the market side with `long:true` is "Yes" and its quote is the best ask. The No cost is `100 − bestBid`. Spreads are listed under the favorite's slug (e.g. "TB −1.5"); the long side may be the underdog +1.5, so labels come from each side's own team and line (`MarketsCore.fmtLine`). Totals: long = Over.

**Snapshot schema:**
- `data/markets/index.json`: `{schema_version, updated_at, source, dates[], events:[{id, slug, sport, league, title, start_time, date (CT), url, polymarket_url, kalshi_url, teams:[{abbr, display, name, short, logo, color}], market_count, players:[[name, teamAbbr]], file}]}`.
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
- Web URL format used: `https://kalshi.com/markets/<series>/<event ticker>` (lowercase). **Unverified:** kalshi.com blocked automated checks (HTTP 429). If Kalshi links break, fix `kalshiUrlFromTicker` in `js/picker.js` and the matching helper in the script.
- Known gaps: some prop series return no markets for some games (e.g. any-time TD, NHL goals/points), so those legs fall back to the game page.

## 15. Plain language and strings (js/strings.js)

All UI text lives in `js/strings.js`, grouped by screen and commented. Rules (also in its header): no jargon (EV, implied probability, vig, no-vig, correlation, edge, units, multiple, independent). Use "Chance to win", "Fair price", "Your price advantage", "Payout (how many times your money)", "Picks that affect each other", "Expected profit per $10 bet, on average over time". Anything that needs more explanation gets an (i) button: add the text to `STR.tips` and render `tip('key')`. Sizes show as dollars ("$5.00 (half your standard bet)"); `units` stay in `picks.json` only. Pick text in `picks.json` (reasoning, notes) should follow the same rules.

## 16. Platforms and price display

`APP_CONFIG.platforms` is the single ordered list: Polymarket US, Kalshi, Bovada, FanDuel, DraftKings, BetMGM, Caesars, ESPN Bet, Fanatics, bet365 (`{id, name, short, color}`), plus `otherPlatform`. It feeds the leg dropdown in Build a bet (with **Other**) and the Record tab's "How each app pays on combo bets" table, which shows every platform with a colored badge, "No bets logged yet" when empty, and Other only if it has data. `myPlatforms` lists the ones that can be the "I bet on" choice.

Prices show as **cents by default** (Polymarket style). Settings → Price format can switch display to American (63¢ → −170, 48¢ → +108, 50¢ → +100) or decimal (`BetCalc.formatPrice`). Price inputs accept any format regardless of the setting. Picker legs store fractional cents as `"63.5c"` so they don't parse as decimal odds.
