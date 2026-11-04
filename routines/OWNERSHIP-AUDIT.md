# Production ownership audit — November 4, 2026

Scope: this repository and its site-specific schedules only. Older handoff paragraphs describe past ownership. Owner settings alone do not prove successful publication.

| Work | Actual executor / trigger | Published evidence at audit start (UTC) | AI usage |
|---|---|---|---|
| Feed, ESPN, grading, feedback, experimental ledger | Actions live-maintenance.yml; five-minute cron or bounded dispatch of the same serialized workflow | Nov 4 09:31:30Z feed stamp; run 41806998809 succeeded; 41808827243 failed at push | None |
| Daily slate | scheduled-routines.mjs inside maintenance, latest five-minute Chicago slot | Nov 4 09:34:20Z | None |
| Lineup/goalie | Same runner; noon and 4 PM Chicago | Nov 3 22:07:34Z | None |
| Late scratches | Same runner; 5:50 PM Chicago | Nov 3 23:57:54Z | None |
| Points leaderboard | Same runner; noon, 3 PM, hourly 5–11 PM Chicago | Nov 4 05:08:35Z | None |
| Weekly measured report | Same runner; Sunday 10 AM Chicago | Nov 1 16:08:40Z | None |
| Static deployment | pages.yml on ordinary main pushes; maintenance deploys its own artifact | Both November 4 terminology releases deployed successfully | None |
| Public health/recovery | site-health.yml, offset five-minute cron and workflow-completion triggers | Executing and reporting stale public snapshots | None |
| Independent health/cadence | Deployed Cloudflare mib-feed-watchdog, one-minute cron | Live status checked Nov 4 10:28:48Z; recovery configured; needs_attention | None |
| Alert delivery / notification test | watchdog-alert.yml / notification-test.yml, dispatch only | Enabled, not periodic ingestion | None |
| Trent source review | Codex update-fade-trent-from-new-posts, two-hour interval | ACTIVE locally; chatgpt-owned; last published check Oct 28 21:26:54Z. Later checks hit workspace access failures | Codex |

All six data routines are enabled and github-actions-owned in owners.json. Delayed runs evaluate the latest due slot; this is not proof that every nominal slot executed. Recent 20 maintenance starts were mostly workflow_dispatch plus one cron start, approximately 9–14 minutes apart despite the five-minute target. Queueing, checkout, collection and deployment contribute to latency.

## Duplicates and uncertainty

- Verified locally: keep-live-bets-feed-updating is PAUSED. Its old ten-minute rule is inert; keep it paused.
- User-supplied Grok report: five former site schedules still wake, pull, gate-check and skip. These are redundant AI wakeups, not current production writers. Disable only those five site schedules in that account and obtain confirmation. Shutdown has not been independently verified.
- Pablo/Richie external schedules or unpublished work remain unverified. Historical authorship is not proof of a running scheduler. No other account/project was inspected and no message was sent.
- GitHub cron, health recovery and Cloudflare assistance intentionally target one serialized workflow with active-run checks/cooldowns. They are not independent feed writers. Two Pages paths cover ordinary code pushes versus built-in-token maintenance commits.
- Browser refresh timers read published snapshots; they are not ingestion or AI jobs. Personal account readers remain separate and read-only.

## Publication repair

The old publisher discarded actual push stderr and stopped immediately when main had not advanced. The original transport/policy cause is therefore unknown. The repair retains redacted Git diagnostics, retries the same commit once for temporary server/transport errors, recognizes an already-accepted push after a lost acknowledgement, and regenerates on a genuine main race. Permission and file-size failures remain visible. Never force-push.

Maintenance requires the current main snapshot and its own newly created commit parent, not full generated-data history. A shallow checkout avoids repeatedly downloading roughly 2.8 GB of repository history. Reset/regeneration stays confined to the disposable Actions checkout.

Verify completed maintenance, owner stamps and actual served live/ESPN/picks JSON after Pages propagation. Code-only deployment does not freshen old snapshots. Recovery evidence is recorded in HANDOFF.md. No new AI scheduler is needed.

Evidence: [failed publication](https://github.com/reedrice/goggins-of-gambling/actions/runs/41808827243), [initial recovery](https://github.com/reedrice/goggins-of-gambling/actions/runs/41814464627), [public watchdog](https://mib-feed-watchdog.reedrice9.workers.dev/status).

## Verified recovery and freshness follow-up

Run 41815074281 successfully published generated commit df0874ba8825ff7d02e6766a761d2114263cec78 and deployed Pages at 10:42:32Z. Shallow checkout took 16 seconds. Public verification exposed a separate timing issue: early captures aged beyond five minutes while slower ledger/record/slate work ran. Added one conditional pre-publication refresh of the existing ESPN status and live-market fetchers when captures exceed four minutes. Status-only mode skips duplicate historical/model-history work; it retains the existing four-worker and 32-summary request bounds. No timestamp-only freshness claims or new scheduler. The extra source pass is bounded to once per maintenance attempt and runs only after slow work. Publication, source, health and watchdog checks: 32 tests passed. Final public health evidence follows in HANDOFF.md.

## Final public verification

Final verification: run 41816406654 succeeded, published generated commit 7e8099fd79a26da8de68d6562cdbf3e9d4136257, and deployed Pages at 2026-11-04T10:55:12Z. Public ESPN index: 48 snapshots, captured 10:53:42Z; served market files captured through 10:54:26Z; published slate date Nov 4. Independent watchdog at 10:55:47Z reported healthy with no problems. Publication/source/health suite: 32 passed; expanded source/progress/performance suite: 36 passed. Original failed push cause cannot be reconstructed because the former runner discarded stderr. Publication is restored, diagnostics/retries are repaired, and real final source capture resolves the observed post-processing staleness; the five-minute target remains best-effort, not a timing guarantee.

[Verified recovery run](https://github.com/reedrice/goggins-of-gambling/actions/runs/41816406654). Grok duplicate schedules still require account-side pause confirmation; no unrelated project or schedule was inspected or changed.
