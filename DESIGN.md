# DESIGN.md: Reed's design rules

## Global token override (Reed, Oct 21)

`css/theme.css` is the master design system and loads after all component CSS. Follow the Global UI Design Tokens section at the bottom of AGENTS.md: canvas #0A0E17; panels 24px; controls 16px; shared 3% white glass, 12px blur and 5% white border; primary white and secondary #8E9AA8; 24px module/panel spacing. This explicitly authorized implementation supersedes the historical gritty palette/Impact headings and component-specific radii. Existing functional controls, six tabs, private-account boundaries, chart data and semantic outcome colors remain intact. No Tailwind/build dependency is needed for this plain-CSS app.

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
- **Analytics button.** ONE control on every bet: a pill "Analytics 58% · Market 49% ›" (`.oc-btn`). No separate "Dig deeper" button; the UI never says "Dig deeper" or "Our chance" (code names stay).
- **Analytics sheet** (internally Dig deeper; one tap on the Analytics pill, any bet type, every surface):
  - **Prop bets** open on that player's history for *that* prop: game bars vs the line, green = hit, red = miss, plus "8 of 10".
  - **Line stepper** (− / +): the bars recolor live.
  - **Stat chips** stay on the same player and switch to his other position-appropriate prop bets.
  - **Game bets** show **one team at a time** (tap the team chip to switch, never side by side). Totals = each game's combined total vs the line; Margin = win/cover margin. Same stepper and L5 / L10 / Season / vs-opp chips.
  - Minimal: chips, one big number, bars, one quiet footer line.
- **Current season by default, everywhere.** Prop bars, team bars and the Analytics History part use only this season's games (preseason excluded). If there are only a few, show what exists ("Hit in 1 of 2"), never padded with last season. Last season is tucked into a "Last season" chip at the end of the chips.

- **Analytics sheet opens on the live price chart.** Every bet's sheet leads with its live Polymarket price chart (same data + ~1 s polling as the main chart). History bars and stats are secondary, below it (scroll). If the current season has no games yet, the bars say so; never auto-show last season (the "Last season" chip stays). Never leave anything blank.
- **Never blank.** Every chart, bar set, donut, pop-up and sheet shows something: "Loading…" while fetching, then data, or a one-line note naming the source and the time we checked ("Checked ESPN · not enough games yet to chart · 6:17 AM CT", "Checked Polymarket · no price history yet · …"). Fetch errors say so and retry ("Couldn't reach Polymarket · retrying"). `Viz.note()` makes these; `tests/no-blank.smoke.js` fails on an empty visual container.

## Game price charts look like Polymarket (Oct 20, 2026)
Game markets draw two stepped lines, one per side, in team colors (fallback green / blue), with a dot at the end and the side's name above a big whole %. There's a score header above (abbr, big score, red "Live" and the period). No y-axis or grid. Props stay one stepped Yes line. Every line is step-after, like Polymarket.

## Modern chart override (Reed, Oct 21, 2026)
Reed explicitly replaced the stepped Polymarket-style chart above with a smoother modern visual. Use bounded cubic display curves through actual recorded samples, restrained glow and gradient fills, and separate responsive quote cards for full side names/percentages. Original prices, nearest-sample readouts, colors, zoom/pan, polling and settlement meaning remain unchanged. This supersedes the stepped-line styling requirement. Two directions (Aurora and Precision) were prepared locally; the restrained Aurora direction was implemented.

## Flexible colorway override (Reed, Oct 21)
Palette is user-selectable in Settings → Appearance, including custom canvas/accent. Ocean blue replaces the prior orange default. Geometry, glass blur and spacing remain fixed; components follow semantic role tokens. User-selected custom light palettes use contrasting dark text. The fixed default canvas is not a restriction on future palette choices.

### Card contrast and mobile override (Reed, Oct 21)
Content panels use --surface-panel (7% contrasting glass) and --panel-border (11%); navigation and controls retain the quieter 3%/5% glass. Custom light palettes use black rather than white glass. Existing Live Bets big/slight categories use restrained green/amber tints; score/news-explained moves use the existing warning red, without changing classification or claiming these are new risk grades.
Below 768px, --radius-panel, --panel-padding and --module-gap become 16px. Controls remain 16px. The six-tab dock uses 9px labels and 17px icons with 52px targets and safe-area clearance. The score ticker becomes a manual horizontal flex scroller; duplicate marquee content is hidden. This explicitly supersedes the earlier fixed 24px mobile geometry and identical glass on every surface. Preserve these responsive role tokens in future layouts.

## Chart density and stable colors (Reed, Oct 21)
Single-series lines use the active theme accent consistently, never a color based on the currently visible trend. Paired series retain stable contrasting side colors. Dense overview paths use viewport-scaled time-bucket averages and bounded curves, labeled Smoothed overview; zoomed-in sparse views use actual samples. Raw history, live endpoint quotes, hover values and settlement math remain untouched. This supersedes the earlier every-sample-in-path rule for dense overviews only; never present an averaged display value as an executable price.
