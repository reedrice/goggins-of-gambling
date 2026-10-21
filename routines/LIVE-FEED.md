# Live feed: temporary ChatGPT takeover (Oct 20, 2026)

Reed explicitly authorized ChatGPT/Codex to maintain Pablo's live feed and Live Bets files while Pablo is usage-limited, provided changes are documented for all bots.

## Owner and scheduler

- `routines/owners.json` -> `live-feed-update`: `chatgpt`.
- Codex thread heartbeat `keep-live-bets-feed-updating`, every 10 minutes, all day (covers early games and late finishes, DST independent).
- Local checkout: `C:/Users/zeonh/Documents/Codex/2026-10-20/how-x20/work/goggins-of-gambling`.
- This is a local Codex schedule, not a GitHub Actions job. Codex and this computer must be available; missed wakeups are not guaranteed to replay. Check timestamps rather than assuming a scheduled pass ran.
- The GitHub connector is authenticated as reedrice. Reed reauthorized local GitHub CLI access. Connector writes return 403 and Windows Git Bash credential helpers are blocked. Use the authenticated API publisher below; never copy tokens into the repository.
- The other five routines remain assigned to Grok. Discord has not been transferred or tested and is not sent by this heartbeat.

## One pass

1. Start from latest main. Read `AGENTS.md` and the owner switch.
2. Run `node scripts/live-run.mjs --owner chatgpt --no-push`.
3. A nonzero exit means failure, even if some files updated. Inspect failures and freshness; a local stamp is not proof of remote publication.
4. Run `node scripts/publish-live-api.mjs` to publish prepared changes atomically through authenticated gh API calls. In ordinary refreshes only data/live and routines/owners.json change. The publisher checks latest main and refuses non-fast-forward updates. If raced, refresh from the newest main and regenerate data, preserving the other writer's latest openings/history. Never force-push or blindly retry stale JSON.
5. Verify repository timestamps and the public Pages `data/live/index.json` after the build. Data-only refreshes do not need version bumps.
6. Stay quiet on ordinary successful passes. Notify Reed for meaningful failure, stale feed or required action.

## What changed

- `live-watch.mjs` uses `fileURLToPath` for Windows-safe paths and repository-local `.cache/live` for scratch snapshots instead of `/workspace/live`. Existing published opening prices remain the fallback and are preserved.
- `live-tick.mjs` reports discovery, publication and push failures as nonzero instead of silently succeeding. Other games are still attempted after a single game fails; Kalshi annotations remain optional.
- `live-run.mjs` checks the owner before updating. Its default owner is still `pablo`, so old `node scripts/live-run.mjs` schedules skip during takeover. `--no-push` prepares data and a success stamp for connector publication; it sends no Discord messages.
- View styling and pricing/classification rules were not changed.
- Verified a real tick on Windows and existing live-watch, live-context, live-kalshi, routine-gate, calc and github-log checks plus picks validation.

## Pablo / other bots

Do not start another feed writer during this takeover. Old direct `live-tick.mjs --push` or `live-watch.mjs publish` commands bypass the wrapper gate: pause them, or use the gated `live-run.mjs` entry point. We cannot disable a scheduler on Pablo's computer from this chat. On return, coordinate with Reed, change `live-feed-update` owner to `pablo`, pause this Codex heartbeat, and use `node scripts/live-run.mjs --owner pablo`. Read the latest HANDOFF and preserve all existing opening prices and alert/history state.

## Full daily slate (Oct 20 follow-up)

Default ticks now capture all supported two-team games scheduled today in America/Chicago, including late games after UTC midnight, plus unfinished games from the last 24 hours. Explicit --lead N retains a narrower window. Discovery requires exactly two event teams, excluding leader/futures markets. The old NBA points-leader file is preserved with is_game:false and excluded from the index. Initial captures establish real opening prices; edges require later price movement. Existing chatgpt-owned ten-minute heartbeat refreshes the full slate. No UI change or version bump. Opening prices/history are preserved. Tests cover late games, next-day exclusion, DST and synthetic markets.

## Today and tomorrow, expanded sports (Oct 21)
Default discovery now includes today and tomorrow in America/Chicago plus unfinished games started within 24 hours. Pro leagues, college football/basketball, configured soccer leagues and ATP/WTA singles/doubles are supported. Tennis match/set winners, game/set spreads and totals retain distinct segments; soccer uses full-time markets. Golf tournament futures and minor tennis tours are not represented as two-team games. Unsupported/missing live context remains unverified, not invented. Initial snapshots establish baselines; only later qualifying movement produces edges. Four bounded per-event workers keep the wider slate within the existing ten-minute schedule; no second scheduler. Existing openings/history and pregame alert suppression remain intact.
