# Start here: bot and contributor onboarding

Last reviewed: October 24, 2026. Give new planning, design, implementation, and review bots this one file. It routes to the authoritative instructions; it does not replace them. Update this guide when essential architecture/workflow facts change.

Repository: https://github.com/reedrice/goggins-of-gambling  
Live site: https://reedrice.github.io/goggins-of-gambling/

## 1. Establish your assignment

State whether you are planning, designing, implementing, or reviewing. A planning request does not authorize implementation, deployment, infrastructure changes, or recurring jobs. Preserve unrelated edits; do not duplicate another bot's work or contact collaborators without authorization.

Separate observed behavior, historical descriptions, proposals, and approved work. If you cannot inspect code/the live site or render mockups, say so. Do not invent findings.

## 2. Read in this order

1. [AGENTS.md](AGENTS.md): operating rules, privacy, ownership, and explicit overrides. Read the entire file, including later additions.
2. [DESIGN.md](DESIGN.md), [css/README.md](css/README.md), and [css/theme.css](css/theme.css): design principles, master tokens, current responsive rules and performance exceptions.
3. The latest relevant sections of [HANDOFF.md](HANDOFF.md): recent decisions and completed work. Older sections describe history; numbering alone does not establish precedence.
4. [README.md](README.md), [STATUS.md](STATUS.md), and [ROADMAP.md](ROADMAP.md): supporting product context. Roadmap ideas are not implementation approval.
5. [routines/owners.json](routines/owners.json), [routines/ACTIONS.md](routines/ACTIONS.md), and applicable protocol/routine documents if touching data or automation.
6. The relevant source and tests in the task map below. Verify that a proposed feature does not already exist.

### Resolve historical conflicts carefully

Follow current user authorization and applicable instructions. Explicit newer project overrides supersede old descriptions. Code establishes implemented behavior, but bugs do not override privacy rules. Owner/workflow configuration establishes current routine settings. Flag material unresolved conflicts before making dependent changes.

Known dated references:
- STATUS.md retains Oct 20-era local feed/Grok ownership, Fade Trent frequency, and design to-dos; use current overrides and code.
- GEMINI.md is a short orientation: its ten-minute maintenance schedule and broad Node.js/blur descriptions need current context.
- HANDOFF's Supabase/Firebase leaderboard alternatives were considered, not selected infrastructure.
- Older universal blur, fixed-background, tab-count, card-layout, and local-scheduler descriptions must not be restored from isolated paragraphs.

## 3. Architecture: static front end, automated data preparation

Main site: plain HTML/CSS/JavaScript hosted on GitHub Pages, without a framework application server or traditional shared application database serving visitors.

Public flow: **sports/market APIs → deterministic Node.js scripts in GitHub Actions → JSON snapshots → GitHub Pages → browser presentation.**

- Sports collection uses the existing ESPN collector and data/espn/. Other public feeds, markets, and records have separate JSON paths. Preserve source timestamps, coverage and honest unknowns.
- [.github/workflows/live-maintenance.yml](.github/workflows/live-maintenance.yml) is scheduled every five minutes; queues, execution and deployment can delay delivery. A cron interval is not a freshness guarantee.
- [.github/workflows/pages.yml](.github/workflows/pages.yml) prepares/deploys static files. Shared collection, grading and some calculations run in Actions; interaction and personal calculations run in the browser. Do not claim every calculation is client-side.
- [js/public-json.js](js/public-json.js) provides shared caching, request deduplication, bounded concurrency, visibility guards and backoff. Reuse it.
- Intentional supporting services exist: [GitHub authentication Worker](workers/goggins-gh-auth.js), [health/recovery watchdog](watchdog/README.md), and [isolated personal Kalshi relay](kalshi-private-relay/README.md). Watchdog storage is operational state, not a sports/private-bets database.

**Future storage:** Reed is open to evaluating external databases/object storage. That is exploration, not migration approval. Keep visual work independent. Infrastructure proposals need evidence, costs/quotas, privacy boundaries, migration and recovery plans before implementation. Prefer free/cost-effective operation; no unlimited-free guarantees or unapproved paid services.

## 4. Product and current UX

Branding comes from [config.js](config.js); current interface branding is Men in Black, repository name goggins-of-gambling.

Preserve exactly six main sections: **Picks, Build a Bet, My Bets, Record, Fade Trent, Settings.** Live Bets is within Picks. Preserve the mobile dock, safe areas, touch targets and keyboard access. A desktop navigation rail is only a design idea, not approved work; never depend on hover alone.

Recent Live Bets essentials (verify against current code):
- Saved desktop game-line/prop-bet allocations: 4/0, 3/1, 2/2, 1/3, 0/4. Narrow screens adapt.
- One compact Layout disclosure opens five visual previews; selection saves, closes and restores focus. Do not rebuild this existing feature as a new proposal.
- Layout is below the scoreboard and above edge filters, beside conditional Polymarket holdings status. Unlinked visitors see Layout without irrelevant holdings clutter/checks.
- Hidden categories create no cards. Sparse slates retain consistent card tracks rather than stretching into unused category space.
- Lists use bounded six-item pages. Activity/history/log are on-demand where implemented. Bet log starts collapsed and releases cards on close; record totals cover all published records.
- Card/row/pagination gaps share the 12px token. Previous/Next are slightly narrower than card tracks; the count sits separately.
- Preserve sport/conference/Top 25/tier filters and scoreboard-game selection/deselection, source freshness, progress, Market/Chart and expandable Details.
- Odds are bold: inclusive -115 through +115 yellow; below -115 green; above +115 red. Never change exact outcome/line/period meaning.

## 5. Styling and browser performance

css/theme.css loads last and owns semantic canvas/text/surface/border/accent/focus/spacing/radius/typography roles. Support Aurora, other saved themes and custom palettes; do not hardcode one canvas. Generally desktop panels use 24px geometry and mobile 16px as configured. Keep readability, alignment, focus states and accessible headings.

Repeated cards/rows/pills omit expensive backdrop blur and broad shadows. Navigation/sheets retain appropriate glass. Atmosphere follows full page content and scrolls normally; do not restore fixed animated backgrounds or a 100vh clipping seam.

Preserve shared caching, bounded fan-out, unchanged-DOM reuse, lazy closed sections, pagination and near-viewport progress hydration. No new timer for visual features. Existing Live Bets checks are about 30 seconds and relevant progress checks 15 seconds; these read published snapshots, not guaranteed provider updates.

Synthetic tests cover 64 games/2048 options, 2000 progress hosts, and 12000 record entries. These are functional/load regressions, not proof of 60fps or upstream capacity. Hosting changes alone do not fix browser rendering lag.

For mockups: use actual existing structure, coherent labeled illustrative data, relevant phone/desktop/ultrawide and sparse/crowded states. Include loading/empty/stale/expanded states where relevant. Distinguish a visual blueprint from a rendered image. Do not invent metrics, filters, navigation or probability precision to fill a screen.

## 6. Accuracy, privacy and automation

- Never invent scores, player participation, odds, units, grades, probabilities or holdings. Missing is not zero; probable is not confirmed. Preserve timestamps and unavailable/stale states. Progress is not automatically win probability.
- Already holding depends on synced positions and exact market/outcome identity, not name similarity or a stored preference.
- localStorage is not inherently secure. Preferences may live there; preserve existing encrypted vaults and origin isolation. Never commit private credentials, stakes, bankrolls, or account responses.
- Kalshi private data remains on each user's isolated origin; no parent messages carrying portfolio data or shared private relay. Unlinked/locked accounts must not trigger private portfolio reads.
- Use [js/strings.js](js/strings.js), say prop bets, retain American odds/current money formatting and HTTPS links. Keep public wording neutral, not stake/bet instructions.
- Use deterministic scripts and existing Actions. No new AI routines, duplicate ingestion, paid API activation, scraping loops or sports database/ORM changes without authorization.
- The retained two-hour Fade Trent browser check is an explicit AI exception, requires device/session availability and consumes usage. Read [routines/FADE-TRENT.md](routines/FADE-TRENT.md) and its owner gate; do not expand it.
- Before touching NBA testing read [routines/NBA-PROP-TESTING.md](routines/NBA-PROP-TESTING.md). Do not tune the frozen model/protocol/helpers against results, regenerate its freeze or automatically promote experimental estimates. UI work must preserve the experiment.

## 7. Task-to-code map

| Task | Start with |
| --- | --- |
| Navigation/screens | index.html, js/app.js, config.js |
| Theme/responsive design | css/README.md, css/theme.css, DESIGN.md |
| Live Bets | js/live-bets.js, js/live-scoreboard.js, js/strings.js |
| Build a Bet | js/picker*.js, js/markets-core.js, js/calc.js |
| Scores/progress/requests | js/bet-progress.js, js/public-json.js, js/picks-scores.js |
| Accounts/privacy | js/storage.js, js/polymarket-sync.js, js/kalshi-sync.js, personal relay docs |
| Analytics/experiment | js/our-chance.js, routines/NBA-PROP-TESTING.md, relevant scripts/tests |
| Ingestion/deployment | scripts/actions-maintenance.mjs, scripts/fetch-espn-status.mjs, .github/workflows/, routines/owners.json, watchdog/README.md |

Inspect scripts before executing: some commit/push, publish, or stamp ownership. Never enable production schedules in a sandbox.

## 8. Implementation and handoff

When authorized, inspect worktree status and current source; preserve unrelated edits and newer generated feeds. Make the smallest complete change using existing services/tokens. Run proportionate tests and relevant browser checks; describe what was actually measured.

For Live Bets, relevant suites include browser-performance, saturday-performance, live-bets, progress-snapshot, public-json and holding-badge. Preserve no-instructions/no-AI and frozen-protocol guards. Record changes/validation in HANDOFF.md.

Runtime asset changes require `node scripts/bump-version.mjs` and stamp verification; documentation-only changes do not. Follow current GitOps publication rules, commit only intended files, reconcile races, never force-push or overwrite newer feeds/owners. Review publisher scope before running it. Verify the relevant public result, not just the local commit.

## Copy-paste instruction for new bots

> Read ONBOARDING.md in reedrice/goggins-of-gambling and follow its reading order. Inspect current relevant code before proposing changes. State your assigned role, current behavior and uncertainties. Separate proposals from authorization. Preserve privacy, data accuracy, performance and existing production routines. Do not implement or deploy during a planning-only assignment.
