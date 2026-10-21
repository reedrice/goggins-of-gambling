# ROUTINES HANDOFF

## Oct 21 rules-based migration

Reed authorized moving the five former Grok jobs to GitHub Actions without scheduled AI. See [ACTIONS.md](ACTIONS.md) for schedules, source coverage and differences from the historical prompts below. Only owners.json determines execution. After successful hosted takeover, bots must skip these five and disable external schedules; even a no-op AI gate check can consume usage. The prompts below are historical requirements, not instructions to schedule bots or send messages. Fade Trent new-post ingestion remains paused without a separate source.

Reed has 5 routines (scheduled jobs). Any bot can run them: Goggins Of Gambling on Grok Bot (`grok`), ChatGPT/Codex (`chatgpt`), Richie's Pablo (`pablo`). **Only one bot runs each routine.** The switch lives in [`owners.json`](owners.json).

## How the switch works

- Each routine has an `owner` and `enabled`. When a bot's schedule fires, step 0 is always the gate check:
  `node scripts/routine-gate.mjs check <routine-id> <your-name>`
  - Prints `RUN` (exit 0): you own it, go.
  - Prints `SKIP (reason)` (exit 3): stop right away and send nothing.
- **Handover guard:** if a different bot ran this routine in the last 30 minutes, you get SKIP even if you are the new owner. That stops two bots running at once during a switch.
- The last step is always `node scripts/routine-gate.mjs stamp <routine-id> <your-name>`. It writes `last_run_by` and `last_run_at`, then commits and pushes. It pulls with rebase first and retries once.
- `node scripts/routine-gate.mjs list` shows who owns what.

## How to switch a routine to another bot

1. `node scripts/routine-gate.mjs set <routine-id> <new-owner>`. Owners: `grok`, `chatgpt`, `pablo`, `off`. Add `--off` to keep the new owner but pause it. This commits and pushes `routines/owners.json`.
2. Give the new bot the schedule below and the paste-in prompt. Its own scheduler fires at `schedule_ct` (cron, America/Chicago).
3. The old bot can keep its schedule. Its gate check will SKIP from now on. To turn a routine off everywhere: `set <id> off`.

## What a new bot needs

- **GitHub push access** to `reedrice/goggins-of-gambling` (`gh` / git with a token). Push straight to main. Always pull with rebase first and never force-push.
- **`ODDS_API_KEY`** env var for `scripts/fetch-book-odds.mjs` (digest only). Never print, log or commit it.
- **X/Twitter read access** (any tool) for lineup sources and Fade Trent.
- **A browser** to read Bovada odds (bovada.lv, no login, never place bets).
- **A private chat with Reed** to send messages. The site never shows stakes or bet instructions.
- **Private bankroll/unit:** Reed gives it to you in your private chat. It is never in the repo.
- **State:** everything lives in the repo: `data/picks.json`, `data/predictions.json` (the predictions log; use this, not any bot-private store), `data/learning.json`, `data/bet-log.json`, HANDOFF.md. Grok Bot's private memory/store paths (under `/cursor/stores/...`) only work on Grok Bot. Don't rely on them.
- Read `HANDOFF.md`, `AGENTS.md` and `DESIGN.md` first. Never touch Pablo's Live Bets files unless Reed OKs it.

## Paste-in prompt for a new bot

```
You now own some of Reed's betting-dashboard routines (repo reedrice/goggins-of-gambling).
Read routines/README.md, HANDOFF.md and AGENTS.md. Your name for the gate is <your-name>.
For each routine in routines/owners.json, schedule it at schedule_ct (America/Chicago).
Every run: step 0 `node scripts/routine-gate.mjs check <id> <your-name>`, and stop silently on SKIP.
Then follow that routine's steps in routines/README.md. Last step: `node scripts/routine-gate.mjs stamp <id> <your-name>`.
Never commit dollar amounts, bankrolls, stakes or keys. Message Reed only in your private chat with him.
```

## Daily slate & odds digest (`daily-slate-odds-digest`)

- **Schedule (CT):** `0 7 * * *`
- **Notes:** Morning digest. Time from the HANDOFF ("7 AM digest").

**Step 0:** Run `node scripts/routine-gate.mjs check daily-slate-odds-digest <your-name>`. Stop silently on SKIP.

**Steps:**

Put together Reed's morning betting digest for today's pro sports slate. Pro leagues only, no college. Focus on MLB, NFL, NHL and NBA, and add other pro markets only when the pricing looks unusually juicy. Reed bets on Polymarket.

Which Polymarket: Reed uses Polymarket US (polymarket.us), a separate exchange from international polymarket.com, and prices can differ between them. Pull all sports prices, including player props, from Polymarket US. Its public API is at gateway.polymarket.us (no key needed), and event pages look like polymarket.us/sports/nfl/nfl-was-sf-2026-10-19, with hundreds of markets per game, including props. Link markets to their polymarket.us pages. "Yes" costs the ask, and "No" costs 1 minus the Yes bid. Only recommend sides that are buyable (marketSides[].tradable true); most NBA props are Yes-only. For non-sports markets, use Polymarket US if it lists them; otherwise say the market is on polymarket.com. Do not show cents to Reed: show the dollar payout ("$10 pays $24") plus American odds (Vegas line when available, e.g. "Vegas +133 (Bovada)", else the Polymarket price converted).

Mindset: think like David Goggins applied to betting, with Togi-level nerve on long shots. No excuses, no forcing action, brutal honesty about what has an edge. Plain language a beginner understands. Say "prop bets", never "player bets".

Rules (approved 2026-10-19; keep until learning data says otherwise): (1) Cap parlays at 2-3 legs, each 55%+ hit chance, except the labeled long-shot section. (2) NHL 1+ point/assist props only with 3+ points of edge vs no-vig Vegas. (3) Lean singles toward game winners and totals with real price edge. (4) Never suggest picks or combos that bet against each other. Check data/learning.json and the Record tab each morning and say in one line whether to loosen or tighten.

For each sport list today's games with CT start times, find Polymarket US markets and prices, compare to no-vig sportsbook consensus plus team info (form, injuries, starters, goalies, rest, weather), and spot mispricing. Lineup sources first: Daily Faceoff, X @firedupfantasy, @gamedaygoalies, @gamedaylines, @underdogmlb, @underdognfl, @underdognba. Never make up a price or stat.

Game predictions with a track record: for every game give winner + win %, projected score, 1-2 player stat projections. Log them (data/predictions.json via scripts/update-picks.mjs add-predictions; grade finished ones with the grade command). Show the running record at the top: accuracy, calibration, yesterday's hits and misses.

Singles: 2-4 best edges ranked (market, side, price vs no-vig fair, edge, why, stake in units in private chat only). List overpriced markets to avoid.

Player props (key section): 3-6 best props ranked across NFL/MLB/NHL/NBA stat types; compare to no-vig book line, game logs, matchup, role, injury news; player + position, line + side, price vs fair, edge, 1-2 sentence reason with real stats, stake 0.5-1.5u (private chat only). Flag lineup-dependent props; list overpriced props.

Bovada prop odds: read Bovada's American odds (bovada.lv, no login, never place bets) for chosen props via a browser and ingest them per HANDOFF §27 (scripts/ingest-vegas.mjs, data/manual-odds/). Only odds actually read; else leave blank and say so.

Parlays: 1-3 parlays of 2-3 legs (mixed sports OK), built from positive-edge or fair legs, with links, combined multiple, "skip if below X", true hit chance, correlation notes. Use data/bet-log.json (author reedrice) to learn typical platform multiple cuts. Stakes 0.25-0.5u, never more than 1u.

Long shots: 1-3 plays around 4x-50x+, 1-2 units total, each with a real reason, honest hit chance, clearly labeled. Fill the Lottery Tickets section (7-10 leg combos; Polymarket US caps combos at 10) per HANDOFF step 4b.

Fade Trent: update the Fade Trent section for X @bookitwithtrent per HANDOFF.md (log new picks, grade with real results, unclear bets go through the trent-clarify issue flow). One line in the digest with his record and picks to fade.

Non-sports: 1-3 mispriced non-sports markets (resolve within ~2 weeks, real volume) with evidence, edge, resolution date, stake 0.5-1u (private only); else say none in one line.

How to place (private chat only): spell out which button to tap when a pick needs No on a market (spreads listed one way only).

Site wording rule: the dashboard is an insights tool. Nothing on the site may tell people how to bet or how much: no tap instructions, no suggested stakes, no imperative advice. Neutral info only. Follow HANDOFF.md's guard test. Tips and stakes belong only in the private chat with Reed.

Flag picks that depend on later lineup news. Pick every leg on its own merits; add a short note when a pick doubles up on or opposes one of Reed's open bets. Mention his open bets that settle today.

Update the dashboard (repo reedrice/goggins-of-gambling, https://reedrice.github.io/goggins-of-gambling/): pull, follow HANDOFF.md, write the full slate in the picks.json schema (stakes in units, never dollars), publish with `node scripts/update-picks.mjs picks <file>`, add/grade predictions, run `node scripts/fetch-markets.mjs --commit`, then `node scripts/fetch-book-odds.mjs --commit` (ODDS_API_KEY env; never print/log/commit it). Mention when another app is clearly cheaper and when credits run low. Run `node scripts/bump-version.mjs` if css/js/index.html changed. Push straight to main with descriptive commits. Never commit bankroll, dollar stakes or tokens. If a step fails, still send the digest and say what didn't update.

Send the digest to Reed in your private chat with him, dashboard link at top, short and scannable, every market linked. On a no-games day, skip sports, still update the record and dashboard, and send non-sports.

**Final step:** `node scripts/routine-gate.mjs stamp daily-slate-odds-digest <your-name>`.

## Lineup & goalie check (`lineup-goalie-check`)

- **Schedule (CT):** not set yet. Confirm with Reed.
- **Notes:** Schedule not exported yet. Confirm with Reed and fill schedule_ct.

**Step 0:** Run `node scripts/routine-gate.mjs check lineup-goalie-check <your-name>`. Stop silently on SKIP.

**Steps:**

Check for newly confirmed lineups, starting goalies, starting pitchers and injury or inactive news for today's MLB, NFL, NHL and NBA games, before they start. Use Reed's preferred sources first: Daily Faceoff (https://www.dailyfaceoff.com/teams) for NHL lines and goalies, plus X accounts @firedupfantasy, @gamedaygoalies and @gamedaylines for hockey, @underdogmlb for MLB, @underdognfl for NFL, and @underdognba for NBA (use the x tools to read their recent posts). Compare with today's picks on the dashboard (repo reedrice/goggins-of-gambling, data/picks.json, and follow HANDOFF.md). For each pick or prop affected, note it as confirmed or at risk, and add a short plain-language lineup note to that pick on the site (refresh by id, never duplicate, push to main with a descriptive commit, never commit dollar amounts or tokens). Never invent news; cite the source. Message Reed in your private chat with Reed only if something changes a pick (a starter is out, a goalie swap, or a scratched player in a prop or parlay leg), in 2 to 4 short lines with what changed and what to do (keep, skip, or swap). If nothing relevant changed, stay quiet and send nothing.

**Final step:** `node scripts/routine-gate.mjs stamp lineup-goalie-check <your-name>`.

## Late-scratch check (`late-scratch-check`)

- **Schedule (CT):** `50 17 * * *`
- **Notes:** Right after NFL inactives (~5:45 PM CT). Confirm exact cron with Reed.

**Step 0:** Run `node scripts/routine-gate.mjs check late-scratch-check <your-name>`. Stop silently on SKIP.

**Steps:**

Late-scratch check, right after NFL inactives (~5:45 PM CT). Only matters on days with games on today's picks; if none, stop silently. Follow the same method as the Lineup & Goalie Check routine and HANDOFF.md §34: check official inactives, late scratches, goalie changes and starting lineups for today's picks and parlay legs, using Reed's sources first (Daily Faceoff, @gamedaygoalies, @gamedaylines, @firedupfantasy, @underdogmlb, @underdognfl, @underdognba, plus team or insider posts). Update each affected pick's lineup note on the dashboard by id (repo reedrice/goggins-of-gambling, push to main, descriptive commit, no dollar amounts or tokens, don't touch Pablo's live-bets files). Message Reed in your private chat with Reed only if a player in a pick or leg is out or doubtful, or a starter changed, in 2 to 4 short lines with what to do (keep, skip or swap). Never invent news. If nothing changed, send nothing.

**Final step:** `node scripts/routine-gate.mjs stamp late-scratch-check <your-name>`.

## Play-money leaderboard update (`play-money-leaderboard-update`)

- **Schedule (CT):** not set yet. Confirm with Reed.
- **Notes:** Runs several times a day (one run at 12 PM also runs learn.mjs). Exact cron not exported; confirm with Reed.

**Step 0:** Run `node scripts/routine-gate.mjs check play-money-leaderboard-update <your-name>`. Stop silently on SKIP.

**Steps:**

In the reedrice/goggins-of-gambling repo (your clone), git pull, then run in order: `node scripts/capture-closing.mjs --commit` (HANDOFF §36, saves closing prices and results for pick history), `node scripts/play-leaderboard.mjs --commit` (§34, shared play-money leaderboard), and `node scripts/grade-live-alerts.mjs --commit` (§35, all-time Live Bets record). On the 12 PM run also run `node scripts/learn.mjs --commit` (§36) to refresh data/learning.json. Push to main if anything changed (pull --rebase first, never force-push, no secrets, never touch Pablo's files). Send Reed nothing unless a script fails three runs in a row; then send one short note.

**Final step:** `node scripts/routine-gate.mjs stamp play-money-leaderboard-update <your-name>`.

## Weekly learning review (`weekly-learning-review`)

- **Schedule (CT):** not set yet. Confirm with Reed.
- **Notes:** Weekly. Day/time not exported; confirm with Reed.

**Step 0:** Run `node scripts/routine-gate.mjs check weekly-learning-review <your-name>`. Stop silently on SKIP.

**Steps:**

Weekly self-learning review for Reed's betting picks. In the reedrice/goggins-of-gambling repo, git pull, run `node scripts/capture-closing.mjs --commit` and `node scripts/learn.mjs --commit` (HANDOFF §36), then read data/learning.json. Send Reed a short, plain-language note (5 to 8 lines, American odds, no cents): graded sample size, how accurate our chances were (our 60% bets hit X%), closing-line value (did prices move our way), the best and worst bet types, and what changes the digest will now apply. Say clearly if it's still "collecting data" (under 30 graded in a group). Never invent numbers.

**Final step:** `node scripts/routine-gate.mjs stamp weekly-learning-review <your-name>`.

## Live Bets feed update (`live-feed-update`, Oct 20 takeover)
This sixth routine is temporarily owned by ChatGPT at Reed's request; the five routines above stay with Grok. Read [LIVE-FEED.md](LIVE-FEED.md). Use `node scripts/live-run.mjs --owner chatgpt --no-push` then publish through the connector, or the gated runner with git push authentication. Do not run an independent direct live-tick schedule during takeover.

## Fade Trent new-post check (`trent-post-check`)
ChatGPT checks every five minutes independently of the daily Grok digest. See [FADE-TRENT.md](FADE-TRENT.md) for verified browser ingestion, coverage, publishing and access limitations.
