/**
 * gh-auth.js — "Sign in with GitHub" via OAuth device flow through the
 * goggins-gh-auth Worker (workers/). Hidden unless APP_CONFIG.githubAuthWorker
 * is set. Saves the access token where the pasted token lives (Storage), keeps
 * the refresh token + expiry locally, refreshes before expiry. No secrets here.
 */
(function () {
  const C = window.APP_CONFIG || {}, K = 'betdash_gh_oauth';
  const enabled = () => !!(C.githubAuthWorker && C.githubClientId);
  const post = (path, body) => fetch(C.githubAuthWorker.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const meta = () => { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { return null; } };
  function save(j) {
    if (!j || !j.access_token) return false;
    window.Store.setToken(j.access_token);
    localStorage.setItem(K, JSON.stringify({ refresh: j.refresh_token || '', exp: j.expires_in ? Date.now() + j.expires_in * 1000 : 0, rexp: j.refresh_token_expires_in ? Date.now() + j.refresh_token_expires_in * 1000 : 0 }));
    try { sessionStorage.removeItem('betdash_isDev'); } catch (e) { /* ignore */ }
    return true;
  }
  /** Start: returns { user_code, verification_uri, done: Promise<boolean> }. */
  async function start() {
    const d = await post('/device/code', { scope: 'read:user' });
    if (!d || !d.device_code) throw new Error('GitHub sign-in is unavailable right now.');
    let wait = (d.interval || 5) * 1000; const until = Date.now() + (d.expires_in || 900) * 1000;
    const done = (async () => {
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, wait));
        const t = await post('/oauth/access_token', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code }).catch(() => ({}));
        if (t.access_token) return save(t);
        if (t.error === 'slow_down') wait += 5000; else if (t.error && t.error !== 'authorization_pending') return false;
      }
      return false;
    })();
    return { user_code: d.user_code, verification_uri: d.verification_uri, done };
  }
  /** Refresh the token if it expires within 10 minutes. */
  async function ensureFresh() {
    const m = meta(); if (!enabled() || !m || !m.refresh || !m.exp || m.exp - Date.now() > 6e5) return;
    if (m.rexp && m.rexp < Date.now()) { localStorage.removeItem(K); if (m.exp < Date.now()) window.Store.setToken(''); return; }
    const t = await post('/oauth/access_token', { grant_type: 'refresh_token', refresh_token: m.refresh }).catch(() => null);
    if (!save(t) && m.exp < Date.now()) { localStorage.removeItem(K); window.Store.setToken(''); }   // refresh failed and token expired: sign in again
  }
  const signOut = () => localStorage.removeItem(K);
  window.GhAuth = { enabled, start, ensureFresh, signOut };
})();
