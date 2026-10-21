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
  /**
   * OUR SPORTS, in display order (sport chips on Picks and Build a Bet).
   * Every one is first-class: Polymarket US markets (MarketsCore.LEAGUES),
   * Kalshi series (fetch-markets.mjs), Vegas odds (fetch-book-odds.mjs
   * SPORT_KEYS), team logos (teams.js) and positions (fetch-positions.mjs).
   * tests/sports.test.mjs fails if a sport here is missing from any of them.
   * NBA added as first-class Oct 19, 2026.
   */
  sports: ['NFL', 'MLB', 'NHL', 'NBA', 'WNBA', 'Soccer'],
  picksSports: ['NFL', 'NCAAF', 'NBA', 'WNBA', 'NCAAB', 'WNCAAB', 'MLB', 'NHL', 'Soccer', 'Tennis', 'Golf'],
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
  /**
   * GitHub sign-in (OAuth device flow) for dev tools. The Client ID is public.
   * githubAuthWorker = URL of the Cloudflare Worker in workers/goggins-gh-auth
   * (GitHub's device endpoints have no CORS). Empty = the sign-in button stays hidden.
   */
  githubClientId: 'Ov23li16KIAkVHvjd1mq',
  githubAuthWorker: 'https://goggins-gh-auth.reedrice9.workers.dev',
  /** Repo-relative path of the shared, dollar-free bet log. */
  betLogPath: 'data/bet-log.json',
  /** Automatic per-app price comparisons (The Odds API); see HANDOFF.md. */
  bookOddsPath: 'data/book-odds.json',

  /**
   * Betting platforms, IN DISPLAY ORDER. Used by the calculator's platform
   * dropdown and the Record page's "How each app pays" table (every row is
   * shown even with no data). `id` is stored nowhere public; the shared log
   * records `name`, so don't rename an existing entry's `name` casually.
   * `color` + `short` draw the small badge (no external logo files needed).
   * `oddsApi` = The Odds API bookmaker key that feeds data/book-odds.json
   *   (https://the-odds-api.com/sports-odds-data/bookmaker-apis.html, checked
   *   2026-10-19). null = not in the feed. Caesars (williamhill_us) and
   *   Fanatics need a paid plan; ESPN Bet is listed as "theScore Bet";
   *   bet365 has no US feed. Polymarket US is the baseline we compare to.
   *   `oddsApiPaid: true` = only on a paid Odds API plan (the free plan
   *   returns nothing for it; the Record tab says so).
   */
  platforms: [
    { id: 'polymarket_us', name: 'Polymarket US', short: 'PM', color: '#2e5bff', oddsApi: 'polymarket_us' },
    { id: 'kalshi', name: 'Kalshi', short: 'K', color: '#00b67a', oddsApi: 'kalshi' },
    { id: 'bovada', name: 'Bovada', short: 'BOV', color: '#d0021b', oddsApi: 'bovada' },
    { id: 'fanduel', name: 'FanDuel', short: 'FD', color: '#1493ff', oddsApi: 'fanduel' },
    { id: 'draftkings', name: 'DraftKings', short: 'DK', color: '#53a318', oddsApi: 'draftkings' },
    { id: 'betmgm', name: 'BetMGM', short: 'MGM', color: '#b8975a', oddsApi: 'betmgm' },
    { id: 'caesars', name: 'Caesars', short: 'CZR', color: '#0f4d3a', oddsApi: 'williamhill_us', oddsApiPaid: true },
    { id: 'espnbet', name: 'ESPN Bet', short: 'ESPN', color: '#e4002b', oddsApi: 'espnbet' },
    { id: 'fanatics', name: 'Fanatics', short: 'FAN', color: '#0b2a5b', oddsApi: 'fanatics', oddsApiPaid: true },
    { id: 'bet365', name: 'bet365', short: '365', color: '#027b5b', oddsApi: null }
  ],
  /** Extra dropdown choice for anything not listed above. */
  otherPlatform: { id: 'other', name: 'Other', short: '?', color: '#55555c' },

  /**
   * "My platform" choices (where Open-market buttons deep-link). Must be ids
   * from `platforms`. Default is the first one.
   */
  myPlatforms: ['polymarket_us', 'kalshi']
});
