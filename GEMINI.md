# Project Architecture Memory Anchor — Men in Black

## 1. Zero-Token Data Engine
* **Source:** Free, public ESPN API network (`://espn.com`).
* **Automation:** Driven by GitHub Actions (`.github/workflows/live-maintenance.yml`) running every 10 minutes.
* **Database Structure:** GitOps Flat-file JSON snapshots written to `data/espn/` (e.g., `nfl-date.json`, `nhl-date.json`). No SQL or ORM used.
* **Supported Sports Footprint:** NFL, CFB, NBA, WNBA, CBB, WCBB, MLB, NHL, Soccer (EPL), Tennis (ATP), and Golf (PGA).

## 2. Core Operational Constraints
* **AI Routine Limits:** `Fade Trent` is the only active background AI routine (running every 2 hours). All other scraping loops are completely prohibited.
* **Framework/Environment:** JavaScript ES Modules on Node.js (`.mjs` files). Hosted via GitHub Pages (`pages.yml`).

## 3. Premium Apple Design System
* **Theme Structure:** Regulated by a master theme file, documented in `DESIGN.md` and `AGENTS.md`. Features persistence saving per device.
* **Styling Tokens:** Dark theme base (Slate/Navy `#0A0E17`), premium typography contrast (`#FFFFFF` for primary active text, `#8E9AA8` for secondary telemetry), continuous curve geometry (`24px` for cards, `16px` for small inputs), and glassmorphic overlays (`rgba(255,255,255,0.03)` with backdrop blurs). Offers theme selections (Ocean blue, Soft violet, Deep teal, Custom).
