/**
 * js/markets-core.js — shared Polymarket US market normalisation (browser + Node).
 *
 * PURPOSE
 *   Turns a raw Polymarket US event (GET gateway.polymarket.us/v1/events/slug/{slug},
 *   several MB with ~300–750 markets) into the compact shape stored in
 *   data/markets/events/<slug>.json and used by the calculator's market picker.
 *   The SAME code runs in scripts/fetch-markets.mjs (daily snapshot) and in the
 *   browser (live refresh of one game), so both always agree.
 *   Exposed as window.MarketsCore / module.exports.
 *
 * HOW POLYMARKET US PRICES WORK (verified against Reed's app on 2026-10-19)
 *   Every market has two marketSides. The side with long:true is "Yes"; the
 *   other is "No". Each side carries `quote.value` = the price you PAY to buy
 *   that side right now (dollars, 0–1):
 *     long side quote  = best ask of the market            -> yes_ask
 *     short side quote = 1 - best bid of the market        -> no_cost
 *   Example, market "TB -1.5" (title "Tampa Bay Rays wins by over 1.5 runs"):
 *     sides: [+1.50 CLE long, quote 0.635] [-1.50 TB short, quote 0.37]
 *   so "Guardians +1.5" costs 63.5¢ (Reed's app showed 64) and "Rays -1.5"
 *   costs 37¢. That's why spreads are labelled by TEAM + LINE per side (the
 *   "No on Rays -1.5" side shows as "Guardians +1.5").
 *   Totals: long = Over, short = Under (Under 6.5 cost 49¢ = Reed's slip).
 *
 * COMPACT MARKET SHAPE (all prices in CENTS, 1 decimal, null if no quote)
 *   { id, type, group, smt, label, line, player?, team?,
 *     side_yes_label, side_no_label, yes_team?, no_team?,
 *     yes_ask, yes_bid, no_cost,
 *     kalshi?: {ticker, yes, no} }   // added by fetch-markets.mjs when matched
 *   type  : moneyline | spread | total | prop | other
 *   group : lines (full-game ML/spread/total) | props (player) | other
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MarketsCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GATEWAY = 'https://gateway.polymarket.us';

  /** Poly slug prefix -> display sport. Anything not listed is ignored by the fetcher. */
  const LEAGUES = {
    nfl: 'NFL', mlb: 'MLB', nhl: 'NHL', nba: 'NBA', wnba: 'WNBA',
    epl: 'Soccer', ucl: 'Soccer', uel: 'Soccer', uecl: 'Soccer', lal: 'Soccer', sea: 'Soccer',
    bun: 'Soccer', bl1: 'Soccer', fl1: 'Soccer', lig1: 'Soccer', mls: 'Soccer', lmx: 'Soccer', eflch: 'Soccer'
  };

  /** Two-word team nicknames that the "last word" heuristic would break. */
  const TWO_WORD = ['maple leafs', 'red sox', 'white sox', 'blue jays', 'red wings', 'blue jackets',
    'golden knights', 'trail blazers', 'red bulls'];

  /**
   * Short team nickname for labels ("Guardians", "Maple Leafs", "Commanders").
   * Polymarket's safeName is inconsistent ("Guardians", "WAS Commanders",
   * "San Jose Sharks"), so: drop a leading abbreviation, then for multi-word
   * names keep the last word (or a known two-word nickname). Soccer names are kept whole.
   * @param {object} t raw API team {name, safeName, abbreviation, league}
   * @returns {string}
   */
  function nickname(t) {
    if (!t) return '';
    let s = String(t.safeName || t.name || '').trim();
    const ab = String(t.displayAbbreviation || t.abbreviation || '').toUpperCase();
    if (ab && s.toUpperCase().startsWith(ab + ' ')) return s.slice(ab.length + 1);
    if (!LEAGUES[t.league] || LEAGUES[t.league] === 'Soccer') return s;
    // NBA/WNBA put the nickname in `name` ("Thunder") and the city in safeName.
    const nm = String(t.name || '').trim();
    if (nm && !nm.includes(' ')) return nm;
    // Otherwise take the longest full name and keep its nickname part.
    const full = [nm, t.alias, s].filter(Boolean).sort((x, y) => y.length - x.length)[0] || s;
    const two = TWO_WORD.find(w => full.toLowerCase().endsWith(w));
    if (two) return full.slice(full.length - two.length);
    if (full.includes(' ')) return full.split(' ').pop();
    return s;
  }

  /** @param {string|number|null} v dollars string @returns {number|null} cents, 1 decimal */
  function cents(v) {
    const n = parseFloat(v);
    return isFinite(n) && n > 0 && n < 1 ? Math.round(n * 1000) / 10 : null;
  }

  /** "+1.50" -> "+1.5", "-4.50" -> "-4.5" */
  function fmtLine(desc) {
    const n = parseFloat(desc);
    if (!isFinite(n)) return String(desc);
    return (n > 0 ? '+' : '') + String(+n.toFixed(2));
  }

  /**
   * Classify a raw market.
   * @param {object} m raw market @returns {{type:string, group:string}}
   */
  function classify(m) {
    const smt = m.sportsMarketType || '';
    const v2 = m.sportsMarketTypeV2 || '';
    const md = m.metadata || {};
    if (md.playerName) return { type: 'prop', group: 'props' };
    let type = 'other';
    if (v2.endsWith('MONEYLINE') || /_full_(game|time)_winner$/.test(smt)) type = 'moneyline';
    else if (v2.endsWith('SPREAD')) type = 'spread';
    else if (v2.endsWith('TOTAL')) type = 'total';
    const fullGame = /_(team|game)_full_(game|time)_(winner|spread|total)$/.test(smt) && !/team_points|team_total/.test(smt);
    return { type, group: type !== 'other' && fullGame ? 'lines' : 'other' };
  }

  /**
   * Compact one raw market (see header for shape).
   * @param {object} m raw market from the event payload
   * @param {Object<number,string>} teamById API team id -> abbr
   * @returns {object|null} null if closed/inactive or no sides
   */
  function compactMarket(m, teamById) {
    if (m.closed || m.active === false || (m.status && m.status !== 'MARKET_STATUS_OPEN')) return null;
    const sides = m.marketSides || [];
    const yes = sides.find(s => s.long) || sides[0];
    const no = sides.find(s => s !== yes);
    if (!yes || !no) return null;
    const { type, group } = classify(m);
    const md = m.metadata || {};
    const line = typeof m.line === 'number' ? m.line : null;
    const sideLabel = s => {
      const d = String(s.description || '');
      if (type === 'spread' && s.team) return `${nickname(s.team)} ${fmtLine(d)}`;
      if (type === 'total' && /^(over|under)$/i.test(d) && line !== null) return `${d} ${Math.abs(line)}`;
      if (type === 'moneyline' && s.team && !/^(yes|no)$/i.test(d)) return nickname(s.team);
      return d;
    };
    const out = {
      id: m.slug,
      type, group,
      smt: m.sportsMarketType || '',
      label: m.title || m.question,
      line,
      side_yes_label: sideLabel(yes),
      side_no_label: sideLabel(no),
      yes_ask: cents(yes.quote && yes.quote.value),
      yes_bid: cents(m.bestBidQuote && m.bestBidQuote.value),
      no_cost: cents(no.quote && no.quote.value)
    };
    if (out.yes_ask === null && out.no_cost === null) return null; // dead book: nothing to buy
    if (md.playerName) { out.player = md.playerName; out.team = teamById[md.teamId] || null; }
    if (yes.team) out.yes_team = yes.team.abbreviation;
    if (no.team) out.no_team = no.team.abbreviation;
    else if (!no.team && yes.team && type === 'spread') out.no_team = null;
    if (!out.team && type !== 'spread' && yes.team && !md.playerName) out.team = yes.team.abbreviation;
    return out;
  }

  /**
   * Calendar date of an ISO time in America/Chicago (the user's zone).
   * @param {string} iso @returns {string} YYYY-MM-DD
   */
  function ctDate(iso) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  }

  /**
   * Compact a whole raw event.
   * @param {object} e raw event (payload.event)
   * @returns {object} {id, slug, sport, league, title, start_time, date, url, polymarket_url,
   *                    teams:[{abbr,name,short,logo,color}], markets:[...]}
   */
  function compactEvent(e) {
    const league = String(e.slug).split('-')[0];
    const teams = (e.teams || []).map(t => ({
      abbr: t.abbreviation, display: t.displayAbbreviation || String(t.abbreviation).toUpperCase(),
      name: t.name, short: nickname(t), logo: t.logo || t.shortIcon || null,
      color: (t.color && t.color.dark) || t.colorPrimary || null
    }));
    const teamById = {};
    (e.teams || []).forEach(t => (teamById[t.id] = t.abbreviation));
    const markets = (e.markets || []).map(m => compactMarket(m, teamById)).filter(Boolean);
    const url = `https://polymarket.us/sports/${league}/${e.slug}`;
    return {
      id: e.id, slug: e.slug, sport: LEAGUES[league] || league.toUpperCase(), league,
      title: e.title, start_time: e.startTime || e.startDate, date: ctDate(e.startTime || e.startDate),
      url, polymarket_url: url, teams, markets
    };
  }

  /**
   * Convert a /v1/markets/{slug}/bbo payload to picker prices.
   * @param {object} bbo response JSON {marketData:{bestBid,bestAsk}}
   * @returns {{yes_ask:number|null, yes_bid:number|null, no_cost:number|null}}
   *   no_cost = 100 - bestBid (buying No == selling Yes at the bid).
   */
  function bboPrices(bbo) {
    const d = (bbo && bbo.marketData) || {};
    const ask = cents(d.bestAsk && d.bestAsk.value), bid = cents(d.bestBid && d.bestBid.value);
    return { yes_ask: ask, yes_bid: bid, no_cost: bid === null ? null : Math.round((100 - bid) * 10) / 10 };
  }

  return { GATEWAY, LEAGUES, nickname, cents, fmtLine, classify, compactMarket, compactEvent, ctDate, bboPrices };
});
