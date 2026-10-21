# goggins-gh-auth (Cloudflare Worker)

A tiny relay for "Sign in with GitHub". GitHub's device-flow endpoints don't allow browser (CORS) calls, so the site talks to this Worker. It forwards only `/device/code` and `/oauth/access_token` (device polling + `refresh_token`) to github.com, answers only `https://reedrice.github.io`, and stores nothing.

## Deploy (Cloudflare dashboard, about 5 minutes)
1. **Client secret** (optional; sign-in works without it, and without it an expired token just asks to sign in again. Needed only to refresh expiring tokens): github.com → Settings → Developer settings → OAuth Apps → *your app* → **Generate a new client secret**. Copy it. Never commit it.
2. dash.cloudflare.com (free account) → **Workers & Pages** → **Create** → **Create Worker** → name it `goggins-gh-auth` → **Deploy**.
3. **Edit code** → delete the sample → paste all of `workers/goggins-gh-auth.js` → **Deploy**.
4. Worker → **Settings** → **Variables and Secrets** → **Add**:
   - `CLIENT_ID` (Text) = `Ov23li16KIAkVHvjd1mq`
   - `CLIENT_SECRET` (**Secret**) = the secret from step 1
   → **Deploy**.
5. Copy the Worker URL (e.g. `https://goggins-gh-auth.<you>.workers.dev`) and send it to the bot. It goes in `config.js` → `githubAuthWorker`, which makes the Settings button appear.

Check: `curl -X POST -H 'Origin: https://reedrice.github.io' <URL>/device/code` returns a `user_code`. Without that Origin header it returns 403.

## Kalshi read-only portfolio relay
Kalshi rejects browser-origin requests, so deploy workers/kalshi-readonly.mjs as a separate Cloudflare Worker named kalshi-readonly. No secrets or environment bindings are needed. Disable Worker observability/request logging for this private account relay; the code has no logs and stores nothing. It forwards only signed GET requests to a fixed Kalshi host, with a strict endpoint/query allowlist, site origin restriction, redirect refusal and timestamp validation. It never receives private keys. API key IDs/signatures and private portfolio responses pass through the user's Cloudflare account.

Deploy from Cloudflare Workers & Pages: create a Worker, replace its code with this file, deploy, then set config.js kalshiRelay to its HTTPS origin (no path). Do not set a placeholder URL or enable the form before an actual relay health check. No tokens need to be pasted into chat. Keep the existing GitHub auth worker separate. Browser users create Kalshi keys with Read all data only, no Full access/Trade/Transfers; the connector verifies scopes on each refresh and refuses unverified/broad keys.

References: https://docs.kalshi.com/getting_started/api_keys ; https://docs.kalshi.com/api-reference/api-keys/get-api-keys ; https://docs.kalshi.com/api-reference/portfolio/get-positions ; https://docs.kalshi.com/api-reference/historical/get-historical-positions ; https://docs.kalshi.com/api-reference/portfolio/get-fills .

## Superseding privacy requirement (Reed, Oct 21)
Do NOT deploy the shared Kalshi relay described above. It is superseded by ../kalshi-private-relay/README.md: each user owns their Worker and isolated panel. No Reed-hosted relay or main-origin Kalshi key entry is permitted. Main My Bets stores only a personal panel address.
