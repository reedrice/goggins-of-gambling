# Sandbox branch instructions

On sandbox/brandon-picks or a branch derived from it, read sandbox/README.md before any work. Brandon is experimenting with Today's Picks layout. Use node sandbox/serve.mjs for previews. Do not run production routines, publish to main, change Pages settings or modify other owners' areas. Keep the sandbox write guard enabled. A finished design requires Reed's review through a pull request.

# AGENTS.md: start here (any AI agent or new maintainer)

This file is for Claude, ChatGPT/Codex, Cursor or any other agent. `CLAUDE.md` points here.
Read in this order:
1. **This file**: the project, how to run it, the hard rules.
2. **[DESIGN.md](DESIGN.md)**: Reed's design rules. Follow them for every UI change.
3. **[STATUS.md](STATUS.md)**: what's done and the open to-dos.
4. **[HANDOFF.md](HANDOFF.md)**: the detailed numbered log (§1–§57). Every feature has a section; add one for yours.
5. [README.md](README.md) (features, privacy) and [ROADMAP.md](ROADMAP.md).

## What this is
"Goggins of Gambling" is a mobile-first, **static** betting *analyzer* for Reed and friends (plain HTML/CSS/JS, no build step, no backend). It shows daily picks with neutral reads, a Build a Bet market picker, My Bets (a private bankroll tracker in localStorage), Record (calibration), Fade Trent and Settings. Prices come from Polymarket US (public gateway), Vegas lines from The Odds API, and stats from ESPN's free APIs. **It is an analyzer, not a pick seller.**

## Architecture / file map (detail: HANDOFF §2–§3)
- `index.html` loads every script with a `?v=<version>` cache-buster. `config.js` holds the brand and platforms.
- `js/app.js`: tabs and rendering (Picks, Build a Bet, My Bets, Record, Settings). `js/strings.js` holds **all UI text**.
- `js/picker*.js`: Build a Bet market picker. `js/markets-core.js` normalizes Polymarket US events.
- `js/viz.js`: tap-a-bet pop-up: zoomable live price chart (§48, §53, §55) + prop bet bars.
- `js/our-chance.js`: the **Analytics** blend (§56), shared by the browser and scripts.
- `js/dig-deeper.js`: the Dig deeper sheet + `POSITION_STATS`, the one position-to-stats map (§57).
- `js/evaluate.js` (risk/verdict), `js/calc.js` (payout math), `js/vegas.js` (Vegas lines), `js/plain.js` (plain words), `js/storage.js` (localStorage), `js/positions.js`, `js/teams.js`, `js/gametime.js`, `js/play.js` (play money), `js/trent.js`, `js/share.js`, `js/github-log.js`.
- `css/style.css` (ours) and `css/live-bets.css` (Richie's).
- `data/*.json`: picks, predictions, markets, Vegas lines, history, learning (§5). `scripts/*.mjs` are the jobs that write them.

## Run and test locally
```bash
python3 -m http.server 8765        # open http://localhost:8765/
for f in tests/*.test.mjs tests/*.test.js; do node "$f" || echo "FAIL $f"; done
# headless UI walk-through (optional): npm i --no-save puppeteer-core; CHROME=/usr/bin/google-chrome node tests/smoke.js http://localhost:8765/
```

## Deploy
GitHub Pages serves `main`. **Push to main = deploy** (it's live in about a minute). Before every push that changes the site, run `node scripts/bump-version.mjs`. It stamps `version.json` + every `?v=` in `index.html`, so phones auto-reload (§49). Use descriptive commits and add a HANDOFF § note.

## Data flow and scripts (detail: HANDOFF §8, §13, §17, §36)
- `scripts/update-picks.mjs picks <file>`: validates, runs `scripts/our-chance.mjs` (hit_prob = Analytics), fills risk/verdict, commits. Also `fill`, `grade`, `lineup`, `list`.
- `scripts/fetch-markets.mjs` → `data/markets/`. `scripts/fetch-book-odds.mjs` → `data/vegas-lines.json`, `data/book-odds.json` (needs `ODDS_API_KEY`). `scripts/ingest-vegas.mjs` → `data/vegas-manual.json`.
- `scripts/capture-closing.mjs` → `data/pick-history.json` (logs hit_prob, our_chance, market_chance). `scripts/learn.mjs` → `data/learning.json` (calibration).
- `scripts/archive.mjs` → `data/archive/` (append-only gzip NDJSON for backtests/weight-tuning; schema in `data/archive/README.md`, HANDOFF §59). It runs after capture-closing.
- `scripts/trent-picks.mjs`, `scripts/play-leaderboard.mjs`, `scripts/fetch-positions.mjs`.

## Fade Trent clarifications (dev-only, HANDOFF §58)
Unclear Trent bets are flagged `needs_clarification` + `question` and stay pending.
- **Answer directly:** `node scripts/trent-picks.mjs clarify <id> --set key=value --answer "..." --commit`.
- **Dev vote:** `ask <id> --question ".." --issue --option "A label|k=v" --option "B label|k=v"` opens a `trent-clarify` issue. It @mentions all current collaborators (fetched live; Reed's standing permission, unclear bets only), with one comment per option; devs 👍 to vote. Then run `tally <id> --commit` (tie: reedrice decides).
- **See open questions:** `questions`, or the site with `?dev=1`.

## File ownership

**Oct 20, 2026 override authorized by Reed:** ChatGPT temporarily maintains the Live Bets feed and live files while Pablo is usage-limited. See `routines/LIVE-FEED.md` and `routines/owners.json` (`live-feed-update`). The ownership restrictions below apply again after handback. Do not run an independent feed scheduler during this takeover.

- **Pablo's live system** (read-only for everyone else): `data/live/`, `scripts/live-*.mjs` (live-tick, live-watch, live-context, live-discord) and their tests/fixtures. Live-tick scheduling is Pablo's. Read his files; never write them. Leave requests in HANDOFF ("Requests for …").
- **Richie's Live Bets view**: `js/live-bets.js`, `css/live-bets.css` (§32). Don't edit; ask in HANDOFF.
- Everything else belongs to Reed's bot.

## Hard rules (non-negotiable)
1. **Privacy:** never commit dollar amounts, bankrolls, stakes, tokens or keys. Money lives only in the user's localStorage.
2. **`ODDS_API_KEY`** is read from the environment only. Never print, log, echo or commit it.
3. **Analyzer, not pick seller:** no bet instructions ("tap No on…"), no suggested bets or stakes, no advice wording on the site. Use neutral reads and examples only ("$10 → $20", the user's own unit). `tests/no-instructions.test.mjs` guards this. How-to-bet help stays in private chat.
4. Say **"prop bets"** (not "props") in UI text.
5. **No cents** anywhere on screen. Show whole dollars and American odds (§29, §52).
6. **Exactly 6 tabs.** New features go in sheets or pop-ups (e.g. Dig deeper), never a new tab.
7. **Analytics** = the blend of history (ESPN, beta-shrunk) + no-vig Vegas + the market, in log-odds, clamped to 3–97% (`js/our-chance.js`). The UI label is "Analytics", never "Our chance".
8. **Position-aware stats:** stat pickers offer only stats that fit the player's ESPN position (`POSITION_STATS` in `js/dig-deeper.js`). Goalies only see goalie stats, skaters never do, and so on.
9. Set user-visible text through `js/strings.js` / textContent. Allow only https links.
10. Follow [DESIGN.md](DESIGN.md).


## Routines handoff (Oct 20, 2026)
Reed's 5 routines can be run by any bot (grok, chatgpt, pablo). Only the owner in `routines/owners.json` runs each one. See [routines/README.md](routines/README.md). Every run starts with `node scripts/routine-gate.mjs check <id> <me>` and ends with `stamp`.
