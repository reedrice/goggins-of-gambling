/**
 * js/picker-groups.js — groups Build-a-bet results into a tree (browser + Node).
 *
 * PURPOSE
 *   Filter/search results used to be one flat list. Now they're grouped:
 *
 *     Game (logos, matchup, start time)                      level 0
 *       Game bets                                            level 1
 *         Who wins / Spread / Total score / Other game bets  level 2 (leaf)
 *       Player props                                         level 1
 *         Stat category: Passing yards, Catches, Goals …    level 2
 *           Player (team logo)                               level 3 (leaf)
 *
 *   Reed asked for one dropdown PER prop category (stat first, then
 *   players), so "Rushing yards" lists every player's rushing lines. With a
 *   Player filter the categories stay, holding only that player's lines.
 *   Leaves hold the markets, lines sorted from low to high (175+, 200+,
 *   225+). Every node has a count. This file is pure (no DOM) so the
 *   grouping and the open/closed defaults are unit-tested in
 *   tests/picker-groups.test.js; js/picker.js renders the tree lazily
 *   (a node's body is only built when it's opened: an NFL game has ~700 bets).
 *   Exposed as window.PickerGroups / module.exports. Needs PickerFilters.
 *
 * NODE SHAPE
 *   { id, level, kind: 'game'|'team'|'prop'|'sub'|'player'|'stat',
 *     key, count, best (top search score), children?: Node[], items?: Market[],
 *     ev (game nodes and below), bucket? (stat), player?, team? (player) }
 *   ids are stable strings ("g|nfl-was-sf-2026-10-19|prop|passing_yards|Brock Purdy")
 *   so open/closed state and "Show more" survive a redraw.
 */
(function (root, factory) {
  const api = factory(root.PickerFilters || (typeof require === 'function' ? require('./picker-filters.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PickerGroups = api;
})(typeof self !== 'undefined' ? self : this, function (PF) {
  'use strict';

  /** "football_player_passing_yards" -> "passing_yards" (the stat-type key). */
  const statKey = m => String(m.smt || '').replace(/^[a-z]+_player_/, '') || 'other';

  /** Order of prop buckets (PickerFilters.PROP_BUCKETS) for sorting stat types. */
  const BUCKET_ORDER = PF.PROP_BUCKETS.map(b => b.key).concat('other');

  /**
   * Familiar order for the prop category dropdowns (most-bet first per
   * sport). Stats not listed come after, by bucket then name.
   */
  const STAT_ORDER = ['passing_yards', 'rushing_yards', 'receiving_yards', 'scrimmage_yards', 'receptions',
    'touchdowns', 'passing_touchdowns', 'first_touchdown', 'team_first_touchdown', 'interceptions_thrown',
    'passing_attempts', 'passing_completions', 'rushing_attempts', 'longest_reception', 'most_passing_yards', 'fantasy_points_ppr',
    'hits', 'total_bases', 'hits_runs_rbis', 'rbis', 'home_runs', 'strikeouts', 'outs', 'hits_allowed', 'earned_runs_allowed', 'walks_allowed',
    'goals', 'assists', 'points', 'shots', 'shots_on_goal', 'saves', 'rebounds', 'threes', 'blocks', 'steals'];
  const statRank = n => { const i = STAT_ORDER.indexOf(n.key); return i < 0 ? STAT_ORDER.length + BUCKET_ORDER.indexOf(n.bucket) : i; };

  /**
   * Markets in a leaf: by line, low to high (spreads by size of the line),
   * markets without a line after, then by label. With a search, lines still
   * win (Reed asked for 175+, 200+, 225+ order); the search only decides
   * WHICH markets are in.
   */
  function byLine(a, b) {
    const la = a.line == null ? Infinity : a.type === 'spread' ? Math.abs(a.line) : a.line;
    const lb = b.line == null ? Infinity : b.type === 'spread' ? Math.abs(b.line) : b.line;
    return la - lb || String(a.label).localeCompare(String(b.label));
  }

  /**
   * Build the tree.
   * @param {{ev:object, m:object, s:number}[]} hits markets that passed filters + search, with score
   * @param {{searching?:boolean}} [opt] searching: order games/players by best match first
   * @returns {{total:number, games:object[], index:Map<string,object>}}
   */
  function build(hits, opt) {
    const searching = !!(opt && opt.searching);
    const index = new Map();
    const games = new Map();
    const node = (id, props) => { const n = Object.assign({ id, count: 0, best: 0 }, props); index.set(id, n); return n; };
    const child = (parent, id, props) => {
      let n = index.get(id);
      if (!n) { n = node(id, props); (parent.children = parent.children || []).push(n); }
      return n;
    };
    for (const h of hits) {
      const { ev, m } = h, s = h.s || 0;
      let g = games.get(ev.slug);
      if (!g) { g = node('g|' + ev.slug, { level: 0, kind: 'game', key: ev.slug, ev }); games.set(ev.slug, g); }
      const prop = PF.kindOf(m) === 'prop';
      const sec = child(g, `${g.id}|${prop ? 'prop' : 'team'}`, { level: 1, kind: prop ? 'prop' : 'team', key: prop ? 'prop' : 'team', ev });
      let leaf;
      if (prop) {
        const st = statKey(m);
        const cat = child(sec, `${sec.id}|${st}`, { level: 2, kind: 'stat', key: st, bucket: PF.propBucket(m), ev });
        leaf = child(cat, `${cat.id}|${m.player}`, { level: 3, kind: 'player', key: m.player, player: m.player, team: m.team, ev, items: [] });
        cat.count++; cat.best = Math.max(cat.best, s);
      } else {
        const sub = PF.teamSub(m);
        leaf = child(sec, `${sec.id}|${sub}`, { level: 2, kind: 'sub', key: sub, ev, items: [] });
      }
      leaf.items.push(m); leaf.count++; leaf.best = Math.max(leaf.best, s);
      sec.count++; sec.best = Math.max(sec.best, s);
      g.count++; g.best = Math.max(g.best, s);
    }
    const time = n => String(n.ev.start_time || '');
    const list = [...games.values()].sort((a, b) => (searching ? b.best - a.best : 0) || time(a).localeCompare(time(b)) || a.key.localeCompare(b.key));
    for (const g of list) {
      g.children.sort((a, b) => (a.kind === 'team' ? 0 : 1) - (b.kind === 'team' ? 0 : 1)); // Game bets first
      for (const sec of g.children) {
        if (sec.kind === 'team') sec.children.sort((a, b) => PF.TEAM_SUBS.indexOf(a.key) - PF.TEAM_SUBS.indexOf(b.key));
        else {
          // categories in a fixed, familiar order (yards, catches, TDs, … goals, assists, points)
          sec.children.sort((a, b) => statRank(a) - statRank(b) || a.key.localeCompare(b.key));
          // players: best search match first, then A-Z
          for (const cat of sec.children) cat.children.sort((a, b) => (searching ? b.best - a.best : 0) || a.key.localeCompare(b.key));
        }
      }
    }
    for (const n of index.values()) if (n.items) n.items.sort(byLine);
    return { total: hits.length, games: list, index };
  }

  /**
   * Which nodes start open. Rules (first match wins per node):
   *   - few results (≤ 25 total): everything open
   *   - a player filter: everything open (it's one player's bets)
   *   - games: open when there are ≤ 2 games, a team filter is on, or the
   *     game has ≤ 40 results
   *   - Game bets / Player props: open when the game is open and the
   *     section has ≤ 60 results or a team filter is on
   *   - Who wins… / a prop category: open when the parent is open and ≤ 12 results
   *   - a player inside a category: open when the category is open and ≤ 8 results
   * @param {object} tree from build() @param {object} f filter state
   * @returns {Set<string>} open node ids
   */
  function defaultOpen(tree, f) {
    const open = new Set();
    const all = tree.total <= 25 || !!(f && f.player);
    const team = !!(f && f.team);
    for (const g of tree.games) {
      if (!(all || tree.games.length <= 2 || team || g.count <= 40)) continue;
      open.add(g.id);
      for (const sec of g.children) {
        if (!(all || sec.count <= 60 || team)) continue;
        open.add(sec.id);
        for (const c of sec.children) {
          if (!(all || c.count <= 12)) continue;
          open.add(c.id);
          for (const st of c.children || []) if (all || st.count <= 8) open.add(st.id);
        }
      }
    }
    return open;
  }

  /** Every node id (for "Expand all"). @param {object} tree */
  const allIds = tree => new Set(tree.index.keys());

  return { build, defaultOpen, allIds, statKey, byLine, STAT_ORDER };
});
