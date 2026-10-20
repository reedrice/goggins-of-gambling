# data/archive: append-only data cache (HANDOFF §59)

Dated, compressed, append-only records for self-learning, backtests, projections and Analytics weight-tuning.
Written by `node scripts/archive.mjs [--date YYYY-MM-DD] [--commit] [--no-net]`. It also runs automatically after `scripts/capture-closing.mjs --commit`.

## Layout
`data/archive/<kind>/<YYYY-MM>/<YYYY-MM-DD>.ndjson.gz`: gzip NDJSON, one JSON object per line, sorted by `key`.
- **Day:** the Chicago (CT) date of the run. For `prices`, it is the game date.
- **Idempotent:** a record is replaced only when its content changes. Unchanged records keep their first `at` (ISO time archived).
- **Fetch once:** `<kind>/.done/` holds markers so `prices` and `espn` are fetched only once.
- **Read:** `zcat data/archive/picks/2026-10/*.ndjson.gz | jq .`, or `zlib.gunzipSync` → split lines → `JSON.parse` in Node.

## Kinds
| kind | key | fields |
|---|---|---|
| `picks` | `<slate_date>\|<pick id>` | `section`, `slate_date`, `pick` (the full picks.json entry without stakes: legs, price, fair, hit_prob, our_chance, verdict, start_time…) |
| `analytics` | `<pick id>\|<leg index>` | `market_id`, `side`, `market_chance` (Polymarket %), `analytics` (blend %), `why` ("History … · Vegas … · Market …"), `hit_prob` |
| `results` | pick id | pick-history entry: legs with `publish` / `close` prices, `close_at`, per-leg `result`, slip `result`, `graded_at`, `hit_prob`, `our_chance`, `market_chance` |
| `vegas` | `<file>\|<market\|side>\|<updated_at>` | `src` (vegas-lines / vegas-manual), `market`, `side`, `p` (best American price), `b` (book), `n` (books) |
| `trent` | X post id | Trent's pick, odds, units (his units, not money), result, final_score, graded_from, `override` (dev answer, §58) |
| `prices` | market slug | `market_id`, `start_time`, `all_3h` + `day_1m`: raw Polymarket US `/v1/price-history` rows `{timestamp, longPrice, shortPrice}` (Yes / No buy prices, exactly what Polymarket's chart plots). Taken once the game is ≥ 4 h old. |
| `espn` | `<league>\|<team>` | `games`: `[{date, pf, pa, home, opp, last}]` from ESPN team schedules (`last: true` = previous season), the inputs to Analytics game history |

## Rules
- **Never** dollars, bankroll, stakes (`stake_units` is stripped), tokens, keys or secrets. `clean()` in the script drops those fields.
- Append-only: never edit or delete old day files by hand. Fix a mistake by writing a newer record.
- **Calibration join.** `analytics.key` = `<pick id>|<leg>` joins `results.legs[leg]` (outcome) and `prices` (by `market_id`).
- **Backtest.** Recompute `OurChance.blend()` with other weights from `analytics` + `espn` + `vegas`, then score with log loss / Brier against `results`.

Size: about 30 KB/day of picks/analytics/results/vegas/trent/espn + ~4.5 KB per closed market (prices). That's ≈ 2–7 MB/month at 10–40 markets/day. If it ever passes ~100 MB, move it to a `data` branch.
