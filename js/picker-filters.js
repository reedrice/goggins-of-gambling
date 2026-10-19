/**
 * js/picker-filters.js — the Build-a-bet filter tree, as pure functions (browser + Node).
 *
 * PURPOSE
 *   The market picker (js/picker.js) has a step-by-step filter panel above
 *   its search box:
 *     1. Day            one day (or all days) from the snapshot
 *        Sport          optional (All / NFL / MLB / …)
 *     2. Bet type       [x] Team bets     -> Who wins / Spread / Total / Other game bets
 *                       [x] Player props  -> Yards / Catches / Touchdowns / Hits / Strikeouts / Goals / Points / …
 *     3. Team           teams playing that day (and sport), with logos
 *     4. Player         only when Player props is on and a team is chosen:
 *                       that team's players who have props that day
 *   This file decides which markets pass those filters, so the rules can be
 *   unit-tested (tests/picker-filters.test.js) without a browser. The UI
 *   (rendering, session memory, search scoring) stays in picker.js.
 *   Exposed as window.PickerFilters / module.exports.
 *
 * FILTER STATE (kept in sessionStorage by picker.js, key betdash_picker_filters)
 *   { day: 'YYYY-MM-DD' | '*', sport: '' | 'NFL', team: '' | 'nfl:sf',
 *     player: '' | 'Brock Purdy',
 *     teamOn: true, propOn: true,          // the two top-level checkboxes
 *     teamOff: ['other'], propOff: ['tds'] } // unticked sub-checkboxes
 *   Sub-types are stored as the ones switched OFF, so a new prop type that
 *   shows up in tomorrow's data is included until someone unticks it.
 *
 * MATCHING RULES (all must pass)
 *   - Day / sport: the game's CT date and sport.
 *   - Team: the game must include that team. Team bets of that game all pass
 *     (a total belongs to both teams); player props pass only for players
 *     ON that team (m.team === abbr).
 *   - Player: when set, only that player's props pass (team bets are hidden,
 *     because you asked for one player).
 *   - Bet type: market kind on, and its sub-type not switched off.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PickerFilters = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Team-bet sub-types, in display order. Keys match STR.calc.f.teamSubs. */
  const TEAM_SUBS = ['moneyline', 'spread', 'total', 'other'];

  /**
   * Player-prop buckets, in display order. Each Polymarket prop type
   * (sportsMarketType, e.g. football_player_receiving_yards) is reduced to
   * its stat part ("receiving_yards") and put in the FIRST bucket whose
   * regex matches. Unknown stats land in 'other'. Labels: STR.calc.f.propSubs.
   */
  const PROP_BUCKETS = [
    { key: 'yards', re: /yards|longest_reception/ },                       // passing/rushing/receiving/scrimmage yards
    { key: 'receptions', re: /^receptions$/ },
    { key: 'tds', re: /touchdown/ },                                       // anytime, first, passing TDs
    { key: 'passing', re: /passing_attempts|passing_completions|interceptions|rushing_attempts/ },
    { key: 'fantasy', re: /fantasy/ },
    { key: 'hits', re: /^(hits|total_bases|hits_runs_rbis|rbis|runs|singles|doubles|stolen_bases)$/ },
    { key: 'homers', re: /home_runs/ },
    { key: 'pitching', re: /strikeouts|^outs$|_allowed$/ },                // pitcher stats
    { key: 'goals', re: /goals/ },
    { key: 'assists', re: /assists/ },
    { key: 'points', re: /^points$/ },
    { key: 'rebounds', re: /rebounds/ },
    { key: 'threes', re: /threes|three_pointers/ },
    { key: 'defense', re: /blocks|steals/ },
    { key: 'shots', re: /shots|saves/ }
  ];

  /** Fresh "nothing narrowed" state for a day. @param {string} day */
  function defaults(day) {
    return { day: day || '*', sport: '', team: '', player: '', teamOn: true, propOn: true, teamOff: [], propOff: [] };
  }

  /**
   * Clean a state read from sessionStorage (it may be old or hand-edited).
   * @param {object} s saved state @param {string[]} days days in today's snapshot
   * @param {string} fallbackDay used when the saved day is gone
   */
  function sanitize(s, days, fallbackDay) {
    const d = defaults(fallbackDay);
    if (!s || typeof s !== 'object') return d;
    const str = v => (typeof v === 'string' ? v.slice(0, 80) : '');
    const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 40) : []);
    return {
      day: s.day === '*' || (days || []).includes(s.day) ? s.day : d.day,
      sport: str(s.sport), team: str(s.team), player: str(s.player),
      teamOn: s.teamOn !== false, propOn: s.propOn !== false,
      teamOff: arr(s.teamOff), propOff: arr(s.propOff)
    };
  }

  /** 'prop' for player markets, else 'team'. @param {object} m compact market */
  const kindOf = m => (m.group === 'props' && m.player ? 'prop' : 'team');

  /** Team-bet sub-type: full-game moneyline/spread/total, else 'other'. */
  const teamSub = m => (m.group === 'lines' && TEAM_SUBS.includes(m.type) ? m.type : 'other');

  /** "football_player_receiving_yards" -> "receiving_yards" */
  const statOf = m => String(m.smt || '').replace(/^[a-z]+_player_/, '');

  /** Prop bucket key for a player market. */
  function propBucket(m) {
    const st = statOf(m);
    const b = PROP_BUCKETS.find(x => x.re.test(st));
    return b ? b.key : 'other';
  }

  /** Sub-type key of any market (team sub or prop bucket). */
  const subOf = m => (kindOf(m) === 'prop' ? propBucket(m) : teamSub(m));

  /** "nfl:sf" for a team of an event. */
  const teamKey = (league, abbr) => `${league}:${abbr}`;

  /**
   * Does an index/snapshot event pass day, sport and team?
   * @param {object} ev {date, sport, league, teams:[{abbr}]} @param {object} f state
   */
  function eventPasses(ev, f) {
    if (f.day && f.day !== '*' && ev.date !== f.day) return false;
    if (f.sport && ev.sport !== f.sport) return false;
    if (f.team && !(ev.teams || []).some(t => teamKey(ev.league, t.abbr) === f.team)) return false;
    return true;
  }

  /**
   * Does a market pass the bet-type, team and player filters? (Call
   * eventPasses first for its game.)
   * @param {object} ev event @param {object} m market @param {object} f state
   */
  function marketPasses(ev, m, f) {
    const kind = kindOf(m);
    if (kind === 'team') {
      if (!f.teamOn || f.player) return false;
      return !f.teamOff.includes(teamSub(m));
    }
    if (!f.propOn || f.propOff.includes(propBucket(m))) return false;
    if (f.team && teamKey(ev.league, m.team) !== f.team) return false;
    if (f.player && m.player !== f.player) return false;
    return true;
  }

  /** true if anything beyond the day is narrowed (then the picker lists matching bets). */
  function isNarrowed(f) {
    return !!(f.sport || f.team || f.player || !f.teamOn || !f.propOn || f.teamOff.length || f.propOff.length);
  }

  /**
   * Teams playing in the given events, for the Team dropdown.
   * @param {object[]} events index events (already day/sport filtered)
   * @returns {{key, league, abbr, short, name, display, logo, color, sport}[]} sorted by sport then nickname
   */
  function teamOptions(events) {
    const seen = new Map();
    for (const ev of events) for (const t of ev.teams || []) {
      const key = teamKey(ev.league, t.abbr);
      if (!seen.has(key)) seen.set(key, Object.assign({ key, league: ev.league, sport: ev.sport }, t));
    }
    return [...seen.values()].sort((a, b) => a.sport.localeCompare(b.sport) || String(a.short).localeCompare(String(b.short)));
  }

  /**
   * Players with props on one team, for the Player dropdown. Uses the
   * index's per-game `players: [[name, abbr]]` list, so no game file is needed.
   * @param {object[]} events index events @param {string} team "nfl:sf"
   * @returns {string[]} sorted names
   */
  function playerOptions(events, team) {
    const out = new Set();
    for (const ev of events) for (const [name, abbr] of ev.players || []) if (teamKey(ev.league, abbr) === team) out.add(name);
    return [...out].sort();
  }

  /**
   * Count markets per sub-type among loaded events, for the checkbox
   * labels ("Yards (53)") and to hide prop types nobody offers today.
   * Day/sport/team/player apply; the bet-type checkboxes don't (so a
   * switched-off box still shows how many it hides).
   * @param {object[]} events loaded snapshot events (with markets)
   * @param {object} f state
   * @returns {{team:Object<string,number>, prop:Object<string,number>}}
   */
  function subCounts(events, f) {
    const open = Object.assign({}, f, { teamOn: true, propOn: true, teamOff: [], propOff: [] });
    const c = { team: {}, prop: {} };
    for (const ev of events) {
      if (!eventPasses(ev, open)) continue;
      for (const m of ev.markets || []) {
        if (!marketPasses(ev, m, open)) continue;
        const k = kindOf(m), s = subOf(m);
        c[k][s] = (c[k][s] || 0) + 1;
      }
    }
    return c;
  }

  return { TEAM_SUBS, PROP_BUCKETS, defaults, sanitize, kindOf, teamSub, propBucket, subOf, teamKey,
    eventPasses, marketPasses, isNarrowed, teamOptions, playerOptions, subCounts };
});
