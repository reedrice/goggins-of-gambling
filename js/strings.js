/**
 * js/strings.js — EVERY user-facing sentence, label and tooltip in one place.
 *
 * PURPOSE
 *   Edit wording here without touching app logic. Exposed as window.STR.
 *   Brand text (app name, tagline) is NOT here; it lives in config.js.
 *
 * WRITING RULES (the owner asked for these; keep them when editing)
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

  // ---------------------------------------------------------------- tabs
  tabs: { picks: 'Picks', calc: 'Build a bet', bets: 'My bets', record: 'Record', settings: 'Settings' },

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
  picks: {
    title: 'Today\'s picks',
    updated: (slate, when) => `Games on ${slate} · Updated ${when}`,
    loadError: 'Couldn\'t load today\'s picks. Pull down to try again.',
    empty: 'Nothing here today.',
    sections: {
      predictions: 'Who we think wins',
      singles: 'Single bets',
      props: 'Player bets',
      parlays: 'Combo bets',
      longshots: 'Long shots',
      nonsports: 'Not sports'
    },
    price: 'Price',
    fair: 'Fair price',
    advantage: 'Your price advantage',
    payout: 'Payout',
    ourPayout: 'Our estimate',
    appPayout: 'App pays',
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
    kalshiPrice: c => `Kalshi: ${c}`,
    // "Other apps" line on single-bet cards (from data/book-odds.json).
    otherCheaper: (app, price, less, pm) => `Other apps: cheapest is ${app} at ${price}, ${less}¢ less than Polymarket US (${pm}).`,
    otherNone: (pm, app, price) => `Other apps: none cheaper than Polymarket US (${pm}). Closest: ${app} at ${price}.`,
    otherAsOf: when => `Checked ${when}.`,
    toCalc: 'Use in bet builder',
    loaded: 'Added to the bet builder. Now type what the app says it pays.'
  },

  /** "Suggested bet" text: dollars first, then how it compares to their standard bet. */
  stake: (dollars, units) => `${dollars} (${unitWords(units)})`,
  stakeRange: (lo, hi, ulo, uhi) => `${lo}–${hi} (${unitWords(ulo)} to ${unitWords(uhi)})`,

  // ---------------------------------------------------------------- calculator
  calc: {
    title: 'Build a bet',
    searchPh: 'Search a team, player or bet (e.g. "purdy")',
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
    quoted: 'What the app says it pays',
    quotedPh: 'e.g. 2.97',
    quotedHint: 'The payout number on your bet slip (how many times your money).',
    stakeLabel: 'Your bet ($)',
    myChance: 'How likely do you think this wins?',
    myChanceHint: 'Optional. We\'ll guess if you leave it blank.',
    myChancePh: '%',
    outPayout: 'Payout (how many times your money)',
    outChance: 'Chance to win',
    outGap: 'App pays vs. our estimate',
    outProfit: 'Expected profit per $10 bet',
    outReturn: 'If it wins, you get back',
    outSize: 'Size',
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

  categories: { single: 'Single bet', prop: 'Player bet', parlay: 'Combo bet', longshot: 'Long shot', nonsports: 'Not sports' },

  // ---------------------------------------------------------------- my bets
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
    // "How each app's prices compare": one block per app, three columns.
    platTitle: 'How each app\'s prices compare',
    platNote: 'Which apps pay more or less for the same bet. Two sources: combo bets people logged here, and (soon) prices we pull in automatically.',
    colLogged: 'Bets you logged',      // count of manual entries in the shared bet log
    colGap: 'Paid vs. our estimate',   // average payout difference of those bets, e.g. -6.9%
    colFeed: 'From odds feed',         // count of automatic price checks (The Odds API)
    colDiff: 'Price vs. Polymarket',   // average price difference of those checks, e.g. +3.2¢
    colTotal: 'Total',                 // both counts added up
    dash: '–',                         // shown in any cell with no data yet
    feedSoon: 'Coming soon, waiting on odds feed',
    feedBaseline: 'We compare other apps to this one',
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
    formats: { cents: 'Cents (63¢), like Polymarket', american: 'American odds (-170)', decimal: 'Decimal (1.59)' },
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
    hitChance: 'My hit chance',
    take: 'My take:',
    // Risk levels; thresholds live in js/evaluate.js (RISK_LEVELS).
    risk: { safer: 'Safer', coin_flip: 'Coin flip', risky: 'Risky', long_shot: 'Long shot' },
    legendTitle: 'How risky?',
    legend: { safer: '60%+', coin_flip: '45–59%', risky: '25–44%', long_shot: 'under 25%' },
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
      payCheck: x => `Play it only if the app pays at least ${x}x.`,
      longshotCheck: x => `Long shot. Tiny play, only if the app pays ${x}x or more.`,
      longshot: 'Long shot. Tiny play only.'
    }
  },

  // ---------------------------------------------------------------- tooltips (i)
  tips: {
    price: 'What it costs to buy one share. A share pays $1 if you win. Example: at 40¢, a $10 bet buys 25 shares and pays $25.',
    fair: 'What this bet should cost based on the big sportsbooks, after taking out their fee. Example: fair 47¢ means it wins about 47 times in 100.',
    advantage: 'How much cheaper the price is than the fair price. Example: price 44¢ and fair 48¢ means you\'re getting it 4¢ cheap. Bigger is better.',
    payout: 'How many times your money you get back if you win, including your bet. Example: 2.5x on a $10 bet returns $25.',
    ourPayout: 'What this combo should pay if the picks didn\'t affect each other. Example: two 50¢ picks = 2 × 2 = 4x.',
    chance: 'How often this should win, based on the prices. Example: 30% means about 3 times out of 10.',
    skipBelow: 'If the app offers less than this, the bet isn\'t worth it. Skip it.',
    unit: 'Your standard bet is the amount you usually put on one bet, about 2% of your money. Bigger confidence picks use more of it, long shots use less.',
    related: 'These picks are from the same game, so one can make the other more likely. Apps often pay less for these combos than the math says.',
    gap: 'Compares what the app pays with our math. Example: −7% means the app pays 7% less than the picks multiplied together.',
    profit: 'What you\'d make on average per $10 if you placed this same bet many times. Below $0 means you\'d lose money over time.',
    myChance: 'If you have your own guess, type it and we\'ll use it. Example: type 40 if you think it wins 4 times in 10.',
    quoted: 'Your app shows how much the slip pays. Type that number so we can compare it with our estimate. Example: "$10 pays $29.70" = 2.97.',
    snapshot: 'Prices come from a daily copy of the markets and update live when you open a game or tap Refresh.',
    share: 'Only the bet details are shared (what, price, payout, result) so we can learn which apps pay fairly. Your dollar amounts never leave this phone.',
    roi: 'Money won or lost compared with the money you bet. Example: +10% means you\'re up $10 for every $100 you\'ve bet.',
    calibration: 'If we\'re honest, picks we give 60% should win about 6 out of 10 times. This table checks that.',
    myPlatform: 'Tapping "Open in app" takes you to this app\'s page for the bet. If the bet isn\'t on Kalshi, we\'ll say so and open a search.',
    colLogged: 'How many combo bets you or your friends saved with "Share" on for this app.',
    colGap: 'On average, how much more or less the app paid on those bets than the picks multiply out to. Example: −7% means a bet we priced at 3.19x paid about 2.97x.',
    colDiff: 'On average, how much more the app charges than Polymarket US for the same bet. Example: +3¢ means you pay 3¢ more per share there, so you win a bit less. A minus means it\'s cheaper.',
    colFeed: 'How many of our picks we found on this app in the daily price check.',
    hitChance: 'My best guess at how often this bet wins, from the sportsbooks\' fair prices (and, for combos, how the picks affect each other). Example: 34% means about 1 win in 3.',
    risk: 'Safer = wins 60%+ of the time. Coin flip = 45–59%. Risky = 25–44%. Long shot = under 25%. Riskier bets should get smaller amounts.',
    take: 'My one-line call: is the price good enough to bet, and how big.',
    otherApps: 'Each morning we look up the same bet on other apps (FanDuel, DraftKings, BetMGM, Bovada, ESPN Bet, Kalshi) and show the cheapest. A cheaper price means a bigger payout. Prices move, so check before you bet.',
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
