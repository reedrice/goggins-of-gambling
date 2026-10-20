/**
 * js/github-log.js — writes the shared, dollar-free calibration log to the repo.
 *
 * PURPOSE
 *   When a user saves or settles a bet with "share this bet's numbers" on, we
 *   append/update one record in data/bet-log.json via the GitHub REST
 *   "contents" API, authenticated with the user's OWN fine-grained token
 *   (stored only in their localStorage). Exposed as window.GitHubLog.
 *
 * WHO CAN WRITE
 *   GitHub only accepts the PUT if the token's owner has write access to the
 *   repo (i.e. Reed or a collaborator he added). Public visitors can read the
 *   site and the log but cannot change it.
 *
 * PRIVACY
 *   buildRecord() is the ONLY place a shared record is built, and it copies an
 *   explicit allow-list of fields. Stake, payout, bankroll and profile data are
 *   never included, so dollar amounts cannot reach the repo by accident.
 *
 * SHA / CONFLICT FLOW (contents API is optimistic-concurrency)
 *   1. GET  /repos/{o}/{r}/contents/{path}?ref={branch}
 *        -> { content: base64, sha }        (404 => file doesn't exist yet)
 *   2. Decode, parse, upsert our record by id in memory.
 *   3. PUT  /repos/{o}/{r}/contents/{path}
 *        body { message, content: base64(newJSON), sha, branch }
 *      If someone else committed between 1 and 3, the sha is stale and GitHub
 *      answers 409 Conflict (sometimes 422). We then re-GET (fresh sha + fresh
 *      records, so we never clobber their entry) and retry, up to MAX_TRIES
 *      with a small backoff.
 */
(function () {
  'use strict';

  const API = 'https://api.github.com';
  const MAX_TRIES = 4;

  /**
   * UTF-8 safe base64 encode (btoa alone breaks on non-Latin1 like "−" or "¢").
   * @param {string} str
   * @returns {string} base64
   */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /**
   * UTF-8 safe base64 decode. GitHub wraps content at 60 chars with "\n".
   * @param {string} b64
   * @returns {string}
   */
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /**
   * fetch() wrapper adding auth + API headers.
   * @param {string} path API path beginning with "/"
   * @param {string} token fine-grained PAT
   * @param {RequestInit} [opts]
   * @returns {Promise<Response>}
   */
  function gh(path, token, opts = {}) {
    return fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts.headers || {})
    }));
  }

  /**
   * Resolve the token owner's login (GET /user). Used as `author` on records.
   * @param {string} token
   * @returns {Promise<string>} login
   * @throws {Error} on invalid token
   */
  async function whoAmI(token) {
    const r = await gh('/user', token);
    if (!r.ok) throw new Error('Token rejected by GitHub (' + r.status + ').');
    return (await r.json()).login;
  }

  /**
   * Verify the token can write the log file's repo (checks repo permissions).
   * Fine-grained tokens report permissions on GET /repos; we treat missing
   * info as "unknown" rather than failing hard.
   * @param {string} token
   * @returns {Promise<{login:string, canPush:boolean|null}>}
   */
  async function checkToken(token) {
    const c = window.APP_CONFIG;
    const login = await whoAmI(token);
    const r = await gh(`/repos/${c.repoOwner}/${c.repoName}`, token);
    if (!r.ok) return { login, canPush: false };
    const repo = await r.json();
    return { login, canPush: repo.permissions ? !!repo.permissions.push : null };
  }

  /**
   * Build the shareable record for a bet. ALLOW-LIST ONLY — no dollars.
   * @param {object} bet private Bet from Store (see storage.js schema)
   * @param {string} author GitHub login
   * @returns {object} {id, timestamp, author, platform, category, legs[{desc,price,start_time?}],
   *                    estimated_multiple, quoted_multiple, gap, result}
   */
  function buildRecord(bet, author) {
    const est = round(bet.estMultiple, 4);
    const quoted = round(bet.quotedMultiple, 4);
    return {
      id: bet.id,
      timestamp: bet.settledAt || bet.createdAt,
      author,
      platform: bet.platform,
      category: bet.category,
      // start_time: the game's start (ISO, UTC) when known, so the log can
      // be read in game order. Only a strict ISO string is copied; no other
      // leg field (and never the stake) leaves the device.
      legs: (bet.legs || []).map(l => {
        const o = { desc: String(l.desc || ''), price: String(l.price || '') };
        if (typeof l.startTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(l.startTime)) o.start_time = l.startTime;
        return o;
      }),
      estimated_multiple: est,
      quoted_multiple: quoted,
      gap: est && quoted ? round(quoted / est - 1, 4) : null,
      result: bet.status === 'open' ? 'pending' : bet.status
    };
  }

  /** @param {number} x @param {number} d decimals @returns {number|null} */
  function round(x, d) { return typeof x === 'number' && isFinite(x) ? +x.toFixed(d) : null; }

  /**
   * GET the log file. Returns empty log if it doesn't exist yet.
   * @param {string} token
   * @returns {Promise<{log:object, sha:string|null}>}
   */
  async function fetchLog(token) {
    const c = window.APP_CONFIG;
    const r = await gh(`/repos/${c.repoOwner}/${c.repoName}/contents/${c.betLogPath}?ref=${c.repoBranch}`, token, { cache: 'no-store' });
    if (r.status === 404) return { log: { schema_version: 1, records: [] }, sha: null };
    if (!r.ok) throw new Error('Could not read shared log (' + r.status + ').');
    const j = await r.json();
    let log;
    try { log = JSON.parse(b64decode(j.content)); } catch (e) { throw new Error('Shared log is not valid JSON.'); }
    if (!Array.isArray(log.records)) log.records = [];
    return { log, sha: j.sha };
  }

  /**
   * Upsert one record into data/bet-log.json with sha-conflict retries.
   * Side effect: creates a commit on the configured branch.
   * @param {object} record from buildRecord()
   * @param {string} token
   * @returns {Promise<void>}
   * @throws {Error} after MAX_TRIES conflicts or on auth/permission errors
   */
  async function upsertRecord(record, token) {
    const c = window.APP_CONFIG;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const { log, sha } = await fetchLog(token);           // step 1: fresh sha
      const i = log.records.findIndex(x => x.id === record.id); // step 2: upsert
      if (i >= 0) log.records[i] = record; else log.records.push(record);
      log.updated_at = new Date().toISOString();
      const body = {
        message: `bet-log: ${i >= 0 ? 'update' : 'add'} ${record.id} (${record.result}) by ${record.author}\n\n` +
                 `${record.platform}, ${record.legs.length} leg(s), est ${record.estimated_multiple}x, quoted ${record.quoted_multiple}x.\n` +
                 'Written by the dashboard calibration log. Contains no dollar amounts.',
        content: b64encode(JSON.stringify(log, null, 2) + '\n'),
        branch: c.repoBranch
      };
      if (sha) body.sha = sha;
      const r = await gh(`/repos/${c.repoOwner}/${c.repoName}/contents/${c.betLogPath}`, token, {
        method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
      });
      if (r.ok) return;                                        // step 3: committed
      if ((r.status === 409 || r.status === 422) && attempt < MAX_TRIES) {
        await new Promise(res => setTimeout(res, 400 * attempt + Math.random() * 300)); // stale sha: retry
        continue;
      }
      if (r.status === 403 || r.status === 404) throw new Error('Token lacks contents:write on this repo (' + r.status + ').');
      throw new Error('GitHub rejected the log update (' + r.status + ').');
    }
    throw new Error('Shared log kept conflicting; try again.');
  }

  /**
   * Dev gate (HANDOFF §60): true only when the user's own GitHub token belongs to a
   * collaborator of the repo (GET /repos/{o}/{r}/collaborators/{login} -> 204).
   * Cached per tab (sessionStorage). No token -> false. Nothing is ever sent anywhere else.
   */
  async function isDev(token) {
    if (!token) return false;
    try { const c = sessionStorage.getItem('betdash_isDev'); if (c) return c === '1'; } catch (e) { /* storage blocked */ }
    let ok = false;
    try {
      const login = await whoAmI(token), cfg = window.APP_CONFIG;
      const r = await gh(`/repos/${cfg.repoOwner}/${cfg.repoName}/collaborators/${encodeURIComponent(login)}`, token);
      ok = r.status === 204;
    } catch (e) { ok = false; }
    try { sessionStorage.setItem('betdash_isDev', ok ? '1' : '0'); } catch (e) { /* ignore */ }
    return ok;
  }

  window.GitHubLog = { isDev, whoAmI, checkToken, buildRecord, fetchLog, upsertRecord, _b64encode: b64encode, _b64decode: b64decode };
})();
