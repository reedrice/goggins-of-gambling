# Fade Trent post watcher (Oct 20, 2026)

Reed requested new picks to appear when @BookitWithTrent posts. Previously this depended on Grok's daily digest manually reading X; `trent-picks.mjs` itself cannot fetch posts. Last complete read had stopped at Oct 20 04:22 UTC.

## Current operation

- Owner: `trent-post-check` in owners.json is `chatgpt`. This is independent of the Grok daily digest; stable ids prevent duplicate imports.
- Codex thread heartbeat every five minutes, requiring this computer and Codex to remain available. This is polling, not an instant webhook; GitHub Pages adds publishing delay.
- Use the browser tools to read `https://x.com/BookitWithTrent`. No X API token is configured. Reed signed into the in-app browser as @w0densday on Oct 20. Use that signed-in session to scroll the full Posts and Replies timelines back to the previous watermark. If the session expires, record partial coverage and request sign-in; never use a login page as proof of a complete check.
- Read posts since the last successful scan, including original posts quoted by recent posts. Follow real source links to verify exact text and posting time. Ignore pinned old posts, reposts and commentary. A result recap is not a new pick. Never invent a market, odds or line from a recap or image.
- If the timeline reaches the prior successful scan boundary, use coverage `complete`; otherwise use `partial`. Partial imports do not advance `read_through`. Keep unresolved backlog visible to maintainers and notify Reed if login/full timeline access is needed. Never convert a fetch error or login screen into a successful empty scan.

## Import and publish

1. Start from clean latest main and check the owner gate (`decide` or routine-gate check); skip silently if another owner or disabled.
2. Write verified input outside tracked files, e.g. `.cache/trent/import.json`:
   `{coverage:"partial",posts:[{id:"real X id",author:"BookitWithTrent",posted_at:"ISO",text:"verified text",picks:[{key:"stable-team-or-market-key",league:"NBA",game:"A @ B",pick:"A ML",type:"moneyline",odds:null,units:null}]}]}`.
3. One entry per actual pick, not per tweet. Preserve his stated units; unknown odds stay null. Ambiguous picks use `unclear:true` and `question`. Image-only picks stay unparsed under the existing project rule. No dollar amounts or credentials in tracked files.
4. `node scripts/trent-import.mjs .cache/trent/import.json` merges stable post-id + pick-key ids and leaves existing rows/grades untouched. It writes monitor coverage/check time and owner stamp after validation. Repeat import must not duplicate a pick.
5. Grade only from verified official finals using `trent-picks.mjs grade`; never use his emoji as the sole result source.
6. Validate with `trent-picks.mjs validate`, `tests/trent-import.test.mjs`, `tests/trent.test.js`, `tests/no-instructions.test.mjs`.
7. Commit only `data/trent-picks.json` and the owner stamp for ordinary runs, with a descriptive Fade Trent message. Publish using `publish-live-api.mjs --message "Fade Trent: new verified picks and post check"`. It requires pending changes committed locally, rejects stale main and moves main fast-forward only. After API publication, fetch and align local history only after confirming all local changes were published. Never overwrite concurrent feed/owner updates; reconcile first.
8. Check the public JSON after Pages deployment. The Fade Trent tab refreshes every minute while visible, and immediately when returning to the page. It displays last check time and partial coverage.

Stay quiet on normal checks; notify Reed only for meaningful failures, incomplete access needing action, or unresolved ambiguity. Never post to X or message collaborators automatically. Leave maintenance notes in HANDOFF.

## Backfill verified Oct 20

Post `2112579730297983307`: Celtics ML (3u), Sixers +4.5 (3u), Thunder ML (5u). Odds were not stated. Celtics graded loss from ESPN final, Detroit 121–Boston 113 (event 401909088). The remaining two stay pending. Public timeline backfill is marked partial, not falsely caught up.

## Signed-in catch-up completed Oct 20
Reviewed Posts and Replies back through the prior 04:22:05 UTC watermark. The three written opening-night NBA picks were already imported. Added the season-long lineup post 2112584568998068608 as unclear/pending because not all exact markets are stated in text. Image-only posts, promotion links, recaps, and other users' picks were excluded. Complete read watermark now reaches the latest reviewed post (21:23:14 UTC); check time is tracked separately.
