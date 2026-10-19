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
| `config.js` | `APP_CONFIG` | brand text and repo wiring. **The only place the brand lives.** |
| `js/calc.js` | `BetCalc` | pure math: price parsing, parlay multiple, hit chance, gap, EV, P/L. Also loads in Node (`module.exports`). |
| `js/storage.js` | `Store` | the **only** code that touches localStorage. Handles export and import. |
| `js/github-log.js` | `GitHubLog` | builds dollar-free records and upserts them into `data/bet-log.json` via the contents API. |
| `js/app.js` | `BetDash` (debug) | UI: onboarding, hash router, the five tabs, event wiring. |

## 3. File map

```
index.html            DOM skeleton (onboarding overlay, header, 5 tab sections, tab bar)
config.js             brand + repo config
css/style.css         dark mobile-first theme
js/calc.js            odds and parlay math (pure)
js/storage.js         localStorage schema and access
js/github-log.js      shared log writer (GitHub REST contents API)
js/app.js             UI controller
data/picks.json       today's picks (overwritten daily by the job)
data/predictions.json game predictions and grades (appended by the job)
data/bet-log.json     shared calibration log (written by the app with users' tokens)
tests/calc.test.js        node: math
tests/github-log.test.js  node: log writer against a mocked API
tests/smoke.js            headless Chrome UI walk-through (puppeteer-core, --no-save)
.nojekyll             tells Pages to serve files as-is
README.md             user-facing overview and the picks.json schema
```

## 4. Key math (js/calc.js)

- **Price → probability `p`:** cents `63` → 0.63 (bare integers 1–99 are always cents). Probability `0.63` → 0.63. American `-150` → 150/250 = 0.60, `+120` → 100/220 = 0.4545. Decimal `2.5` or `2.5x` → 0.40. Add a `c`/`%` suffix to force cents and an `x` suffix to force decimal.
- **Estimated multiple** = Π(1/pᵢ). This is the payout if each leg were priced independently at its market price. Polymarket pays $1 per share, so a single at 40¢ is 2.5x.
- **Independent hit chance** = Πpᵢ = 1 / estimated multiple.
- **Gap** = quoted / estimated − 1. Example: 2.97 / 3.31 − 1 = −10.3%, meaning the platform shaved about 10% off the same-game parlay for correlation or vig. Collecting gaps per platform sharpens the `skip_below` thresholds.
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
    "estimated_multiple": 3.31,
    "quoted_multiple": 2.97,
    "gap": -0.1027,
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

Backups (`Export JSON`) use the format `{format:"betdash-backup", version:1, exportedAt, profile, bets, settings}`.

## 8. How the daily job updates picks

1. Build the new slate in the `picks.json` schema. Use **units, not dollars**, and the platform's actual ask prices (Reed's app is **Polymarket US**, a different exchange from polymarket.com). Set `verify_note` whenever a price came from somewhere else.
2. Overwrite `data/picks.json` and set `updated_at` to now (ISO, UTC is fine; the UI shows CT).
3. Grade yesterday's `data/predictions.json` entries (set `result` and `final_score`), then append today's predictions with `result: "pending"`.
4. Validate with `python3 -c "import json;json.load(open('data/picks.json'))"`, then commit to `main` with a descriptive message (e.g. `Update picks for 2026-10-20 slate` plus a body listing the sections and counts) and push. Pages redeploys in about a minute, and the app cache-busts its fetches.
5. Read `data/bet-log.json` to compare quoted vs. estimated multiples per platform and tune `skip_below`.

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
- Before pushing, run `node tests/calc.test.js && node tests/github-log.test.js`, plus `tests/smoke.js` if you changed the UI.
