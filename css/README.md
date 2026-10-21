# Men in Black shared theme

Start with AGENTS.md (Global UI Design Tokens and User-selectable colorways) and DESIGN.md before editing frontend CSS.

`theme.css` loads **last**, after `style.css` and `live-bets.css`. It owns the design tokens and legacy adapters for all main-site screens. The site uses native CSS custom properties, not Tailwind or a build framework.

| Role | Token |
| --- | --- |
| Page canvas | `--canvas` |
| Primary/secondary text | `--text-primary`, `--text-secondary` |
| Glass background/border/blur | `--surface-glass`, `--surface-border`, `--surface-blur` |
| Panel/control corners | `--radius-panel` (24px), `--radius-control` (16px) |
| Accent/action/selected fill | `--accent`, `--action-fill`, `--selection-fill` |
| Module spacing/panel padding | `--module-gap`, `--panel-padding` (24px) |
| Page gutters | `--page-gutter` (16–32px) |

Use existing themed classes or `.mib-panel` / `.mib-control`; use semantic outcome/team colors where they carry meaning. Do not reintroduce orange branding, solid per-screen panels, private palettes, arbitrary radii or typography. Legacy variable aliases resolve to this file. Keep all six tabs, input semantics, keyboard focus, safe areas and 44px touch targets.

Settings → Appearance exposes Ocean blue, Soft violet, Deep teal and Custom canvas/accent. Preferences are per-device via `Store` (`betdash_prefs`); `js/theme.js` applies them without network calls, timers or account access. Custom light colors use contrasting dark text. Theme choice must never affect betting calculations, API behavior, data storage or sync state.

To add a preset: define its `:root[data-color-scheme="name"]` role-token overrides here, add its id to `js/theme.js` schemes and its display label to `STR.theme.schemes` in `js/strings.js`. Do not duplicate color literals in individual screens. Preserve the shared geometry/glass/spacing. Do not style or inspect independently hosted private account origins from the main site.

Verify syntax, `tests/theme.test.mjs`, relevant UI flows at desktop/phone sizes, then run the version bump/check and public Pages verification for frontend releases. No background AI monitor or backend routine is needed for appearance changes.
