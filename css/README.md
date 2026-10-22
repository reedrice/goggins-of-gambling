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

### Card contrast and mobile override (Reed, Oct 21)
Content panels use --surface-panel (7% contrasting glass) and --panel-border (11%); navigation and controls retain the quieter 3%/5% glass. Custom light palettes use black rather than white glass. Existing Live Bets big/slight categories use restrained green/amber tints; score/news-explained moves use the existing warning red, without changing classification or claiming these are new risk grades.
Below 768px, --radius-panel, --panel-padding and --module-gap become 16px. Controls remain 16px. The six-tab dock uses 9px labels and 17px icons with 52px targets and safe-area clearance. The score ticker becomes a manual horizontal flex scroller; duplicate marquee content is hidden. This explicitly supersedes the earlier fixed 24px mobile geometry and identical glass on every surface. Preserve these responsive role tokens in future layouts.

## Aurora appearance (Brandon, Oct 22)
Brandon requested a calmer futuristic main-site background with more color depth. Aurora is the default for unset preferences; explicit existing color choices are preserved. Named presets use static, restrained ambient radial gradients via the shared --canvas-atmosphere role token in css/theme.css. Custom palettes remain flat so user-selected light/dark colors keep their contrast. This request supersedes the previous no-gradient canvas rule for these shared background layers only. Existing panel/glass geometry, responsive spacing, semantic outcome/odds colors and private-account boundaries remain unchanged. No animated background, new requests, schedules or runtime loops.
