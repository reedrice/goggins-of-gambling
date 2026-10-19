/**
 * config.js — single source of truth for branding and repo wiring.
 *
 * PURPOSE
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
  appName: 'Goggins of Gambling',
  /** Short slogan shown under the name. */
  tagline: 'Stay Hard',
  /** Short label for the browser tab / home-screen icon. */
  shortName: 'GoG',
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
  betLogPath: 'data/bet-log.json'
});
