# Roadmap

Reed's direction for where this app goes. Short and plain. Nothing here is built yet unless it says so.

## 1. Vision
A paid betting **analyzer**: insights that help each user make their own decisions. It is **not** a pick seller.

How we beat Outlier:
- **Honest public graded record.** Every pick is graded on real results, wins and losses.
- **Prediction markets first.** Polymarket/Kalshi prices compared against Vegas no-vig odds.
- **Plain-language analysis** anyone can read.
- **Learning out loud.** Calibration, CLV and what's working, shown in the app.
- **Fun extras:** Fade Trent and play money.
- **Cheaper.**

## 2. Tiers
- **Free:** the record, some analysis, Fade Trent, play money.
- **Premium (about 10-15 USD a month):** full analysis and props, live alerts, full Build a Bet, weekly reports.
- **Launch paid only after a few hundred graded bets.**
- **Later:** affiliate deals (if allowed), a paid Discord.

## 3. Legal checklist (all done before we charge anyone)
- [ ] Data, not orders. Show edges and fair odds. No "bet this 1u" in the public or paid product.
- [ ] Disclaimer: "Information/entertainment only, not betting advice."
- [ ] Responsible-gambling links (1-800-GAMBLER).
- [ ] 21+ and legal-location gate.
- [ ] No win guarantees, anywhere.
- [ ] Honest record: never hide or edit losses.
- [ ] Review by a gaming lawyer.
- [ ] Terms and privacy pages.
- [ ] App store and payment-processor rules checked.

## 4. Engineering notes
- **No paywall now.**
- Plan a feature-flag/tier hook: a `FEATURES` map with a tier label per feature (e.g. `{ liveAlerts: 'premium', fadeTrent: 'free' }`), so features can be gated later in one place.
- It's not added yet: there is no `js/config.js` today, and adding one means a new script load in index.html. Add it when gating actually starts.

## 5. Future feature ideas
- Show CLV on each pick
- Odds-move charts
- More books
- Alerts by push notification
- User accounts
- Shareable slips
- Discord bot
- Injury-impact model
- More leagues
