/**
 * goggins-gh-auth — Cloudflare Worker. A CORS relay for GitHub's OAuth device flow.
 * Forwards ONLY:  POST /device/code         -> https://github.com/login/device/code
 *                 POST /oauth/access_token  -> https://github.com/login/oauth/access_token
 * (device-code polling and refresh_token grants). Stores nothing, logs nothing.
 * CORS: only https://reedrice.github.io. Env: CLIENT_ID (public), CLIENT_SECRET
 * (secret, used ONLY for grant_type=refresh_token, which GitHub requires it for).
 */
const ORIGIN = 'https://reedrice.github.io';
const ROUTES = { '/device/code': 'https://github.com/login/device/code', '/oauth/access_token': 'https://github.com/login/oauth/access_token' };
const GRANTS = new Set(['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token']);
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/login(?=\/)/, ''), target = ROUTES[path];   // /login/... accepted too
    if (req.headers.get('Origin') !== ORIGIN) return new Response('Forbidden', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !target) return json({ error: 'not_found' }, 404);
    let inb = {};
    try { inb = /json/.test(req.headers.get('Content-Type') || '') ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text())); } catch (e) { return json({ error: 'bad_request' }, 400); }
    const out = new URLSearchParams({ client_id: env.CLIENT_ID });
    if (path === '/device/code') {
      if (inb.scope) out.set('scope', String(inb.scope).slice(0, 200));
    } else {
      if (!GRANTS.has(inb.grant_type)) return json({ error: 'unsupported_grant_type' }, 400);
      out.set('grant_type', inb.grant_type);
      if (inb.grant_type === 'refresh_token') {
        if (!env.CLIENT_SECRET) return json({ error: 'refresh_unavailable' }, 400);   // no secret yet: the site signs in again
        if (!inb.refresh_token) return json({ error: 'bad_request' }, 400);
        out.set('refresh_token', inb.refresh_token); out.set('client_secret', env.CLIENT_SECRET);
      } else {
        if (!inb.device_code) return json({ error: 'bad_request' }, 400);
        out.set('device_code', inb.device_code);
      }
    }
    const r = await fetch(target, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'goggins-gh-auth' }, body: out });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};
