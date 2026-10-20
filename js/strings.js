/**
 * js/strings.js — EVERY user-facing sentence, label and tooltip in one place.
 *
 * PURPOSE
 *   Edit wording here without touching app logic. Exposed as window.STR.
 *   Brand text (app name, tagline) is NOT here; it lives in config.js.
 *
 * WRITING RULES (the owner asked for these; keep them when editing)
 *   - Write so a 2nd grader gets it (Reed, Oct 19 2026). Lead with dollars
 *     ("Bet $10 → get $15.75 back") and plain chances ("about 6 out of 10
 *     times", "about 1 in 4"), never % or "x". Cents show ONCE, small:
 *     NO CENTS on screen (Oct 19 2026): prices show as American odds
 *     ("+127") or the Vegas number ("Vegas +133 (Bovada)"). See STR.plain.
 *   - Write for someone who has never bet before.
 *   - No jargon in labels: avoid EV, independent, implied probability, vig,
 *     no-vig, correlation, edge, units, multiple. Use the plain phrases below.
 *   - Keep labels short. Put detail in a tooltip (tips.*) of one or two
 *     everyday sentences plus a quick example. Labels that have a tooltip show
 *     a small (i) button; tapping it shows the tip text.
 *
 * SHAPE
 *   Plain strings, or small functions for strings with numbers in them.
 *   tips.<key> are the tooltip bodies, looked up by STR.tip('<key>') in app.js.
 */
window.STR = {
  // ---------------------------------------------------------------- general
  loading: 'Loading…',
  none: '—',
  save: 'Save',
  cancel: 'Cancel',
  close: 'Close',
  tipButton: 'What does this mean?',
  // Plain-language payout next to every price (app.js / picker.js):
  // '$10 → $24.39'. The stake is the user's own
  // standard bet from their local profile ($10 if not set), never stored in the repo.
  pay: {
    short: (stake, pays) => `${stake} → ${pays}`,          // compact: Build-a-bet buttons, other-app prices
    slipNote: 'at these prices',
    howTitle: 'How prices work',
    diffNote: '"Pays less" means the same bet wins you a little less money on that app than on yours. "Pays more" means it wins you more.'
  },

  // ---------------------------------------------------------------- 2nd-grade money words
  // Used on pick cards, combo cards, the bet slip, Build-a-bet buttons and My
  // bets (app.js). Chance shapes come from js/plain.js chanceWords().
  plain: {
    // Lineup notes on pick cards (lineup check, HANDOFF §34).
    lineup: {
      label: { confirmed: 'Lineup: good to go.', at_risk: 'Lineup: heads up.', out: 'Lineup: not playing.' },
      source: 'Source:',
    },
    betGet: (stake, back) => `Bet ${stake} → get ${back} back`,
    // one pick
    chance: { of10: n => `Wins about ${n} out of 10 times`, oneIn: n => `Wins about 1 in ${n} times`, almost: 'Wins almost every time' },
    // combo of k picks (2 = "Both win …", 3+ = "All 3 win …")
    allChance: { of10: (k, n) => `${k === 2 ? 'Both' : 'All ' + k} win about ${n} out of 10 times`, oneIn: (k, n) => `${k === 2 ? 'Both' : 'All ' + k} win about 1 in ${n} times`, almost: k => `${k === 2 ? 'Both' : 'All ' + k} win almost every time` },
    priceOn: (app, c) => `Price on ${app}: ${c}`,
    // Cents + American ("Vegas") odds on the small line: "44¢ (+127)". The ⓘ explains the number.
    vegas: (num, book) => `Vegas ${num}${book ? ` (${book})` : ''}`,
    appOdds: (app, odds) => `${app} price: ${odds}`,      // no Vegas number: the app's own price as +/- odds
    cheaperOn: (app, c) => `Cheaper on ${app} (${c})`,
    tap: what => `Tap: ${what}`,
    ifAllWin: (k, stake, back) => `If ${k === 2 ? 'both' : 'all ' + k} win: your ${stake} turns into ${back}`,
    ifWins: (stake, back) => `If it wins: your ${stake} turns into ${back}`,
    onlyIf: (stake, min) => `Only bet if the app says your ${stake} pays at least ${min}`,
    appSaid: (stake, pays) => `Your app said: your ${stake} pays ${pays}`,
    deal: { good: 'Good deal: cheaper than it should be', fair: 'Fair price', pricey: 'A bit pricey' },
    // Spreads: '+1.5 = they win, or lose by just 1 run'
    spreadPlus: (line, n, unit) => (n === 1 ? `${line} = they win, or lose by just 1 ${unit}` : `${line} = they win, or lose by ${n} ${unit} or less`),
    spreadMinus: (line, n, unit) => `${line} = they must win by ${n} ${unit} or more`,
    youBet: stake => `You bet ${stake}`,
    youGet: back => `If it wins you get ${back} back`,
    gotBack: back => `got ${back} back`
  },
  // Player position badge tooltip (js/positions.js): 'QB = Quarterback'
  posTip: (abbr, name) => `${abbr} = ${name}`,

  // ---------------------------------------------------------------- tabs
  tabs: { picks: 'Picks', calc: 'Build a bet', bets: 'My bets', record: 'Record', trent: 'Fade Trent', settings: 'Settings' },

  // ---------------------------------------------------------------- Fade Trent tab (app.js renderTrent, js/trent.js, HANDOFF §28)
  trent: {
    title: 'Fade Trent',
    intro: handle => `Picks @${handle} posted on X, checked against the real final scores. "Fade" means betting the other side.`,
    loadError: 'Couldn\'t load Trent\'s picks. Try again later.',
    record: 'His record', winPct: 'He wins', units: 'His units', fade: 'Fade record',
    unitsNote: (n, a) => `From ${n} picks with units.${a ? ` ${a} spread pick${a > 1 ? 's' : ''} had no odds, so the usual -110 was used.` : ''}`,
    fadeUnitsNote: (u, n) => `Fading his spreads (at -110): ${u} over ${n} pick${n === 1 ? '' : 's'}.`,
    bySport: 'By sport', colSport: 'Sport', colRecord: 'Trent', colPct: 'Win %', colUnits: 'Units', colFade: 'Fade',
    picksTitle: 'His picks', pending: n => `${n} waiting on the game`, unclear: n => `${n} unclear (not counted)`,
    result: { win: 'Won', loss: 'Lost', push: 'Push', pending: 'Waiting', unclear: 'Unclear' },
    fadeWould: r => ({ win: 'Fade would have won', loss: 'Fade would have lost', push: 'Fade: push' })[r] || '',
    unitsShown: u => `${u}u`, odds: o => `at ${o}`, final: s => `Final: ${s}`, post: 'View on X ↗', source: 'Score ↗',
    read: (from, to) => `Posts read from ${from} to ${to}.`,
    none: '—'
  },

  // ---------------------------------------------------------------- header / platform toggle
  bankroll: 'My money',
  myPlatform: 'I bet on',
  platformSaved: name => `Links will open ${name}.`,

  // ---------------------------------------------------------------- onboarding
  ob: {
    step: 'Quick setup (1 minute)',
    private: '🔒 This stays on your phone only. Nobody else can see it.',
    name: 'Your name',
    namePh: 'e.g. Reed',
    bankroll: 'How much money are you setting aside for betting?',
    bankrollPh: 'e.g. 500',
    unit: 'Your standard bet',
    unitHint: 'We suggest 2% of your money',
    max: 'Most you\'ll ever put on one bet slip',
    maxHint: 'We suggest 5% of your money',
    end: 'Stop date (optional)',
    endHint: 'When you plan to check how it went',
    platform: 'Where do you bet?',
    platformHint: 'We\'ll open this app when you tap a bet. You can change it any time.',
    submit: 'START',
    errName: 'Type your name.',
    errBankroll: 'Type how much money you\'re setting aside.',
    errUnit: 'Your standard bet has to be more than $0 and less than your total.',
    errMax: 'The most per slip has to be more than $0.',
    done: tagline => `You're set. ${tagline}.`
  },

  // ---------------------------------------------------------------- picks
  /** Picks tab toggle. The Live Bets view itself is Richie's (js/live-bets.js, HANDOFF §32). */
  live: { group: 'Which view', today: "Today's Picks", live: 'Live Bets 🔴', soon: 'Live bets coming soon' },
  picks: {
    // "Refresh prices" on the Picks tab (js/live-picks.js, HANDOFF §37)
    pxLoading: 'Getting live prices…',
    pxLive: (t, n) => `Live prices from ${t}.` + (n ? ` ${n} already started, so ${n === 1 ? 'it keeps' : 'they keep'} the old price.` : ''),
    pxSaved: t => `Could not get live prices. Showing saved prices from ${t}.`,
    title: 'Today\'s picks',
    updated: (slate, when) => `Games on ${slate} · Updated ${when}`,
    // Day switcher above the picks (more than one slate in picks.json)
    dayGroup: 'Which day',
    sportGroup: 'Which sport',
    allSports: 'All sports',
    titleTomorrow: 'Tomorrow\'s picks',
    titleDay: 'Picks for that day',
    dayToday: words => `Today, ${words}`,
    dayTomorrow: words => `Tomorrow, ${words}`,
    loadError: 'Couldn\'t load today\'s picks. Pull down to try again.',
    empty: 'Nothing here today.',
    sections: {
      predictions: 'Who we think wins',
      singles: 'Single bets',
      props: 'Player bets',
      parlays: 'Combo bets',
      longshots: 'Big payout combos (hard to hit)',
      lottery: '🎟️ Lottery tickets (just for fun, almost never hit)',
      nonsports: 'Not sports'
    },
    lottoFun: 'Just for fun. Bet pocket change only (0.1 unit max).',
    price: 'Price',
    fair: 'Fair price',
    advantage: 'Your price advantage',
    payout: 'Payout',
    ourPayout: 'Our estimate',
    appPayout: 'What your app says it pays (type it in)',
    chance: 'Chance to win',
    skipBelow: 'Skip if under',
    bet: 'Suggested bet',
    skip: 'Skip this one',
    badge: { bet: 'Bet', wait: 'Wait', skip: 'Skip' },
    news: 'Waiting on news:',
    projected: 'Projected score:',
    open: 'Open in app ↗',
    openPlatform: name => `Open in ${name} ↗`,
    notOnKalshi: 'Not on Kalshi',
    kalshiEventOnly: 'Kalshi game page',
    // "Other apps" line on single-bet cards (from data/book-odds.json).
    // base = the user's "My platform" name; mine = its price (+ payout).
    toCalc: 'Use in bet builder',
    loaded: 'Added to the bet builder. Now type what your app says it pays.'
  },

  /** "Suggested bet" text: dollars first, then how it compares to their standard bet. */
  stake: (dollars, units) => `${dollars} (${unitWords(units)})`,
  stakeRange: (lo, hi, ulo, uhi) => `${lo}–${hi} (${unitWords(ulo)} to ${unitWords(uhi)})`,

  /** Game start hints on slip legs and open bets (js/gametime.js). */
  gameTime: {
    started: 'Started',
    startsMin: m => `Starts in ${m} min`,
    startsHours: (h, m) => `Starts in ${h}h${m ? ` ${m}m` : ''}`,
    startsDays: d => `Starts in ${d} days`
  },

  // ---------------------------------------------------------------- calculator
  calc: {
    title: 'Build a bet',
    searchPh: 'Search a team, city, player or bet (e.g. "purdy")',
    /** Build-a-bet filter panel (js/picker.js + js/picker-filters.js). */
    f: {
      title: 'Filters',
      step1: '1. Pick a day',
      step2: '2. What kind of bet?',
      step3: '3. Pick a team',
      step4: '4. Pick a player',
      allDays: 'All days',
      anySport: 'All sports',
      teamBets: 'Team bets',
      playerProps: 'Player props',
      allBets: 'All bets',
      noBets: 'No bet type picked',
      teamSubs: {
        moneyline: 'Who wins',
        spread: 'Spread (win or lose by)',
        total: 'Total score (over/under)',
        other: 'Other game bets (halves, quarters, first to score…)'
      },
      propSubs: {
        yards: 'Yards', receptions: 'Catches', tds: 'Touchdowns',
        passing: 'Passes, carries & interceptions', fantasy: 'Fantasy points',
        hits: 'Hits, bases & RBIs', homers: 'Home runs', pitching: 'Strikeouts & pitching',
        goals: 'Goals', assists: 'Assists', points: 'Points', rebounds: 'Rebounds',
        threes: '3-pointers', combos: 'Combos (PRA, double-double)', defense: 'Blocks & steals', shots: 'Shots & saves',
        other: 'Other player bets'
      },
      anyTeam: 'Any team',
      anyPlayer: 'Any player',
      noPlayers: 'No player bets for this team yet',
      reset: 'Reset filters',
      loading: 'Loading bets…',
      match: n => `${n} bet${n === 1 ? '' : 's'} match`,
      dayTotal: (n, day) => `${n} bets for ${day}. Tick a bet type, pick a team or search to see them.`,
      gameBets: 'Game bets',
      propBets: 'Player props',
      noProps: 'No player bets posted for these games yet. Polymarket US usually adds them about a day before the game.',
      noMatch: 'Nothing matches these filters. Try Reset filters.',
      matchGames: (n, g) => `${n} bet${n === 1 ? '' : 's'} in ${g} game${g === 1 ? '' : 's'}`,
      betsCount: n => `${n} bet${n === 1 ? '' : 's'}`,
      expandAll: 'Open all',
      collapseAll: 'Close all',
      /** Prop category names (Polymarket stat key -> plain words). Unknown ones are made readable automatically. */
      stats: {
        passing_yards: 'Passing yards', rushing_yards: 'Rushing yards', receiving_yards: 'Receiving yards',
        scrimmage_yards: 'Total yards (run + catch)', longest_reception: 'Longest catch', most_passing_yards: 'Most passing yards',
        receptions: 'Catches', touchdowns: 'Touchdowns (any time)', first_touchdown: 'Scores the first touchdown',
        team_first_touchdown: "Scores his team's first touchdown", passing_touchdowns: 'Passing touchdowns',
        interceptions_thrown: 'Interceptions thrown', passing_attempts: 'Pass attempts', passing_completions: 'Completed passes',
        rushing_attempts: 'Carries', fantasy_points_ppr: 'Fantasy points',
        hits: 'Hits', total_bases: 'Total bases', hits_runs_rbis: 'Hits + runs + RBIs', rbis: 'RBIs', home_runs: 'Home runs',
        strikeouts: 'Strikeouts', outs: 'Outs pitched', hits_allowed: 'Hits allowed', earned_runs_allowed: 'Earned runs allowed',
        walks_allowed: 'Walks allowed',
        goals: 'Goals scored', assists: 'Assists', points: 'Points', shots: 'Shots', shots_on_goal: 'Shots on goal', saves: 'Saves',
        rebounds: 'Rebounds', threes: '3-pointers made', blocks: 'Blocks', steals: 'Steals',
        three_pointers_made: '3-pointers made', points_rebounds_assists: 'Points + rebounds + assists (PRA)',
        points_rebounds: 'Points + rebounds', points_assists: 'Points + assists', rebounds_assists: 'Rebounds + assists',
        double_double: 'Double-double', triple_double: 'Triple-double', shots_on_target: 'Shots on target'
      }
    },
    browse: 'Browse games',
    hideBrowse: 'Hide games',
    manual: '+ Type a bet yourself',
    manualHint: 'For Kalshi, Bovada or any other app: type what you\'re betting and its price.',
    today: 'Today', tomorrow: 'Tomorrow',
    allSports: 'All',
    noGames: 'No games for these days.',
    noResults: 'Nothing found. Try a team or player name.',
    searching: 'Searching…',
    gameLines: 'Main bets (who wins, spread, total points)',
    playerProps: 'Player bets',
    other: 'Other bets',
    showMore: n => `Show ${n} more`,
    back: '← All games',
    yes: 'Yes', no: 'No',
    added: desc => `Added: ${desc}`,
    slip: 'Your bet slip',
    slipEmpty: 'No picks yet. Search or browse above, then tap a price to add it.',
    legDesc: 'What you\'re betting on',
    legDescPh: 'e.g. Guardians +1.5',
    legPlatform: 'App',
    legPrice: 'Price',
    legPricePh: '63 or -150',
    priceHint: 'Type the price however your app shows it: 63, 0.63, -150, +120 or 2.5',
    cantRead: 'We can\'t read this price',
    remove: 'Remove',
    related: 'Picks that affect each other',
    pricesAsOf: when => `Prices as of ${when}`,
    livePrices: when => `Live prices as of ${when}`,
    snapshotPrices: when => `Prices from ${when} (tap Refresh for live)`,
    refresh: '↻ Refresh prices',
    refreshed: 'Prices refreshed.',
    refreshFail: 'Couldn\'t get live prices right now. Showing the last known prices.',
    category: 'Type of bet',
    quoted: 'What your app says it pays (type it in)',
    quotedPh: 'e.g. 2.97',
    quotedHint: 'If your app says "$10 pays $29.70", type 2.97 (that\'s $29.70 ÷ $10).',
    stakeLabel: 'Your bet ($)',
    myChance: 'How likely do you think this wins?',
    myChanceHint: 'Optional. We\'ll guess if you leave it blank.',
    myChancePh: '%',
    outPayout: 'Payout (how many times your money)',   // legacy
    outChance: 'Chance to win',                        // legacy
    outGap: 'Your app vs. our math',
    outProfit: 'Win or lose per $10, over many tries',
    outReturn: 'If it wins, you get back',
    outSize: 'How big a bet',
    overMax: max => `That's more than your limit of ${max} per slip.`,
    overMaxConfirm: max => `That's more than your ${max} limit per slip. Save anyway?`,
    share: 'Share these numbers (no dollar amounts) to help improve picks',
    shareOff: 'Sharing is off. Add your GitHub key in Settings to turn it on.',
    saveBet: 'Save bet',
    clear: 'Start over',
    errLegs: 'Every pick needs a price we can read.',
    errQuoted: 'Type what the app says it pays (e.g. 2.97).',
    errStake: 'Type how much you\'re betting.',
    saved: 'Saved to My bets.',
    shared: 'Numbers shared ✔',
    shareFail: msg => `Sharing didn't work: ${msg}`
  },

  categories: { single: 'Single bet', prop: 'Player bet', parlay: 'Combo bet', longshot: 'Big payout combo', nonsports: 'Not sports' },

  // ---------------------------------------------------------------- my bets
  /** PLAY MONEY: points only, just for fun (js/play.js, app.js "play money"). */
  play: {
    label: 'Play money, just for fun',
    banner: '🎮 Play money, just for fun. No real money. Points only.',
    viewMine: 'My bets', viewPlay: 'Play money 🎮', viewGroup: 'Which bets',
    title: 'Play money',
    nameLabel: 'Pick a display name', namePh: 'e.g. Reed', nameHint: '2 to 20 letters or numbers. Others will see it on the leaderboard.',
    start: 'Start with 1,000 points',
    points: 'Points', wl: 'Won-Lost', roi: 'Gain per point bet', best: 'Best hit',
    open: n => `Open play bets (${n})`, settled: 'Finished play bets', none: 'No play bets yet. Tap "🎮 Play" on a pick card or use Build a Bet.',
    betGet: (s, x) => `Bet ${s} pts, get ${x} back`,
    won: x => `Won · got ${x} pts back`, lost: 'Lost', push: 'Refunded', waiting: 'Waiting for the result',
    check: 'Check results', checking: 'Checking results…', settledN: n => `${n} play bet(s) finished.`,
    board: 'Leaderboard', boardNote: 'Shared board updates when the daily job runs. Your own row updates right away.',
    colName: 'Name', colPts: 'Points', colWL: 'W-L', colRoi: 'ROI', colBest: 'Best hit',
    you: '(you)', notPosted: 'not posted yet',
    post: 'Post my score', postNote: 'Opens a ready-made GitHub post (needs a free GitHub account). The leaderboard script checks every bet against the real results.',
    calcTitle: '🎮 Bet play points on this slip', calcStake: 'Points to bet', calcBtn: n => `Bet ${n} play pts`,
    calcNeedsReal: 'Play bets need picks from the game list (real Polymarket US markets).',
    cardBtn: '🎮 Play',
    confirm: (desc, odds, s, x) => `Play money, just for fun.\n\n${desc}\nPolymarket US price: ${odds}\nBet ${s} pts, get ${x} back if it wins.`,
    placed: (s, x) => `Play bet placed: ${s} pts → ${x} back if it wins.`,
    err: { stake: 'Type a whole number of points.', broke: 'Not enough points.', legs: 'Add 1 to 10 picks first.', price: 'Couldn\'t get a live Polymarket US price. Try again.', name: 'Pick a display name first (Play money view on My Bets).' }
  },
  bets: {
    title: name => `${name}'s money`,
    privateNote: (unit, max) => `🔒 Only on this phone. Standard bet ${unit} · Limit per slip ${max}`,
    windowEnds: d => ` · Stop date ${d}`,
    now: 'Money now', pl: 'Won / lost', open: 'Money in open bets', roi: 'Return',
    chart: 'Your money over time',
    openTitle: n => `Open bets (${n})`,
    openEmpty: 'No open bets yet. Use a pick or build a bet.',
    settledTitle: 'Finished bets',
    settledEmpty: 'Nothing finished yet.',
    bet: 'Bet', result: 'Result', amount: 'Bet', plCol: 'Won / lost',
    toWin: 'Could win',
    appPays: 'App pays', ourEst: 'Our estimate',
    won: 'Won', lost: 'Lost', push: 'Tie / refund', del: 'Delete', reopen: 'Undo',
    status: { open: 'open', won: 'won', lost: 'lost', push: 'refund' },
    shared: ' · shared ✔', sharePending: ' · not shared yet',
    delConfirm: 'Delete this bet? (Anything already shared stays shared.)',
    recordTitle: 'How each type of bet is doing',
    type: 'Type', wlp: 'Won-Lost-Refund', all: 'All',
    backup: 'Back up',
    export: 'Save a backup file', import: 'Load a backup file',
    importConfirm: 'Replace what\'s on this phone with this backup?',
    restored: 'Backup loaded.',
    importFail: msg => `Couldn't load that file: ${msg}`
  },

  // ---------------------------------------------------------------- record
  record: {
    /** "How we're learning" card (app.js learningCardHtml, data/learning.json, HANDOFF §36). */
    learn: {
      title: "How we're learning",
      intro: min => `We grade every pick on the real result and check if our chances were right. Changes only kick in after ${min} graded picks of a kind.`,
      none: 'Nothing graded yet. This fills in as games finish.',
      logged: 'Picks saved', gradedPicks: 'Picks graded', gradedGames: 'Games graded', shrink: 'Trust in our chances',
      collecting: 'collecting data',
      clvTitle: 'Beat the closing price:',
      clv: (avg, beat, n) => `${beat}% of the time, by ${avg > 0 ? '+' : ''}${avg} points on average (${n} picks).`,
      clvNone: 'no closing prices captured yet.',
      calTitle: 'Were our chances right?', calEmpty: 'No graded picks yet.',
      colWhat: 'Kind', colSaid: 'We said %', colN: 'Graded', colActual: 'Won %', colAdj: 'Change',
      what: { pick: 'Picks', game: 'Game winners' },
      catsTitle: 'Best and worst kinds of bets', catsEmpty: 'Needs at least 10 graded picks of one kind.',
      best: 'Best so far:', worst: 'Worst so far:', tooFew: 'too few to trust yet',
      catStat: (w, l, roi, n) => `${w}-${l}, ${roi > 0 ? '+' : ''}${roi}% per bet (${n} graded)`,
      noisy: 'Small samples are noisy: a few games can swing these numbers a lot.'
    },
    /** "Live Bets record" (app.js liveRecordHtml, data/live-record.json, HANDOFF §35). */
    live: {
      title: 'Live Bets record',
      intro: 'Every live alert, kept for good (wins and losses) and graded on the real final result. Each one counts as a flat 1 unit bet at the odds when the alert went out.',
      none: 'No live alerts graded yet.', empty: 'No live alerts yet. They start once games are live.',
      wlp: 'W-L-P', hit: 'Hit rate', expected: 'Expected', units: 'Units', roi: 'ROI', sample: 'Graded',
      all: 'All', big: 'Big', slight: 'Slight', untiered: 'No tier',
      tiers: { big: 'Big edge', slight: 'Slight edge', untiered: 'No tier' },
      result: { win: 'Won', loss: 'Lost', push: 'Push', void: 'Void', pending: 'Waiting' },
      odds: (at, open) => `At alert ${at} · opened ${open}`,
      counts: (n, pending) => `${n} alerts logged, ${pending} waiting for a result.`,
      noisy: 'Small samples are noisy: a few games can swing these numbers a lot.',
      link: 'Market ↗'
    },
    title: 'How our picks are doing',
    updated: when => `Updated ${when}`,
    loadError: 'Couldn\'t load the record.',
    accuracy: 'Picks that won', graded: 'Won-Lost', pending: 'Not finished', total: 'Total picks',
    calTitle: 'When we say a team has X% chance, how often do they win?',
    calEmpty: 'Nothing graded yet. We grade picks the morning after the games.',
    calSaid: 'We said', calPicks: 'Picks', calAvg: 'Average we said', calActual: 'Actually won', calOff: 'Difference',
    pts: n => `${n} pts`,
    recent: 'Recent picks', date: 'Date', pick: 'Pick', chance: 'Chance', result: 'Result',
    resultWords: { win: 'won', loss: 'lost', pending: 'not finished', push: 'refund' },
    gameTitle: 'Game Winners', unitsBox: 'Units won/lost',
    gameUnitsNote: 'Units: as if we bet 1u on every pick, at the last Polymarket price we saved. Tap a pick to see its slip.',
    noPriceNote: n => `${n} win${n === 1 ? '' : 's'} had no saved price, so ${n === 1 ? 'it counts' : 'they count'} as 0u.`,
    // "Our Picks-page picks" section (HANDOFF §40). Units only, never dollars.
    hist: {
      singlesTitle: 'Single Bets', singlesIntro: 'One-bet plays from the Picks screen. Tap one to see its slip.',
      combosTitle: 'Combos', combosIntro: 'Multi-leg plays from the Picks screen. Tap one to see every leg.',
      none: 'No Picks-page picks saved yet.', won: 'Won', lost: 'Lost', open: 'Not finished', units: 'Units won/lost',
      unitsNote: 'Units use the price when we posted the pick and the units we said to bet.',
      cat: { single: 'Single', prop: 'Player prop', parlay: 'Combo', longshot: 'Longshot', nonsports: 'Non-sports' },
      combo: (n, t) => `${n}-leg combo: ${t}`, allOdds: 'Odds if all win', stake: 'We said to bet',
      unitsRes: 'Units', legs: n => (n === 1 ? 'The bet' : `The ${n} legs`),
      priceNote: 'Uses the price when we posted the pick.'
    },
    // Slip pop-up when you tap a Recent picks row (HANDOFF §39).
    slip: {
      open: t => `Open the slip for ${t}`, picked: t => `We picked: ${t} to win`,
      chance: 'Our chance', fair: a => `fair odds ${a}`, price: 'Polymarket price', vegas: 'Vegas line',
      pays: (st, p) => `$${+st.toFixed(2)} → $${p.toFixed(2)} if it wins`,
      priceNote: 'Price is the last one we saved, so it may have moved since the pick.',
      noPrice: 'No saved Polymarket price for this game.', score: 'We guessed', players: 'Players',
      poly: 'Open on Polymarket', close: 'Close'
    },
    // "How each app's prices compare": one block per app, three columns.
    platTitle: 'How each app\'s prices compare',
    platNote: 'Which apps pay more or less for the same bet. Two sources: combo bets people logged here, and (soon) prices we pull in automatically.',
    colLogged: 'Bets you logged',      // count of manual entries in the shared bet log
    colGap: 'Paid vs. our estimate',   // average payout difference of those bets, e.g. -6.9%
    colFeed: 'From odds feed',         // count of automatic price checks (The Odds API)
    colDiff: app => `Pays vs. ${app}`, // average payout vs. the user's "My platform", in words (no cents): "pays less" / "pays more"
    // c = average price difference in cents (internal only, never shown)
    diffMore: c => (c < 2 ? 'pays a bit less' : c < 5 ? 'pays less' : 'pays a lot less'),
    diffLess: c => (c < 2 ? 'pays a bit more' : c < 5 ? 'pays more' : 'pays a lot more'),
    diffSame: 'same',
    colTotal: 'Total',                 // both counts added up
    dash: '–',                         // shown in any cell with no data yet
    feedSoon: 'Coming soon, waiting on odds feed',
    feedBaseline: 'Your app (we compare others to this)',
    feedMissing: 'Not in the odds feed',
    feedPaid: 'Needs a paid odds plan',
    platNone: 'No bets logged yet',
    platOther: 'Other apps',
    platLag: n => `${n} shared bet(s). New ones can take a minute or two to show up.`,
    logError: 'Couldn\'t load the shared numbers.'
  },

  // ---------------------------------------------------------------- settings
  settings: {
    title: 'Settings',
    profile: 'Your info',
    name: 'Name', bankroll: 'Money set aside ($)', unit: 'Standard bet ($)', max: 'Limit per slip ($)', end: 'Stop date',
    saveProfile: 'Save', twoPct: 'Set my standard bet to 2% of my money now',
    profileSaved: 'Saved.', profileErr: 'Fill in name, money, standard bet and limit with numbers above 0.',
    platform: 'Where do you bet?',
    priceFormat: 'Show prices as',
    formats: { american: 'American odds (-170), like Vegas', decimal: 'Decimal (1.59)' },   // no cents option (Reed, Oct 19 2026)
    sharing: 'Sharing numbers',
    sharingNote: (path, repo) => `Sharing sends only what you bet on, prices, payouts and results, never dollar amounts, to ${path} in ${repo} under your GitHub name. Only people Reed added can share.`,
    tokenHow: 'How to get a key',
    tokenSteps: 'On GitHub: Settings → Developer settings → Fine-grained tokens → Generate. Pick only this repo and set "Contents" to "Read and write". The key stays on this phone.',
    tokenSaved: login => `Key saved${login ? ` · signed in as ${login}` : ''}.`,
    tokenNone: 'No key yet. Sharing is off.',
    tokenLabel: 'GitHub key',
    tokenPh: 'github_pat_…',
    tokenSavedPh: '•••••••• (saved)',
    tokenSave: 'Save & test', tokenRemove: 'Remove key',
    tokenChecking: 'Checking key…', tokenPaste: 'Paste a key first.',
    tokenOk: login => `Key works. Signed in as ${login}.`,
    tokenNoWrite: login => `Saved, but ${login} can't share to this repo yet. Ask Reed to add you.`,
    tokenRemoved: 'Key removed.',
    shareDefault: 'Share new bets automatically',
    resync: n => `Share ${n} bet(s) that didn't go through`,
    backupNote: 'Backups include your info and bets, never your GitHub key.',
    danger: 'Start over',
    reset: 'Erase everything on this phone',
    resetConfirm: 'Erase your info, bets and key from this phone? Save a backup first if you want to keep them.'
  },

  // ---------------------------------------------------------------- pick evaluation
  // "My hit chance", risk level and "My take" on every pick card (js/evaluate.js).
  eval: {
    hitChance: 'How often it wins',
    take: 'My take:',
    // Risk levels; thresholds live in js/evaluate.js (RISK_LEVELS). Keys stay
    // safer/coin_flip/risky/long_shot in picks.json; only the words changed.
    risk: { safer: 'Good chance', coin_flip: 'Coin flip', risky: 'Hard to hit', long_shot: 'Very hard to hit' },
    legendTitle: 'How hard?',
    legend: { safer: '6+ out of 10', coin_flip: 'about 5 out of 10', risky: '3 or 4 out of 10', long_shot: 'less than 1 in 4' },
    sameGameGiven: 'These picks are from the same game and affect each other. This chance already allows for that.',
    sameGameLegs: 'These picks are from the same game. This chance assumes they don\'t affect each other, so treat it as rough.',
    diffGames: 'Picks are from different games, so they don\'t affect each other.',
    prediction: (pick, score, pct) => `My prediction: ${pick} win${score ? ', ' + score : ''}${pct ? ` (${pct}% sure)` : ''}`,
    // Default "My take" sentences (picked by PickEval.verdictFor).
    verdicts: {
      skip: 'Skip. Not worth it today.',
      wait: 'Wait for the news, then play it small.',
      good: 'Good price, I\'d play it.',
      fair: 'Fair price, small play only.',
      thin: 'Thin price, tiny play or skip.',
      tooLow: 'The app pays too little. Skip.',
      barely: 'Barely worth it, small play only.',
      goodCombo: 'Good payout, I\'d play it small.',
      // No numbers here: the card's "Only bet if the app says your $5 pays at
      // least $21.30" line gives the amount in dollars (x kept for callers).
      payCheck: x => 'Small bet, only if your app pays enough (see the "Only bet if" line).',
      longshotCheck: x => 'Hard to hit. Tiny bet, only if your app pays enough (see the "Only bet if" line).',
      longshot: 'Hard to hit. Tiny bet only.'
    }
  },

  // ---------------------------------------------------------------- tooltips (i)
  tips: {
    learning: '"Change" is how many points we add to or take off our chance for picks like these, once we have 30 graded. "Trust in our chances" of 1 means we keep our number; lower means we lean toward the app\'s price. "Beat the closing price" means the price moved our way before the game started, a good sign.',
    liveRecord: '"Hit rate" is how often the alerts won. "Expected" is how often they should win going by their own odds at alert time. Beating Expected over many alerts is what counts. Units: each alert = 1 unit bet.',
    fadeTrent: 'Trent\'s picks come straight from his X posts. Only picks he wrote out in words count; picks only in a picture or with an unclear bet are skipped or marked unclear. Each one is checked against the real final score. "Fade" is the other side of his bet: if he lost, fading him won.',
    americanOdds: '+127 means a $100 bet wins $127. −150 means you bet $150 to win $100. Plus numbers win more than you bet; minus numbers win less. "Vegas" is the best number we found at the big sportsbooks for the same bet.',
    howPrices: 'Every bet shows what you get back: "$10 → $22.73" means bet $10 and get $22.73 back if you win. The small number is the same price the Vegas way: +127 means a $100 bet wins $127, −150 means you bet $150 to win $100. Bigger plus numbers win less often but pay more.',
    price: 'What this bet pays, the Vegas way. +150 means a $100 bet wins $150. −150 means you bet $150 to win $100.',
    fair: 'What this bet should pay, going by the big sportsbooks.',
    advantage: 'If your app pays more than it should, that\'s a good deal.',
    payout: 'How much you get back if you win, counting the money you bet. Bet $10 → get $25 back.',
    ourPayout: 'What this combo should pay if every pick wins, using today\'s prices.',
    chance: 'How often this wins. "6 out of 10" means if you made this bet 10 times, you\'d win about 6.',
    skipBelow: 'Your app sometimes pays less for combos than the math says. If it pays less than this, don\'t bet it.',
    unit: 'Your standard bet is how much you usually bet on one thing. Picks that win more often get more of it. Hard-to-hit ones get less.',
    related: 'These picks are from the same game, so one can help the other happen. Apps often pay less for these combos.',
    gap: 'Did your app pay more or less than our math? −7% means it paid a little less.',
    profit: 'If you made this exact bet many, many times, this is what you\'d win or lose on average for every $10. Below $0 means you\'d slowly lose money.',
    myChance: 'If you have your own guess, type it and we\'ll use it. Example: type 40 if you think it wins 4 times in 10.',
    quoted: 'Look at your app\'s bet slip. If it says "$10 pays $29.70", type 2.97 (that\'s $29.70 ÷ $10). We use it to check the payout.',
    snapshot: 'Prices come from a daily copy of the markets and update live when you open a game or tap Refresh.',
    share: 'Only the bet details are shared (what, price, payout, result) so we can learn which apps pay fairly. Your dollar amounts never leave this phone.',
    roi: 'Money won or lost compared with the money you bet. Example: +10% means you\'re up $10 for every $100 you\'ve bet.',
    calibration: 'If we\'re honest, picks we give 60% should win about 6 out of 10 times. This table checks that.',
    myPlatform: 'Tapping "Open in app" takes you to this app\'s page for the bet. If the bet isn\'t on Kalshi, we\'ll say so and open a search.',
    colLogged: 'How many combo bets you or your friends saved with "Share" on for this app.',
    colGap: 'Did the app pay more or less than our math on combos people saved? −7% means it paid a little less.',
    colDiff: 'Does this app pay more or less than your app for the same bet? "Pays less" means you\'d win a bit less money there. A dash means we don\'t have your app\'s price for those bets yet.',
    colFeed: 'How many of our picks we found on this app in the daily price check.',
    hitChance: 'My best guess at how often this bet wins, going by the big sportsbooks. "1 in 4" means you\'d win about once every 4 tries.',
    risk: 'Good chance = wins 6 or more times out of 10. Coin flip = about half the time. Hard to hit = 3 or 4 out of 10. Very hard to hit = less than 1 in 4. Harder bets should be smaller bets.',
    take: 'My short answer: is this a good bet, and how big should it be?',
    otherApps: 'Every morning we check the same bet on other apps. If one is cheaper than your app, we show it. Cheaper ticket = more money back if you win.',
    colTotal: 'How many comparisons we have for this app so far, from both sources. More means the numbers are more reliable.',
    priceFormat: 'Only changes how prices look. You can still type prices any way you like.'
  },

  /** Look up a tooltip; returns '' if missing (so a typo never breaks the page). */
  tip(key) { return (this.tips && this.tips[key]) || ''; }
};

/**
 * Plain words for a stake size in standard bets.
 * @param {number} u e.g. 0.5 @returns {string} "half your standard bet"
 */
function unitWords(u) {
  const words = { 0.25: 'a quarter of your standard bet', 0.5: 'half your standard bet', 0.75: 'three-quarters of your standard bet', 1: 'your standard bet', 2: '2× your standard bet' };
  return words[u] || `${u}× your standard bet`;
}
window.STR.unitWords = unitWords;
