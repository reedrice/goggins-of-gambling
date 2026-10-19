#!/usr/bin/env node
/**
 * scripts/fetch-markets.mjs — daily snapshot of Polymarket US games + Kalshi matches.
 *
 * PURPOSE
 *   Builds the data the calculator's market picker browses and searches:
 *     data/markets/index.json            small list of upcoming games (lazy-load root)
 *     data/markets/events/<slug>.json    every open market for one game
 *   and enriches data/picks.json with polymarket_url / kalshi_url per pick.
 *
 *   Why a snapshot at all? The browser CAN call gateway.polymarket.us directly
 *   (it sends `Access-Control-Allow-Origin: *`), and the app does so to refresh
 *   one game or one slip leg live. But listing every upcoming game needs ~1,800
 *   events / tens of MB of JSON, far too much for a phone, and Kalshi's API
 *   sends no CORS headers, so Kalshi matching can only happen here.
 *
 * USAGE
 *   node scripts/fetch-markets.mjs [--days 4] [--no-kalshi] [--commit] [--no-push]
 *     --days N    today (America/Chicago) + N-1 following days (default 4)
 *     --commit    git add/commit the data files with a descriptive message, then push
 *     --no-push   with --commit: commit only
 *
 * SOURCES (public, no API key)
 *   Polymarket US  https://gateway.polymarket.us/v1/events?…  and /v1/events/slug/{slug}
 *   Kalshi         https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=…
 *                  https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=…
 *
 * KALSHI MATCHING (best effort; unmatched simply falls back in the UI)
 *   1. Event: list open events of the sport's game series (e.g. KXNFLGAME). An
 *      event ticker looks like KXNFLGAME-26OCT19WASSF = series-YYMMMDD+AWAY+HOME
 *      (MLB inserts the start time: KXMLBGAME-26OCT192008CLETB).
 *      Match a Polymarket game when the date is within ±1 day and the team
 *      string equals both teams' codes (any alias, either order); otherwise fall
 *      back to both team names appearing in the Kalshi event title.
 *   2. Markets: the same suffix is shared by sibling series
 *      (KXNFLSPREAD-26OCT19WASSF, KXNFLTOTAL-…, KXNFLPASSINT-…). For each:
 *        moneyline  Kalshi market per team (ticker ends in the team code)
 *        spread     "TEAM wins by over L": team = the side laying the points,
 *                   floor_strike = L. Kalshi YES = the minus side.
 *        total      floor_strike = line, Kalshi YES = Over
 *        props      player full name (title before ":") + floor_strike = line - 0.5
 *                   ("2+" on Polymarket == "over 1.5" on Kalshi)
 *      Stored as market.kalshi = {ticker, yes, no}: prices in cents, ORIENTED TO
 *      THE POLYMARKET SIDES (yes = same outcome as side_yes_label).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Core = require(path.join(ROOT, 'js/markets-core.js'));
const OUT_DIR = path.join(ROOT, 'data/markets');
const EV_DIR = path.join(OUT_DIR, 'events');
const PICKS = path.join(ROOT, 'data/picks.json');
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';

/**
 * Kalshi series per Polymarket league. `props` maps a Polymarket
 * sportsMarketType to the Kalshi series carrying the same player stat.
 * Extend this table when new prop series appear; unknown types just get no
 * Kalshi match.
 */
const KALSHI_SERIES = {
  nfl: { game: 'KXNFLGAME', spread: 'KXNFLSPREAD', total: 'KXNFLTOTAL',
    props: { football_player_interceptions_thrown: 'KXNFLPASSINT', football_player_receptions: 'KXNFLREC', football_player_touchdowns: 'KXNFLANYTD' } },
  mlb: { game: 'KXMLBGAME', spread: 'KXMLBSPREAD', total: 'KXMLBTOTAL',
    props: { baseball_player_hits: 'KXMLBHIT', baseball_player_home_runs: 'KXMLBHR', baseball_player_strikeouts: 'KXMLBKS', baseball_player_total_bases: 'KXMLBTB' } },
  nhl: { game: 'KXNHLGAME', spread: 'KXNHLSPREAD', total: 'KXNHLTOTAL',
    props: { hockey_player_goals: 'KXNHLGOAL', hockey_player_points: 'KXNHLPTS', hockey_player_assists: 'KXNHLAST' } },
  nba: { game: 'KXNBAGAME', spread: 'KXNBASPREAD', total: 'KXNBATOTAL',
    props: { basketball_player_points: 'KXNBAPTS', basketball_player_rebounds: 'KXNBAREB', basketball_player_assists: 'KXNBAAST', basketball_player_threes: 'KXNBA3PT', basketball_player_three_pointers_made: 'KXNBA3PT' } },
  wnba: { game: 'KXWNBAGAME', spread: 'KXWNBASPREAD', total: 'KXWNBATOTAL',
    props: { basketball_player_points: 'KXWNBAPTS', basketball_player_rebounds: 'KXWNBAREB', basketball_player_assists: 'KXWNBAAST' } },
  epl: { game: 'KXEPLGAME' }, ucl: { game: 'KXUCLGAME' }, uel: { game: 'KXUELGAME' }, uecl: { game: 'KXUECLGAME' },
  lal: { game: 'KXLALIGAGAME' }, sea: { game: 'KXSERIEAGAME' }, mls: { game: 'KXMLSGAME' }, lmx: { game: 'KXLIGAMXGAME' },
  bun: { game: 'KXBUNDESLIGAGAME' }, bl1: { game: 'KXBUNDESLIGAGAME' }, fl1: { game: 'KXLIGUE1GAME' }, lig1: { game: 'KXLIGUE1GAME' },
  eflch: { game: 'KXEFLCHAMPIONSHIPGAME' }
};

/** Polymarket abbreviation -> extra codes Kalshi may use for the same team. */
const KALSHI_ALIASES = { was: ['WSH'], wsh: ['WAS'], jac: ['JAX'], jax: ['JAC'], la: ['LAK', 'LAR'], sj: ['SJS'], sjs: ['SJ'],
  tb: ['TBL', 'TBR'], nj: ['NJD'], uta: ['UTA', 'UTAH'], utah: ['UTA'], mon: ['MTL'], mtl: ['MON'], pho: ['PHX'], phx: ['PHO'],
  ny: ['NYK'], gs: ['GSW'], no: ['NOP', 'NOR'], sa: ['SAS'], chw: ['CWS'], cws: ['CHW'], az: ['ARI'], ari: ['AZ'], ath: ['OAK', 'ATH'],
  kc: ['KCR', 'KC'], sd: ['SDP', 'SD'], sf: ['SFG', 'SF'], lv: ['VGK', 'LV'] };

// ------------------------------------------------------------------ args/util

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const DAYS = Math.max(1, parseInt(args[args.indexOf('--days') + 1], 10) || 4);

/** Sleep helper. @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * GET JSON with retries (429/5xx back off exponentially).
 * @param {string} url @param {number} [tries] @returns {Promise<object>}
 */
async function getJSON(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (i >= tries || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status} ${url}`);
    } catch (e) { if (i >= tries) throw e; }
    await sleep(500 * 2 ** i);
  }
}

/**
 * Run async fn over items with limited concurrency.
 * @template T,R @param {T[]} items @param {number} n @param {(t:T)=>Promise<R>} fn @returns {Promise<R[]>}
 */
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/** @param {string} d YYYY-MM-DD @param {number} n @returns {string} date + n days */
function addDays(d, n) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ------------------------------------------------------------------ polymarket

/**
 * List upcoming game events in the window and fetch each one in full.
 * @param {string[]} dates CT dates to include
 * @returns {Promise<object[]>} compact events (markets-core shape)
 */
async function fetchPolymarket(dates) {
  const minISO = new Date(Date.now() - 5 * 3600e3).toISOString();        // keep games that started <5h ago (live)
  const maxISO = new Date(addDays(dates[dates.length - 1], 1) + 'T12:00:00Z').toISOString();
  const listed = [];
  for (let off = 0; ; off += 100) {
    const u = `${Core.GATEWAY}/v1/events?limit=100&offset=${off}&active=true&closed=false&startDateMin=${minISO}&startDateMax=${maxISO}`;
    const page = (await getJSON(u)).events || [];
    listed.push(...page);
    if (page.length < 100) break;
  }
  const GAME = /^([a-z0-9]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/;
  const games = listed.filter(e => {
    const m = GAME.exec(e.slug || '');
    if (!m || !Core.LEAGUES[m[1]] || (e.teams || []).length !== 2) return false;
    const st = e.startTime || e.startDate;
    return st >= minISO && dates.includes(Core.ctDate(st)) || (st >= minISO && st < new Date().toISOString());
  });
  console.log(`Polymarket: ${listed.length} active events listed, ${games.length} games in window`);
  const full = await pool(games, 6, async e => {
    const d = await getJSON(`${Core.GATEWAY}/v1/events/slug/${e.slug}`);
    return d && d.event ? Core.compactEvent(d.event) : null;
  });
  return full.filter(Boolean).sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// ------------------------------------------------------------------ kalshi

/** "26OCT19" -> "2026-10-19" */
function kalshiDate(tok) {
  const M = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const m = /^(\d{2})([A-Z]{3})(\d{2})/.exec(tok);
  return m && M[m[2]] ? `20${m[1]}-${M[m[2]]}-${m[3]}` : null;
}

/** All codes a Polymarket team may appear as on Kalshi. */
function codes(t) {
  return [...new Set([t.abbr, t.display, ...(KALSHI_ALIASES[t.abbr] || [])].filter(Boolean).map(s => String(s).toUpperCase()))];
}

/** Lower-case alnum tokens for loose name matching. */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Attach Kalshi URLs/prices to compact events in place.
 * @param {object[]} events compact events
 * @returns {Promise<{events:number, matched:number, markets:number}>}
 */
async function matchKalshi(events) {
  const stats = { events: 0, matched: 0, markets: 0 };
  const bySeries = {};
  for (const lg of new Set(events.map(e => e.league))) {
    const cfg = KALSHI_SERIES[lg];
    if (!cfg || bySeries[cfg.game]) continue;
    const list = [];
    let cursor = '';
    do {
      const d = await getJSON(`${KALSHI}/events?series_ticker=${cfg.game}&status=open&limit=200${cursor ? '&cursor=' + cursor : ''}`);
      if (!d) break;
      list.push(...(d.events || []));
      cursor = d.cursor || '';
    } while (cursor && list.length < 2000);
    bySeries[cfg.game] = list;
  }
  await pool(events, 4, async ev => {
    const cfg = KALSHI_SERIES[ev.league];
    if (!cfg) return;
    stats.events++;
    const [A, B] = ev.teams;
    const ca = codes(A), cb = codes(B);
    const near = d => d && Math.abs(Date.parse(d) - Date.parse(ev.slug.slice(-10))) <= 86400e3;
    let hit = null, codeOf = {};
    for (const k of bySeries[cfg.game] || []) {
      const suf = k.event_ticker.split('-')[1] || '';
      if (!near(kalshiDate(suf))) continue;
      const teams = suf.slice(7).replace(/^\d+/, '');   // MLB adds start time: 26OCT192008CLETB
      for (const a of ca) for (const b of cb) {
        if (teams === a + b || teams === b + a) { hit = k; codeOf = { [A.abbr]: a, [B.abbr]: b }; }
      }
      if (hit) break;
    }
    if (!hit) {
      hit = (bySeries[cfg.game] || []).find(k => {
        const suf = k.event_ticker.split('-')[1] || '';
        const t = norm(k.title);
        return near(kalshiDate(suf)) && [A, B].every(x => t.includes(norm(x.short)) || t.includes(norm(x.name)) || norm(x.name).split(' ').some(w => w.length > 3 && t.includes(w)));
      }) || null;
    }
    if (!hit) return;
    stats.matched++;
    const suffix = hit.event_ticker.split('-')[1];
    ev.kalshi_event = hit.event_ticker;
    ev.kalshi_url = Core.kalshiEventUrl(hit.event_ticker, SLUGS);
    // Fill missing team codes from the suffix (title-matched events).
    if (!codeOf[A.abbr]) { const t = suffix.slice(7).replace(/^\d+/, ''); codeOf[A.abbr] = ca.find(c => t.startsWith(c) || t.endsWith(c)) || ca[0]; codeOf[B.abbr] = cb.find(c => t.startsWith(c) || t.endsWith(c)) || cb[0]; }

    const fetchMk = async series => ((await getJSON(`${KALSHI}/markets?event_ticker=${series}-${suffix}&limit=500`)) || {}).markets || [];
    const kc = m => (m.ticker.split('-').pop() || '').replace(/\d+$/, '');   // "SF21" -> "SF"
    const px = v => { const n = parseFloat(v); return isFinite(n) && n > 0 && n < 1 ? Math.round(n * 1000) / 10 : null; };
    // flip = Kalshi YES is our NO; kept so links can pre-select the right side.
    const set = (m, k, flip) => {
      m.kalshi = { ticker: k.ticker, yes: px(flip ? k.no_ask_dollars : k.yes_ask_dollars), no: px(flip ? k.yes_ask_dollars : k.no_ask_dollars) };
      if (flip) m.kalshi.flip = true;
      stats.markets++;
    };

    // Moneyline
    const game = await fetchMk(cfg.game);
    for (const m of ev.markets.filter(x => x.group === 'lines' && x.type === 'moneyline' && x.yes_team)) {
      const yesTeam = codeOf[m.yes_team];
      const k = game.find(g => kc(g) === yesTeam);
      if (!k) continue;
      const other = m.no_team && game.find(g => kc(g) === codeOf[m.no_team]);
      m.kalshi = { ticker: k.ticker, yes: px(k.yes_ask_dollars), no: px(other ? other.yes_ask_dollars : k.no_ask_dollars) };
      if (other) m.kalshi.no_ticker = other.ticker;   // our NO = the other team's YES
      stats.markets++;
    }
    // Spreads
    if (cfg.spread) {
      const sp = await fetchMk(cfg.spread);
      for (const m of ev.markets.filter(x => x.group === 'lines' && x.type === 'spread')) {
        const yesMinus = /-\d/.test(m.side_yes_label);
        const minusTeam = yesMinus ? m.yes_team : m.no_team;
        const L = Math.abs(m.line);
        const k = sp.find(s => kc(s) === codeOf[minusTeam] && Math.abs(s.floor_strike - L) < 1e-6);
        if (k) set(m, k, !yesMinus);
      }
    }
    // Totals
    if (cfg.total) {
      const tt = await fetchMk(cfg.total);
      for (const m of ev.markets.filter(x => x.group === 'lines' && x.type === 'total')) {
        const k = tt.find(s => Math.abs(s.floor_strike - m.line) < 1e-6);
        if (k) set(m, k, /^under/i.test(m.side_yes_label));
      }
    }
    // Player props
    for (const [smt, series] of Object.entries(cfg.props || {})) {
      const mine = ev.markets.filter(x => x.smt === smt && x.player);
      if (!mine.length) continue;
      const ks = await fetchMk(series);
      for (const m of mine) {
        const want = typeof m.line === 'number' ? m.line - 0.5 : null;
        const k = ks.find(s => norm(String(s.title).split(':')[0]) === norm(m.player) &&
          (want === null || s.floor_strike === undefined || s.floor_strike === null || Math.abs(s.floor_strike - want) < 1e-6));
        if (k) set(m, k, false);
      }
    }
  });
  return stats;
}

/**
 * Series ticker -> URL slug (slugified series title), filled by loadSlugs().
 * Needed because the Kalshi app only deep-links the 3-part URL
 * /markets/<series>/<slug>/<event>; see the long comment in
 * js/markets-core.js. Written to index.json as kalshi_series_slugs.
 */
const SLUGS = {};

/** Fetch titles for every series we might link to. Unknown ones are skipped. */
async function loadSlugs(leagues) {
  const want = new Set();
  for (const lg of leagues) {
    const c = KALSHI_SERIES[lg];
    if (!c) continue;
    [c.game, c.spread, c.total, ...Object.values(c.props || {})].filter(Boolean).forEach(t => want.add(t));
  }
  await pool([...want], 4, async t => {
    const d = await getJSON(`${KALSHI}/series/${t}`).catch(() => null);
    const title = d && d.series && d.series.title;
    if (title) SLUGS[t] = Core.kalshiSlug(title);
  });
  return SLUGS;
}

// ------------------------------------------------------------------ outputs

/**
 * Write index + per-event files, removing event files no longer in the window.
 * @param {object[]} events @param {string[]} dates @returns {{bytes:number}}
 */
function writeOutputs(events, dates) {
  fs.mkdirSync(EV_DIR, { recursive: true });
  const now = new Date().toISOString();
  const keep = new Set();
  let bytes = 0;
  for (const ev of events) {
    const file = `events/${ev.slug}.json`;
    keep.add(ev.slug + '.json');
    const body = JSON.stringify(Object.assign({ schema_version: 1, updated_at: now }, ev)) + '\n';
    fs.writeFileSync(path.join(OUT_DIR, file), body);
    bytes += body.length;
  }
  for (const f of fs.readdirSync(EV_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(EV_DIR, f));
  const index = {
    schema_version: 1, updated_at: now, source: 'Polymarket US public API (gateway.polymarket.us) + Kalshi public API',
    dates,
    // Kalshi series ticker -> URL slug; the browser uses this to build
    // app-friendly links (js/picker.js -> MarketsCore.kalshiMarketUrl).
    kalshi_series_slugs: SLUGS,
    events: events.map(ev => {
      const players = {};
      ev.markets.forEach(m => { if (m.player && !players[m.player]) players[m.player] = m.team || ''; });
      return {
        id: ev.id, slug: ev.slug, sport: ev.sport, league: ev.league, title: ev.title,
        start_time: ev.start_time, date: ev.date, url: ev.url, polymarket_url: ev.polymarket_url,
        kalshi_url: ev.kalshi_url || null, teams: ev.teams, market_count: ev.markets.length,
        players: Object.entries(players), file: `events/${ev.slug}.json`
      };
    })
  };
  const ib = JSON.stringify(index) + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), ib);
  return { bytes: bytes + ib.length, indexBytes: ib.length };
}

/**
 * Add polymarket_url / kalshi_url / kalshi_match (and kalshi_price for picks
 * that name a market_id + market_side) to data/picks.json. Picks are matched to games by the
 * polymarket.us slug in their link, or by market_id.
 * @param {object[]} events @returns {number} picks updated
 */
function enrichPicks(events) {
  if (!fs.existsSync(PICKS)) return 0;
  const doc = JSON.parse(fs.readFileSync(PICKS, 'utf8'));
  const bySlug = Object.fromEntries(events.map(e => [e.slug, e]));
  const byMarket = {};
  events.forEach(e => e.markets.forEach(m => (byMarket[m.id] = { e, m })));
  let n = 0;
  const visit = obj => {
    const slug = (/polymarket\.(?:us|com)\/(?:sports\/[a-z0-9]+|event)\/([a-z0-9-]+)/.exec(obj.link || obj.polymarket_url || '') || [])[1];
    const mk = obj.market_id && byMarket[obj.market_id];
    const ev = (mk && mk.e) || bySlug[slug];
    if (!ev) return;
    const before = JSON.stringify(obj);
    obj.polymarket_url = /polymarket\.us/.test(obj.link || '') ? obj.link : ev.polymarket_url;
    const kt = mk && mk.m.kalshi ? mk.m.kalshi.ticker : null;
    // Exact market (pre-selects line + side) -> game page -> null (UI shows search + "Not on Kalshi").
    obj.kalshi_url = kt ? Core.kalshiMarketUrl(mk.m.kalshi, obj.market_side === 'no' ? 'no' : 'yes', SLUGS) : (ev.kalshi_url || null);
    // kalshi_match tells the UI how good the link is: exact market, event page, or nothing.
    obj.kalshi_match = kt ? 'market' : ev.kalshi_url ? 'event' : 'none';
    if (mk && mk.m.kalshi) obj.kalshi_price = obj.market_side === 'no' ? mk.m.kalshi.no : mk.m.kalshi.yes;
    else delete obj.kalshi_price;
    if (JSON.stringify(obj) !== before) n++;
  };
  Object.values(doc.sections || {}).forEach(list => (list || []).forEach(p => { visit(p); (p.legs || []).forEach(visit); }));
  if (n) fs.writeFileSync(PICKS, JSON.stringify(doc, null, 2) + '\n');
  return n;
}

// ------------------------------------------------------------------ main

const today = Core.ctDate(new Date().toISOString());
const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
const events = await fetchPolymarket(dates);
let ks = { events: 0, matched: 0, markets: 0 };
if (!flag('--no-kalshi')) {
  try { await loadSlugs(new Set(events.map(e => e.league))); ks = await matchKalshi(events); } catch (e) { console.warn('Kalshi matching failed (snapshot still written):', e.message); }
}
const { bytes, indexBytes } = writeOutputs(events, dates);
const enriched = enrichPicks(events);
const bySport = events.reduce((a, e) => ((a[e.sport] = (a[e.sport] || 0) + 1), a), {});
const totalMk = events.reduce((s, e) => s + e.markets.length, 0);
const summary = [
  `Dates (CT): ${dates.join(', ')}`,
  `Games: ${events.length} (${Object.entries(bySport).map(([k, v]) => `${k} ${v}`).join(', ')}), markets: ${totalMk}`,
  `Kalshi: matched ${ks.matched}/${ks.events} games, ${ks.markets} markets with Kalshi prices`,
  `Size: index ${(indexBytes / 1024).toFixed(0)} KB, total ${(bytes / 1024 / 1024).toFixed(1)} MB across ${events.length} event files`,
  `picks.json: ${enriched} pick/leg link(s) updated`
];
summary.forEach(l => console.log(l));

if (flag('--commit')) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  git('add', '-A', '--', 'data/markets', 'data/picks.json');
  if (!git('diff', '--cached', '--name-only')) console.log('No market changes to commit.');
  else {
    git('commit', '-m', `Refresh market snapshot for ${dates[0]} to ${dates[dates.length - 1]}\n\n${summary.join('\n')}\n\nWritten by scripts/fetch-markets.mjs from public Polymarket US and Kalshi\nmarket data. Contains prices only; no dollar amounts or tokens.`);
    if (!flag('--no-push')) { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push', 'origin', 'main'); console.log('Pushed.'); }
  }
}
