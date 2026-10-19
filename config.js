/**
 * config.js — single source of truth for branding and repo wiring.
 *
 * PURPOSE (working title: the name is expected to change)
 *   Every user-visible brand string (app name, tagline, slogans) lives here and
 *   ONLY here. index.html, the onboarding screen, the header and the page
 *   <title> all read from window.APP_CONFIG at runtime. To rename the product,
 *   edit this file (and optionally the GitHub repo name below) — nothing else.
 *
 *   Brand text must NOT appear in localStorage keys or data file names; those
 *   use the neutral "betdash_" prefix so a rename never orphans user data.
 *
 * LOAD ORDER
 *   Loaded as a classic <script> before js/*.js so APP_CONFIG is a global.
 */
window.APP_CONFIG = Object.freeze({
  /** Product name shown in the header, page title and onboarding. */
  appName: 'Men in Black',
  /** Short slogan shown under the name. */
  tagline: 'Stay Hard',
  /** Short label reserved for a future web manifest / home-screen icon (currently unused). */
  shortName: 'MIB',
  /** One-line pitch shown on the onboarding screen. */
  onboardingPitch: 'No soft bets. No guessing. Set your bankroll and earn every unit.',
  /** Small rotating motivational lines shown in the header. */
  slogans: [
    'Stay hard.',
    'Discipline beats hunches.',
    'Respect the unit.',
    'No edge, no bet.',
    'Callous the bankroll.'
  ],

  /**
   * GitHub repo that hosts this site and the shared calibration log.
   * Used by js/github-log.js for REST contents API reads/writes.
   * If the repo is renamed, update repoName (and the Pages URL changes too).
   */
  repoOwner: 'reedrice',
  repoName: 'goggins-of-gambling',
  repoBranch: 'main',
  /** Repo-relative path of the shared, dollar-free bet log. */
  betLogPath: 'data/bet-log.json',

  /**
   * Betting platforms, IN DISPLAY ORDER. Used by the calculator's platform
   * dropdown and the Record page's "How each app pays" table (every row is
   * shown even with no data). `id` is stored nowhere public; the shared log
   * records `name`, so don't rename an existing entry's `name` casually.
   * `color` + `short` draw the small badge (no external logo files needed).
   */
  platforms: [
    { id: 'polymarket_us', name: 'Polymarket US', short: 'PM', color: '#2e5bff' },
    { id: 'kalshi', name: 'Kalshi', short: 'K', color: '#00b67a' },
    { id: 'bovada', name: 'Bovada', short: 'BOV', color: '#d0021b' },
    { id: 'fanduel', name: 'FanDuel', short: 'FD', color: '#1493ff' },
    { id: 'draftkings', name: 'DraftKings', short: 'DK', color: '#53a318' },
    { id: 'betmgm', name: 'BetMGM', short: 'MGM', color: '#b8975a' },
    { id: 'caesars', name: 'Caesars', short: 'CZR', color: '#0f4d3a' },
    { id: 'espnbet', name: 'ESPN Bet', short: 'ESPN', color: '#e4002b' },
    { id: 'fanatics', name: 'Fanatics', short: 'FAN', color: '#0b2a5b' },
    { id: 'bet365', name: 'bet365', short: '365', color: '#027b5b' }
  ],
  /** Extra dropdown choice for anything not listed above. */
  otherPlatform: { id: 'other', name: 'Other', short: '?', color: '#55555c' },

  /**
   * "My platform" choices (where Open-market buttons deep-link). Must be ids
   * from `platforms`. Default is the first one.
   */
  myPlatforms: ['polymarket_us', 'kalshi']
});
