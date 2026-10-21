# Independent feed watchdog (no AI)

Cloudflare Worker + one-minute Cron Trigger, separate from GitHub's scheduler. Source is `worker.mjs`; deploy configuration is `wrangler.jsonc`. The existing `live-maintenance.yml` still performs all sports ingestion, grading and publication. This Worker only reads public JSON and requests that workflow on production main.

## Behavior

- Check live index, ESPN freshness and up to three oldest due game files every minute. More than five minutes old is stale. Final games and events outside the existing Chicago today/tomorrow window are exempt.
- Respect `live-feed-update` enabled/github-actions ownership in the public repository. Skip recovery when ownership is intentionally disabled/transferred.
- Avoid duplicating queued/running work. Request at most one recovery per outage, with a five-minute minimum dispatch gap; verified recovery clears the outage cooldown. Never cancel a run or force-push.
- Verify served JSON, rather than assuming a successful workflow means publication succeeded. Alert after ten minutes following a recovery request; an existing stuck run is allowed at most thirty minutes from first detection.
- Open one incident assigned to and mentioning reedrice. GitHub Mobile mentions/assignments use the notification settings Reed already tested. Close the incident after the public feed is verified healthy. Retry notification failures without printing API responses or secrets.
- Durable Object state contains only check times, recovery timestamps, public diagnostics and incident number. It is operational state, not a sports database or private financial data. A single object serializes overlapping cron calls.
- Public `GET /status` is read-only. There is no public endpoint to start jobs, modify configuration or run tests.

No ChatGPT, Grok, model API, account portfolio or computer availability is needed after deployment. The device does not need to stay on.

## One-time deployment

Use the owner's Cloudflare account (currently account ID 8cd637886644ecc68f44266340d196c6), Workers Free with SQLite Durable Objects supported. No paid plan is authorized. CLI authorization should use only account/user read and workers/workers_scripts write scopes, with Windows keyring storage rather than plaintext OAuth credentials.

1. `npx wrangler@4.151.3 deploy --config watchdog/wrangler.jsonc`
2. Create a GitHub **fine-grained** personal access token, resource owner `reedrice`, selected repository **only** `goggins-of-gambling`. Repository permissions: **Actions: Read and write**, **Issues: Read and write** (metadata read is automatic). No contents write or workflow editing permission. Set an expiration and renew privately before it expires.
3. In Cloudflare's `mib-feed-watchdog` Settings → Variables and Secrets, add **Secret** named `GITHUB_TOKEN`. The account holder pastes it directly; never send it in chat, source code, argv, logs or files. The token lets the watchdog dispatch the existing workflow and manage its own incident. Do not reuse a broad CLI token.
4. Confirm the `* * * * *` cron and Durable Object binding are present. Cron changes may take several minutes to propagate.
5. Verify `/status` has a current `checked_at`; verify successful recovery and incident delivery using controlled mocks first. Never deliberately stale or break production to test it. `node --test tests/independent-watchdog.test.mjs` covers the full recovery/alert/resolve cycle without external writes.

Status alone is not proof that a credential has Actions/Issues access: configure the secret and verify its least-privilege permissions before marking deployment complete. Live failure/notification end-to-end testing requires an explicitly labeled test, separate from real outage diagnosis.

## Limits and fallback

This removes the shared GitHub **schedule** failure. Dispatch and GitHub push notifications still require GitHub's API and mobile service. If that API is unavailable, status records `notification_failed` and the next cron retries. Independent email/push delivery requires a separately connected notification provider; it is not silently claimed to exist. Cloudflare's own outages/quotas can also delay checks; this is bounded recovery, not a timing SLA.

To pause: remove/disable this Worker's cron. Repository owner gate prevents recovery independently. Never reintroduce an AI monitor as a fallback. Other bots must not duplicate this watchdog or the GitHub schedules.

## Verified deployment (October 21, 2026)
Worker: https://mib-feed-watchdog.reedrice9.workers.dev/status . One-minute cron and private GitHub secret verified. A genuine stale-feed recovery dispatched run 39639780024 at 16:59:51 UTC; it passed and the Worker verified healthy public JSON at 17:03:48 UTC. Alert/resolve behavior passed native mocks; this was not a new live notification test. Renew the private fine-grained credential before November 20, 2026.

Cloudflare also paces the existing workflow every five minutes when no recent or active run exists, independently of GitHub cron. Healthy recovery clears the previous outage cooldown. Failed outages retain bounded recovery and incident deduplication. This targets start cadence, not a guarantee that collection plus Pages publication finishes within five minutes.
