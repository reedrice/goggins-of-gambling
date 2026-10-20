# STATUS.md: done and to-do (Oct 20, 2026)

See [AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md) and [HANDOFF.md](HANDOFF.md) for detail.

## Done tonight (Oct 19–20, 2026)
- Charts on every bet + live Polymarket prices in the pop-up (§53).
- Analyzer, not pick seller: no bet instructions or suggested stakes (§54).
- Zoomable chart: pinch/scroll/drag, no range buttons, Polymarket default windows (All / Game), sorted+deduped series with nearest-point readout (odds, chance, unit payout, score) (§55).
- Analytics blend (History + no-vig Vegas + Market) on picks, Build a Bet and the chart pop-up. The digest's hit_prob comes from it, and both numbers are logged for calibration (§56).
- Dig deeper sheet with position-aware stats, splits, NFL target share, team form (§57).
- Agent hand-off docs: AGENTS.md, CLAUDE.md, DESIGN.md, STATUS.md.

## Open to-dos
- [ ] **Apple redesign**: 2–3 mock-up styles from Reed's app screenshots, then build.
- [ ] **Remove the ⓘ icons** across the site (explanations behind one tap).
- [ ] **Theme setting**: Dark (default) / Light / Match my phone.
- [ ] **UI bot**: a teammate bot that only polishes styling/layout (never picks, data or Pablo's files).
- [ ] **Steals / blocks / PRA live prop bets.**
- [ ] **Live-tick scheduling**: Pablo's (scripts/live-*, data/live/).
- [ ] **Analytics on Live Bets cards**: Richie's view (`js/live-bets.js`). Ask Richie to add a `<div class="oc" data-oc='{"marketId","side","market","text"}'>`; `js/our-chance.js` fills it automatically.
- [ ] Analytics gaps: minutes/role/injuries, opponent strength/rest, stats Viz can't parse yet (e.g. saves), calibration of blend weights once graded history builds up (`learn.mjs`).
- [ ] Dig deeper gaps: snap share, batting-order spot, PP time on ice (not in the free gamelogs).
