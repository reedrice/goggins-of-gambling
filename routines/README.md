# Production routines

GitHub Actions owns all five former Grok routines plus the Live Bets feed. See owners.json, ACTIONS.md, ESPN.md and [OWNERSHIP-AUDIT.md](OWNERSHIP-AUDIT.md). No scheduled Grok/ChatGPT work for sports-data ingestion, grading, public leaderboard or learning. November 4 follow-up: Reed relayed confirmation that all five obsolete Grok site schedules are paused, with no replacements. GitHub Actions retains ownership. Never create fallback AI polling or sandbox background jobs.

Schedules (America/Chicago, evaluated by maintenance with a five-minute target; publication can be delayed):
- Daily slate: latest five-minute slot.
- Lineup/goalie: noon and 4 PM.
- Late scratches: 5:50 PM.
- Play leaderboard: noon, 3 PM and hourly 5–11 PM.
- Weekly measured learning report: Sunday 10 AM.
- Live feed, grading, feedback and ESPN status snapshots: five-minute cron target, plus bounded native recovery/cadence dispatches of the same serialized workflow.

Only the owner in owners.json executes a routine. GitHub production/main guards, serialized publication, bounded race regeneration, source checks and explicit public-data allowlist apply. Delayed runs catch up the most recent slot without pretending missed runs occurred. No private accounts, bankrolls, keys, model calls or chat messages. General Underdog/Twitter/X sports scraping is deprecated; historical prompts were removed from this active runbook and remain in Git history.

Reed explicitly retained Fade Trent's two-hour ChatGPT/Codex browser routine as the sole AI exception. See FADE-TRENT.md. It still requires the computer/session and uses AI usage. It has not migrated to Actions; no ESPN endpoint supplies Trent posts.
