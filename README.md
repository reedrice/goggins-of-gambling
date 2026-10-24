# Betting dashboard

A mobile-first static dashboard for daily picks, a private bankroll tracker, a bet calculator, and a shared calibration log. It's plain HTML, CSS, and JS with no build step and no backend, hosted on GitHub Pages.

**Live:** https://reedrice.github.io/goggins-of-gambling/

> **Brand:** the app name, tagline, and slogans live in [`config.js`](config.js) (`appName`, `tagline`, ...). The page title, header, and onboarding all read from it. To rename the app, edit `config.js` only. See [HANDOFF.md](HANDOFF.md#renaming-the-brand).

If you're an AI agent or a new maintainer, start with **[ONBOARDING.md](ONBOARDING.md)** for the reading order and current context, then **[AGENTS.md](AGENTS.md)** (then [DESIGN.md](DESIGN.md), [STATUS.md](STATUS.md) and the detailed log [HANDOFF.md](HANDOFF.md)). All UI text is in [`js/strings.js`](js/strings.js); the platform list is in `config.js`; market data refreshes with `node scripts/fetch-markets.mjs --commit`, and other apps' prices with `node scripts/fetch-book-odds.mjs --commit` (needs `ODDS_API_KEY`).

## Features

| Tab | What it does |
|---|---|
| **Onboarding** | On first visit, a full-screen setup asks for display name, starting money, standard bet size (default 2%), most per bet (default 5%), an optional end date, and **which app you bet on** (Polymarket US or Kalshi). Nothing else shows until it's done. |
| **"I bet on" bar** | Under the header. Picks Polymarket US or Kalshi; every **Open** button deep-links there. Same setting as onboarding and Settings. |
| **Picks** | Renders `data/picks.json`: game predictions, single bets, player props, parlays, long shots, and non-sports markets. Stakes are stored in **units** and converted to dollars with *your* unit size. |
| **Build a bet** | A **market picker**: a step-by-step **Filters** panel (day, sport, team bets or player props with sub-types like yards or goals, team with logos, player with position, e.g. "Brock Purdy · QB"), a search box ("purdy", "san") on top of it, or browse by game, then tap Yes/No to add a pick at its Polymarket US price (live when you open a game; daily snapshot otherwise). Team logos everywhere; picks from the same game get flagged. **Type a bet yourself** for any other app (prices as `63`, `0.63`, `-150`, `+120`, or `2.5`). Shows the payout, chance to win, how the app's payout compares to ours, and expected profit per $10. **Save bet** adds the slip to your tracker. |
| **Bets** | Current bankroll, a bankroll-over-time chart, open bets with settle won/lost/push, settled P/L, and W-L-P and ROI for singles, props, parlays, long shots, and non-sports. Export and import JSON backups. |
| **Record** | Win-pick accuracy and a calibration table (5-point buckets) from `data/predictions.json`, plus how each of 10 apps compares: combo bets people logged, prices pulled daily from The Odds API vs. Polymarket US, and the total. |
| **Settings** | Edit or reset your profile, choose your app and price format (cents default, American or decimal), manage your GitHub token, set the share default, and re-sync failed shares. |

## Privacy: who sees what

- **Bankroll, stakes, P/L, and profile** are stored only in your browser's `localStorage` and are never uploaded. Back them up with **Export JSON**.
- **Shared calibration log** (`data/bet-log.json`): if *Share this bet's numbers* is on (it's on by default once you add a token), saving or settling a bet commits **only** the platform, legs and prices, estimated and quoted multiples, gap, result, and your GitHub login. No dollar amounts are included.
- **Who can write:** writes go through the GitHub API using *your own* token. GitHub accepts them only if you are the repo owner or a **collaborator**. Public visitors can view the site and read the log, but they **cannot change anything**. Entries are tagged with the author's login, so the owner's entries can be weighted separately from friends'.
- **Never commit** dollar amounts, bankrolls, stakes, or tokens to this repo.

### Setting up sharing (collaborators)
1. Reed adds you under repo **Settings → Collaborators**, and you accept the invite.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new). Set **Resource owner** to `reedrice`, **Repository access** to *Only select repositories → goggins-of-gambling*, and **Permissions** to *Contents: Read and write*.
3. Paste it in **Settings → GitHub token → Save & test**. It's stored only in that browser.

Without a token, sharing is disabled and the app says so.

## `data/picks.json` schema

A daily job overwrites this whole file. All fields are optional unless marked **required**. Prices are **ask cents** (0–100), `fair` is the **no-vig book %** (0–100), and stakes are in **units only (never dollars)**.

```jsonc
{
  "schema_version": 1,                 // required, currently 1
  "slate_date": "2026-10-19",          // required, YYYY-MM-DD
  "updated_at": "2026-10-19T05:55:00Z",// required, ISO 8601 (shown as "Last updated" in CT)
  "generated_by": "daily digest job",
  "notes": ["Banner text shown above the picks"],
  "sections": {                        // required. Every key is optional; missing = "Nothing here today"
    "predictions": [ Prediction ],
    "singles":     [ Pick ],
    "props":       [ Pick ],
    "parlays":     [ MultiPick ],
    "longshots":   [ MultiPick ],
    "lottery":     [ MultiPick ],   // 7-20 leg "lottery tickets", 0.1u max (HANDOFF §44)
    "nonsports":   [ Pick ]
  }
}
```

**Pick** (single market):

| field | type | notes |
|---|---|---|
| `id` | string, **required** | unique within the file, e.g. `p-purdy-int` |
| `sport` | string | `NFL`, `MLB`, `NHL`, `NBA`, `WNBA`, `Soccer`, `Politics`, ... (free text) |
| `event` | string | e.g. `Commanders @ 49ers (MNF)` |
| `market` | string | e.g. `Brock Purdy interceptions` |
| `side` | string, **required** | the exact thing to buy, e.g. `Purdy 1+ INT — YES` |
| `platform` | string | `Polymarket US`, `Polymarket`, `Kalshi`, `Bovada`, `DraftKings`, `FanDuel`, `Other` |
| `price` | number | ask in cents (0–100) |
| `fair` | number | no-vig fair % (0–100) |
| `edge` | number | `fair − price` in points. Computed if omitted |
| `stake_units` | number | `0` = skip |
| `stake_units_max` | number | optional upper end of a range (e.g. 0.25–0.5u) |
| `action` | `"bet"`/`"wait"`/`"skip"` | badge. Defaults to bet if stake > 0, otherwise skip |
| `reasoning` | string | short reason for the pick |
| `link` | string | market URL (http/https; a bare host is OK) |
| `pending_news` | string/null | e.g. `Starting goalies not confirmed`. Shown as a yellow flag |
| `lineup_note` | object/null | `{status: confirmed\|at_risk\|out, text, source, source_url?, checked_at}` from the lineup check. Green / orange / red line on the card with its source. Set only with `update-picks.mjs lineup` (HANDOFF §34) |
| `verify_note` | string | e.g. a warning that the price came from another platform |
| `market_id` | string | Polymarket US market slug (from `data/markets`), e.g. `aec-nfl-was-sf`. Lets the app pull a live price and build links |
| `market_side` | `"yes"`/`"no"` | which side of `market_id` the pick is |
| `team` / `teams` | `{league, abbr}` / `[{league, abbr}]` | shows team logos (`league` = nfl, mlb, nhl, nba, wnba) |
| `hit_prob` | number | estimated true hit chance % (0–100). Defaults to `fair` (singles) or the product of legs (combos). Shown as "My hit chance" |
| `risk` | `safer`/`coin_flip`/`risky`/`long_shot` | risk badge. Default from hit chance: 60%+ / 45–59% / 25–44% / under 25% |
| `verdict` | string (≤120) | "My take" one-liner. Default from `action` and edge |
| `slate_date` | YYYY-MM-DD | game day (CT) if it isn't the file's `slate_date`, e.g. tomorrow's slips. The Picks tab shows a Today / Tomorrow switcher |
| `start_time` | ISO 8601 | first game's start (legs can have their own) |
| `prediction_id` | string | game prediction to show on the card (default: matched by game name) |
| `polymarket_url`, `kalshi_url`, `kalshi_match`, `kalshi_price` | written by `scripts/fetch-markets.mjs` | per-platform Open links; `kalshi_match` is `market`, `event` or `none` |
| `player`, `player_team`, `league` | written by `scripts/fetch-markets.mjs` | for player props (picks and legs): who it is, for the position badge ("Brock Purdy QB") |

**MultiPick** (parlays, long shots) has the Pick fields plus:

| field | type | notes |
|---|---|---|
| `legs` | `[{desc, price?, fair?, platform?, market_id?, market_side?, team?}]`, **required** | `price` in cents. Omit it if unknown. Legs get the same link fields as picks |
| `est_multiple` | number | product of 1/price across legs |
| `quoted_multiple` | number/null | what the platform actually quoted, if known |
| `same_game` | boolean | legs are from the same game (correlated). Default from leg `market_id`s |
| `skip_below` | number | don't bet if the app quotes below this multiple |

**Prediction** (`sections.predictions`): `{ id, sport, game, start_time (ISO), pick, win_prob (50–100), projected_score, player_projections: [string], reasoning }`.

**Updating it:** run `node scripts/update-picks.mjs picks <file>` (keeps not-yet-played later-day picks), or `add-picks <file>` to add tomorrow's picks next to today's. It validates the schema and blocks any dollar amounts, then commits and pushes to `main`. The same script appends and grades predictions. See [HANDOFF.md §8](HANDOFF.md#8-how-the-daily-job-updates-picks).

Other data files (`data/predictions.json`, `data/bet-log.json`) are documented in [HANDOFF.md](HANDOFF.md#data-files).

## Run locally and test

```bash
python3 -m http.server 8765        # open http://localhost:8765/
node tests/calc.test.js            # odds and parlay math
node tests/github-log.test.js      # shared-log record and sha-retry flow (mocked API)
npm i --no-save puppeteer-core && node tests/smoke.js http://localhost:8765/   # headless UI walk-through
```

## Deploy

Pushing to `main` publishes the site. GitHub Pages serves the repo root (`main` / `/`), and `.nojekyll` makes it serve files as-is. A deploy usually takes about a minute.
