# data/live
- `<slug>.json`: site file for the Live Bets view, from `node scripts/live-watch.mjs publish --slug <slug>`.
- `<slug>-alerts.json`: alerts from `node scripts/live-watch.mjs watch`.
- `<slug>-history.json`: compact price history for the tap-a-bet chart (HANDOFF §48), written by `publish`.
- `index.json`: games list for the view, rewritten by `node scripts/live-tick.mjs`.

Keeping it fresh: run `node scripts/live-tick.mjs --push` every ~10 min during game hours
(about 11 AM to 1:30 AM CT). It publishes every game starting within 30 min or live, marks
finished games final and stops touching them, and only commits when data/live changed.
It watches every liquid player prop Polymarket lists (`--players all`), no list needed. See HANDOFF §47.

Prices only (American odds + chance points). No dollar amounts, stakes, bankrolls or keys.
