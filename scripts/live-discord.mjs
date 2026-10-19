#!/usr/bin/env node
/**
 * live-discord.mjs — push the most important Live Bets alerts to Discord.
 *
 * WHAT: reads data/live/<slug>.json (written by `live-watch.mjs publish`) and
 * posts ONLY new alerts that are
 *   - type 'new_edge' with tier 'big', or
 *   - type 'news' ("big move, likely news")
 * and that are within the +500 / -500 odds limit (live-watch ODDS_LIMIT).
 * Each alert posts once: posted ids are kept in a LOCAL state file outside
 * the repo (default /workspace/live/discord-posted.json). Alerts older than
 * MAX_AGE_MIN minutes are skipped (marked posted) so a restart doesn't dump
 * a backlog.
 *
 * USAGE  node scripts/live-discord.mjs [--slug nfl-was-sf-2026-10-19] [--state <file>]
 *
 * SECRET: the webhook URL comes ONLY from env DISCORD_WEBHOOK_URL. It is never
 * printed, logged or written anywhere, and it's scrubbed from error text. If
 * the env var is missing, the script exits 0 quietly.
 *
 * DISCORD: plain short messages, allowed_mentions parse [] (no @everyone, no
 * pings), at most MAX_PER_RUN posts per run, about 1 s apart, and a 429 is
 * retried once after Discord's retry_after.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withinOddsLimit } from './live-watch.mjs';

export const MAX_PER_RUN = 5;          // keeps a burst well under Discord's webhook limits
export const MAX_AGE_MIN = 30;         // don't post stale alerts
const GAP_MS = 1100;

/** Which alerts are worth a push (pure). */
export const shouldPost = a => !!a && ((a.type === 'new_edge' && a.tier === 'big') || a.type === 'news')
  && a.now_chance != null && withinOddsLimit(a.now_chance);

/** Whole dollars a $10 bet returns at chance p, rounded down (no cents). */
export const pays10 = p => (p > 0 && p < 100 ? Math.floor(1000 / p) : null);

/** Only allow https links. */
const safeUrl = u => { try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; } };

/** Score + clock line from the data file's ESPN context (or the edge's context line). */
export function contextFor(data, a) {
  const e = (data.edges || []).find(x => x.key === a.key);
  if (e && e.context) return e.context;
  const c = data.game_context || {};
  if (!c.available) return 'Game info unavailable';
  if (c.game_state === 'pre') return 'Pregame';
  const sc = c.away?.score == null ? '' : `${c.away.abbr} ${c.away.score}, ${c.home.abbr} ${c.home.score}`;
  return [sc, c.game_state === 'post' ? 'Final' : `Q${c.period} ${c.clock || ''}`.trim()].filter(Boolean).join(', ');
}

/** Short message text (pure). No mentions; Discord also gets allowed_mentions: none. */
export function formatMessage(data, a) {
  const head = a.type === 'news' ? '📰 Big move, likely news' : '🟢 Big edge';
  const pay = pays10(a.now_chance);
  const lines = [
    `**${head}: ${a.side}**`,
    `${a.market} · ${a.now_odds}${pay ? ` · $10 pays $${pay}` : ''} · ${Math.round(a.edge)} pts cheaper than open`,
    contextFor(data, a),
  ];
  const link = safeUrl(a.url || data.url);
  if (link) lines.push(`<${link}>`);       // <> = no big link preview
  return lines.join('\n').replace(/@(everyone|here)/g, '@\u200b$1').slice(0, 1900);
}

/** Remove the webhook (or anything that looks like one) from text before it's shown. */
export function scrub(text, secret) {
  let t = String(text || '');
  if (secret) t = t.split(secret).join('[webhook]');
  return t.replace(/https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, '[webhook]');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Post new alerts. Pure-ish: everything external is passed in so tests can
 * mock it. Returns { posted: [ids], skipped: n, errors: [scrubbed messages] }.
 */
export async function run({ data, state, webhook, fetchImpl = fetch, now = Date.now(), wait = sleep }) {
  const done = new Set(state.posted || []);
  const out = { posted: [], skipped: 0, errors: [] };
  if (!webhook) return out;
  const todo = (data.alerts || []).filter(a => a.id && !done.has(a.id) && shouldPost(a)).reverse(); // oldest first
  for (const a of todo) {
    if (now - Date.parse(a.at) > MAX_AGE_MIN * 60e3) { done.add(a.id); out.skipped++; continue; }
    if (out.posted.length >= MAX_PER_RUN) break;               // rest go next run
    const body = JSON.stringify({ content: formatMessage(data, a), allowed_mentions: { parse: [] } });
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetchImpl(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (r.status === 429 && attempt === 0) {
          let ra = 2; try { ra = Number((await r.json()).retry_after) || 2; } catch { /* default */ }
          await wait(Math.min(ra, 30) * 1000); continue;
        }
        if (!r.ok) throw new Error(`Discord returned ${r.status}`);
        done.add(a.id); out.posted.push(a.id);
        break;
      }
    } catch (e) { out.errors.push(scrub(e && e.message, webhook)); }
    await wait(GAP_MS);
  }
  state.posted = [...done].slice(-500);
  return out;
}

// ------------------------------------------------------------ CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const SLUG = opt('slug', 'nfl-was-sf-2026-10-19');
  const STATE = opt('state', '/workspace/live/discord-posted.json');
  const DATA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'live', `${SLUG}.json`);
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  (async () => {
    if (!webhook) return;                                        // not configured: skip quietly
    if (!fs.existsSync(DATA)) return;
    const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { posted: [] };
    const r = await run({ data, state, webhook });
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state));
    if (r.posted.length || r.errors.length) console.log(`discord: posted ${r.posted.length}${r.errors.length ? `, errors: ${r.errors.join('; ')}` : ''}`);
  })().catch(e => { console.error('live-discord error:', scrub(e && e.message, webhook)); process.exit(0); });
}
