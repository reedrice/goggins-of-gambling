# DESIGN.md: Reed's design rules

Linked from [AGENTS.md](AGENTS.md). Detail and history are in [HANDOFF.md](HANDOFF.md).

- **Apple-like.** Sleek, simple, intuitive, easy for any age. Fewer buttons; things just work when touched.
- **Minimal and curiosity-driven.** Show one clean number or line on the surface, and put the details behind one tap (sheet or pop-up). Example: cards show only "Analytics 58% · Market 49%"; the History / Vegas / Market breakdown lives in Dig deeper.
- **No helper text and no ⓘ on every line.** Explanations live behind a tap. New labels are one or two words.
- **Generous spacing, no extra badges, no clutter.**
- **Dark mode is the default.** Planned: Settings → Dark / Light / Match my phone.
- **Charts:** pinch (phone) and scroll (PC) to zoom, drag to pan, double-tap to reset. **No range buttons.** A small label shows the visible time range. A "● Live" pill returns to now. Live updates are as fast as Polymarket allows (~1.5 s, browser-only, no bot cost).
- **Polymarket-matching default chart windows:** pregame opens on All (full history); live games open on Game (start → now); finished games show start → end. Zooming out always reaches All.
- **Hover/tap readout:** the nearest real point shows time CT · American odds · chance % · "$unit → $payout" (the user's standard bet, whole dollars) · score/period when known, with a dot on the line.
- **Money:** whole dollars, American odds, no cents. Examples only, never instructions.
- **Mock-ups first** for the redesign: 2–3 styles from Reed's screenshots, then build.
- **Dig deeper** (one tap on the Analytics line, any bet type, every surface):
  - **Prop bets** open on that player's history for *that* prop: game bars vs the line, green = hit, red = miss, plus "8 of 10".
  - **Line stepper** (− / +): the bars recolor live.
  - **Stat chips** stay on the same player and switch to his other position-appropriate prop bets.
  - **Game bets** show **one team at a time** (tap the team chip to switch, never side by side). Totals = each game's combined total vs the line; Margin = win/cover margin. Same stepper and L5 / L10 / Season / vs-opp chips.
  - Minimal: chips, one big number, bars, one quiet footer line.
