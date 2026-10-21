# Your private Kalshi tracker

Deploy this isolated folder into YOUR Cloudflare account. No secrets, database or bindings to someone else's account are needed. The template is copied into your own GitHub account; upstream changes are not automatically applied.

[Deploy to your Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/reedrice/goggins-of-gambling/tree/main/kalshi-private-relay)

1. Follow the deploy button and use your own Cloudflare and GitHub accounts. Accept the generated settings and deploy.
2. Copy the resulting https://private-kalshi-tracker.YOUR-ACCOUNT.workers.dev URL into My Bets → Kalshi account. Confirm that it is yours.
3. Enter a read-only Kalshi Key ID, private key and local unlock password inside your personal panel. Prefer opening the personal URL in its own tab if your browser blocks embedded storage.

The parent site embeds an isolated cross-origin iframe. No keys, positions, results or totals are posted to the parent. Private keys sign locally; only key IDs, request signatures and portfolio responses pass through YOUR stateless Worker to Kalshi. The Worker has no storage bindings or observability. Browser data are password-encrypted on this personal origin; no export/share route exists. Only signed GET endpoints are accepted. No trade, transfer, order management, credential creation, analytics or parent messages. Read-only API scopes are verified each sync.

This connection is separate from main-site Polymarket/manual totals. Actual account access must be verified by the person who owns the Kalshi account.
