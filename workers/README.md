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
