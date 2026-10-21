/**
 * live-context.mjs — live game context from ESPN + the "why did it move?" rules
 * for the Live Bets edges (HANDOFF §33).
 *
 * WHY: a cheaper live price is NOT automatically an edge. If WAS is down 14
 * late, its moneyline SHOULD be cheap. If Purdy left the game, his props SHOULD
 * move. These rules sort each candidate (a side 4+ points cheaper than open)
 * into one bucket:
 *   'edge'       real edge, no explanation found (tier slight 4-9 / big 10-24)
 *   'score'      explained by score / game state
 *   'injury'     explained by injury: used INTERNALLY only. The view drops these
 *                edges and never shows injury text (Oct 19, 2026 rule).
 *   'news'       25+ point move with no explanation: probably news we can't see
 *   'unverified' ESPN context couldn't be fetched, so we can't check (shown, but flagged)
 *
 * DATA: ESPN's free public API (no key):
 *   scoreboard  https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD
 *   summary     https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<id>
 * Score, quarter, clock and possession come from the summary header/situation.
 * Injuries come from summary.injuries (the pregame report: Out / Doubtful /
 * Questionable / IR). In-game injuries come ONLY from play-by-play text
 * ("WAS-J.Daniels was injured during the play." / "... has returned to the
 * game."). ESPN has no structured in-game injury feed, so that's all we have.
 * Nothing is made up: if a fetch fails we say "context unavailable".
 *
 * SCORE HEURISTIC (simple on purpose; T = share of regulation left, 0..1):
 *   - Full-game moneyline: a side's team is TRAILING -> explained.
 *   - Full-game spread (team X, line L): X isn't covering now (margin + L <= 0) -> explained.
 *   - Full-game total (line L, points so far P): "on pace" means P = L * (1 - T).
 *     Over got cheaper and P is below pace -> explained; Under cheaper and P above pace -> explained.
 *   - Team total: same pace rule using that team's points.
 *   - Half/quarter lines: explained once that period has started (game state drives them).
 *   - Player props: not explained by score (we don't read player stats); only injuries.
 * INJURY RULES:
 *   - Prop: that player is Out / Doubtful / Questionable / IR, or got hurt in-game and hasn't returned.
 *   - Team side: that team's QB is Out / Doubtful / IR, or a QB/stat leader of that team got hurt in-game.
 */

import {createRequire} from 'node:module';
const Tennis=createRequire(import.meta.url)('../js/tennis-scores.js');
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const LEAGUE_PATH = { cfb:'football/college-football', ncaaf:'football/college-football', cbb:'basketball/mens-college-basketball', ncaab:'basketball/mens-college-basketball', ncaaw:'basketball/womens-college-basketball', nfl: 'football/nfl', nba: 'basketball/nba', wnba: 'basketball/wnba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };
export const NEWS_MOVE = 25;                  // 25+ unexplained points = probably news
const BAD = /^(out|doubtful|questionable|injured reserve)$/i;
const QB_BAD = /^(out|doubtful|injured reserve)$/i;

// ------------------------------------------------------------ fetch + parse
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ESPN returned ${r.status}`);
  return r.json();
}

/** Find the ESPN event id for a Polymarket game: same date, both team names in its title. */
export function findEspnEvent(scoreboard, title) {
  return (scoreboard.events || []).find(e => (e.competitions?.[0]?.competitors || [])
    .every(c => c.team?.name && title.includes(c.team.name)))?.id || null;
}

/** "9:14" -> 554 seconds. */
const secs = clock => { const [m, s] = String(clock || '0:00').split(':').map(Number); return (m || 0) * 60 + (s || 0); };

/**
 * Turn an ESPN summary into our context object (pure, tested with fixtures).
 * Only fields ESPN actually gives; anything missing stays null.
 */
export function parseSummary(sum, eventId, fetchedAt = new Date().toISOString()) {
  const comp = sum.header?.competitions?.[0] || {};
  const st = comp.status || {}, type = st.type || {};
  const team = c => ({ abbr: c.team?.abbreviation, alias: c.team?.name, name: c.team?.displayName,
    score: c.score != null && c.score !== '' ? Number(c.score) : null, id: c.team?.id });
  const cs = comp.competitors || [];
  const home = team(cs.find(c => c.homeAway === 'home') || {}), away = team(cs.find(c => c.homeAway === 'away') || {});
  const period = Number(st.period) || 0, clock = st.displayClock || null;
  const state = type.state || 'pre';                 // pre | in | post
  // Seconds of regulation left (OT counts as 0 regulation left).
  const left = state === 'pre' ? 3600 : state === 'post' ? 0 : period > 4 ? 0 : (4 - period) * 900 + secs(clock);
  const byTeamId = Object.fromEntries(cs.map(c => [c.team?.id, c.team?.abbreviation]));
  const possession = sum.situation?.possession ? byTeamId[sum.situation.possession] || null
    : (cs.find(c => c.possession)?.team?.abbreviation || null);
  // Pregame injury report (all listed players, real statuses only).
  const injuries = (sum.injuries || []).flatMap(t => (t.injuries || []).map(i => ({
    team: t.team?.abbreviation, player: i.athlete?.displayName, short: i.athlete?.shortName,
    pos: i.athlete?.position?.abbreviation || null, status: i.status || i.type?.description || null })));
  // In-game injuries from play text. Latest mention wins (hurt -> returned).
  const plays = [...(sum.drives?.previous || []), ...(sum.drives?.current ? [sum.drives.current] : [])].flatMap(d => d.plays || []);
  const inGame = {};
  for (const p of plays) {
    const text = String(p.text || '');
    for (const m of text.matchAll(/\b([A-Z]{2,3})-([A-Z][A-Za-z.'\-]+?) was injured/g)) inGame[`${m[1]}-${m[2]}`] = { team: m[1], player: m[2], returned: false, when: `Q${p.period?.number} ${p.clock?.displayValue || ''}`.trim() };
    for (const m of text.matchAll(/\b([A-Z]{2,3})-([A-Z][A-Za-z.'\-]+?) has returned/g)) if (inGame[`${m[1]}-${m[2]}`]) inGame[`${m[1]}-${m[2]}`].returned = true;
  }
  // Stat leaders per team = "key starters" (passing/rushing/receiving), when ESPN lists them.
  const leaders = (sum.leaders || []).flatMap(t => (t.leaders || []).flatMap(l => (l.leaders || []).slice(0, 1).map(x => ({
    team: t.team?.abbreviation, player: x.athlete?.displayName, short: x.athlete?.shortName, pos: x.athlete?.position?.abbreviation || null }))));
  return { available: true, source: 'ESPN site.api.espn.com', event_id: eventId, fetched_at: fetchedAt,
    game_state: state, espn_status: type.name || null, period, clock, regulation_secs_left: left,
    home, away, possession, injuries, in_game_injuries: Object.values(inGame), leaders };
}

/** Fetch live context for a Polymarket slug + title. Never throws: failure -> { available: false }. */
export async function fetchContext(slug, title, startTime) {
  try {
    if(Tennis.isTennis(slug)){
      const date=(startTime||slug.slice(-10)).slice(0,10).replaceAll('-',''),board=await getJson(`${ESPN}/tennis/${Tennis.tour(slug)}/scoreboard?dates=${date}&limit=1000`),match=Tennis.find(board,title,slug,startTime);
      if(!match)throw Error('tennis match not uniquely found on ESPN');
      const game=Tennis.adapt(match),cs=game.competitors,team=c=>({abbr:c.team.name,alias:c.team.name,name:c.team.name,score:c.score});
      return {available:true,source:'ESPN site.api.espn.com',event_id:match.id,fetched_at:new Date().toISOString(),tennis:true,tennis_match:match,game_state:match.status?.type?.state,espn_status:match.status?.type?.name,period:match.status?.period,clock:match.status?.type?.detail||null,regulation_secs_left:null,away:team(cs.find(c=>c.homeAway==='away')||cs[0]),home:team(cs.find(c=>c.homeAway==='home')||cs[1]),injuries:[],in_game_injuries:[],leaders:[]};
    }
    const [league, , , y, mo, d] = slug.split('-');
    const lp = LEAGUE_PATH[league]; if (!lp) throw new Error(`no ESPN league for ${league}`);
    const id = findEspnEvent(await getJson(`${ESPN}/${lp}/scoreboard?dates=${y}${mo}${d}`), title);
    if (!id) throw new Error('game not found on ESPN scoreboard');
    return parseSummary(await getJson(`${ESPN}/${lp}/summary?event=${id}`), id);
  } catch (e) {
    return { available: false, source: 'ESPN site.api.espn.com', error: String(e.message || e), fetched_at: new Date().toISOString() };
  }
}

// ------------------------------------------------------------ helpers
/** Context team for a Polymarket alias ("49ers") -> home/away object, or null. */
const teamFor = (ctx, alias) => !alias ? null : [ctx.home, ctx.away].find(t => t && t.alias === alias) || null;
const other = (ctx, t) => (t === ctx.home ? ctx.away : ctx.home);
/** "J.Daniels" (play text) matches "Jayden Daniels" / "J. Daniels". */
const sameName = (short, full) => {
  if (!short || !full) return false;
  const [i, ...rest] = short.replace(/\s/g, '').split('.'), last = rest.join('.').toLowerCase();
  const parts = full.toLowerCase().split(/\s+/);
  return parts[parts.length - 1] === last && parts[0][0] === i.toLowerCase();
};
const PERIOD_START = { full_game: 1, first_half: 1, first_quarter: 1, second_quarter: 2, second_half: 3, third_quarter: 3, fourth_quarter: 4 };

/** "Q2 9:14", "Halftime", "Final", "Pregame". */
export function clockText(ctx) {
  if(ctx.tennis)return ctx.clock||'Match status unavailable';
  if (ctx.game_state === 'pre') return 'Pregame';
  if (ctx.game_state === 'post') return 'Final';
  if (ctx.espn_status === 'STATUS_HALFTIME') return 'Halftime';
  if (ctx.espn_status === 'STATUS_END_PERIOD') return `End of Q${ctx.period}`;
  return `${ctx.period > 4 ? 'OT' : 'Q' + ctx.period} ${ctx.clock || ''}`.trim();
}
/** "WAS 14, SF 10". */
export const scoreText = ctx => (ctx.away?.score == null ? '' : `${ctx.away.abbr} ${ctx.away.score}, ${ctx.home.abbr} ${ctx.home.score}`);

/** Injury explanation for a market side, or null. */
export function injuryReason(ctx, market, i) {
  if (market.group === 'prop' && market.player) {
    const rep = ctx.injuries.find(x => x.player && x.player.toLowerCase() === market.player.toLowerCase() && BAD.test(x.status || ''));
    if (rep) return `${market.player} ${rep.status.toLowerCase()}`;
    const ig = ctx.in_game_injuries.find(x => !x.returned && sameName(x.player, market.player));
    if (ig) return `${market.player} hurt in-game (${ig.when}), not back`;
    return null;
  }
  const t = teamFor(ctx, market.teams?.[i]); if (!t) return null;
  const qb = ctx.injuries.find(x => x.team === t.abbr && x.pos === 'QB' && QB_BAD.test(x.status || ''));
  if (qb) return `${t.abbr} QB ${qb.player} ${qb.status.toLowerCase()}`;
  const keys = [...ctx.leaders.filter(l => l.team === t.abbr), ...ctx.injuries.filter(x => x.team === t.abbr && x.pos === 'QB')];
  // Play text team codes can differ from ESPN abbreviations (e.g. WAS vs WSH), so match on the player name.
  const ig = ctx.in_game_injuries.find(x => !x.returned && keys.some(k => sameName(x.player, k.player)));
  if (ig) return `${t.abbr} ${ig.player} hurt in-game (${ig.when}), not back`;
  return null;
}

/** Score / game-state explanation for a market side, or null (rules in the header). */
export function scoreReason(ctx, market, i) {
  if (ctx.game_state === 'pre' || ctx.home?.score == null) return null;
  if(ctx.tennis){
    const match=ctx.tennis_match,r=Tennis.evaluate({text:market.sides?.[i],market:market.period,side:'yes'},match);
    if(r.kind==='margin'&&r.margin<=0)return `${r.team} not above the ${r.unit} spread right now`;
    if(market.mtype==='winner'&&market.period==='full_game'){const t=teamFor(ctx,market.teams?.[i]);if(t&&t.score<other(ctx,t).score)return `${t.name} trailing in sets`;}
    // Tennis has no regulation clock: never apply points-per-minute pace rules.
    return null;
  }
  const T = ctx.regulation_secs_left / 3600;
  if (market.group === 'prop') return null;
  if (market.period && market.period !== 'full_game') {
    const started = ctx.game_state === 'post' || ctx.period >= PERIOD_START[market.period];
    return started ? 'that period is underway or done' : null;
  }
  const t = teamFor(ctx, market.teams?.[i]);
  const margin = t ? t.score - other(ctx, t).score : null;
  if (market.mtype === 'winner' && t && margin < 0) return `${t.abbr} trailing by ${-margin}`;
  if (market.mtype === 'spread' && t) {
    const L = parseFloat(String(market.sides[i]).match(/[+-]\d+(\.\d+)?/)?.[0]);
    if (!isNaN(L) && margin + L <= 0) return `${t.abbr} not covering ${L > 0 ? '+' : ''}${L} right now`;
  }
  if (market.mtype === 'total' || market.mtype === 'team_total') {
    const L = Number(market.line); if (!(L > 0)) return null;
    const P = market.mtype === 'team_total' ? (t ? t.score : null) : ctx.home.score + ctx.away.score;
    if (P == null) return null;
    const pace = L * (1 - T), over = /\bOver\b/.test(market.sides[i]);
    if (over && P < pace) return `scoring below pace (${P} pts, pace ${pace.toFixed(0)})`;
    if (!over && P > pace) return `scoring above pace (${P} pts, pace ${pace.toFixed(0)})`;
  }
  return null;
}

/** One-line score context for a card, e.g. "WSH down 7, Q2 9:14" (no injury text). */
export function contextLine(ctx, market, i, injury) {
  if (!ctx.available) return 'Game info unavailable, not checked';
  if(ctx.tennis)return ctx.game_state==='pre'?'Pregame':ctx.tennis_match.competitors.map(c=>`${Tennis.name(c)} ${(c.linescores||[]).map(s=>s.value).join(', ')}`).join(' · ')+` · ${clockText(ctx)} (games by set)`;
  const t = teamFor(ctx, market.teams?.[i]);
  let score;
  if (ctx.game_state === 'pre') score = 'Pregame';
  else if (t && t.score != null) { const m = t.score - other(ctx, t).score; score = m === 0 ? `${t.abbr} tied` : `${t.abbr} ${m > 0 ? 'up' : 'down'} ${Math.abs(m)}`; }
  else score = scoreText(ctx);
  // Score + clock only. Injuries are used internally to drop edges, never shown (Oct 19 rule).
  const parts = [score];
  if (ctx.game_state !== 'pre') parts.push(clockText(ctx));
  return parts.join(', ');
}

/**
 * Classify one candidate. edge = points cheaper than open (4+).
 * Returns { class, tier, reason, context }.
 */
export function classify(ctx, market, i, edge) {
  const tier = edge >= 10 ? 'big' : 'slight';
  if (!ctx || !ctx.available) return { class: 'unverified', tier, reason: 'Game info unavailable, can\'t check why it moved', context: 'Game info unavailable, not checked' };
  const inj = injuryReason(ctx, market, i);
  if (inj) return { class: 'injury', tier, reason: `Explained by injury: ${inj}`, context: contextLine(ctx, market, i, inj) };
  const sc = scoreReason(ctx, market, i);
  if (sc) return { class: 'score', tier, reason: `Explained by score: ${sc}`, context: contextLine(ctx, market, i, null) };
  if (edge >= NEWS_MOVE) return { class: 'news', tier: 'big', reason: `Big move (${Math.round(edge)} pts), likely news`, context: contextLine(ctx, market, i, null) };
  return { class: 'edge', tier, reason: null, context: contextLine(ctx, market, i, null) };
}
