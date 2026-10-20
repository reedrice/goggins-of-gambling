# Brandon's Picks sandbox

This branch starts as a full snapshot of the working site on October 20, 2026, at commit 8077f935b876bd4a09d637f7d88590dc97f9a731. Production source and data are initially unchanged. The extra sandbox files provide a separate local preview.

## Get started (Node.js required)

Clone into your own folder, never Reed's running checkout:

```sh
git clone --branch sandbox/brandon-picks https://github.com/reedrice/goggins-of-gambling.git brandon-picks
cd brandon-picks
node sandbox/serve.mjs
```

Open http://127.0.0.1:8877/#picks. Keep this exact sandbox origin and use the provided server. The yellow banner confirms sandbox mode. Stop with Ctrl+C. A port-in-use error means another server is already using 8877; stop it before continuing.

The site keeps its real code, data snapshot and interactions, including filters, Analytics and charts. Public price/stat reads may still refresh. Local tests use separate browser storage from the production website. Do not import a real bankroll, production browser storage, or GitHub tokens. The server injects a guard before app scripts: fetch/XHR writes, beacons and form submissions are disabled. Shared-log writes intentionally fail. This is an accidental-write guard, not a security boundary against arbitrary new code. Do not remove it or use a generic server when testing.

## Scope and coordination

Read root AGENTS.md, DESIGN.md, latest HANDOFF.md, and routines/owners.json first. Brandon's task is to reduce clutter on Today's Picks while preserving functionality. Work on this branch or a feature branch based on it; push only that branch. Do not push/merge to main, change Pages settings, publish this branch, or run production publishing/data/scheduler scripts.

ChatGPT currently owns live-feed-update every 10 minutes and trent-post-check every TWO HOURS. Other routines are Grok-owned. Do not start any routine or alter ownership. Leave scripts/live-*, data/live/, Fade Trent, routine configuration and Live Bets UI untouched. js/app.js and js/strings.js are shared across views: keep edits scoped to Picks. Scope CSS under the actual Picks container; do not globally restyle shared controls. Inspect current DOM/classes rather than assuming selectors.

## Review before release

Keep existing filtering, refresh prices, charts, Analytics, sharing, builder links and Play behavior working. Check narrow/mobile and desktop layouts and other tabs. Run relevant tests and required root checks. Use sample local money only. Add a handoff note and open a focused PR for Reed's review. A branch push does not deploy this project's main Pages site. Do not add deployment workflows.

Production continues receiving data/other contributor updates. This sandbox snapshot does not automatically follow main. Bring newer main changes into this branch deliberately and resolve conflicts without overwriting live data. Before release, exclude experimental data/storage exports and unrelated generated files, follow root version-bump rules, and have Reed approve merging the design. The sandbox launcher/guard should remain development-only; the production index must never reference them.
