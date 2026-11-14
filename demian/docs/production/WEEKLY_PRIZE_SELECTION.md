# Phase 7a — deterministic weekly prize selection policy

This is a pure, read-only policy component (App\Services\Arcade\WeeklyPrizeSelector). It does not write database rows, seal a period, mint/store/redeem coupons, or expose a route. It is the first tested increment of the weekly leaderboard/reward roadmap. The ranked API remains unchanged.

## Policy and inputs

- One sealed Tehran Saturday-to-Saturday period at a time. The caller must validate the period and obtain candidate rows from server-verified runs only; use one scoring rules version per game. The selector rejects rows without verified === true, but that flag alone is not proof of a legitimate run. Never pass client-submitted scores directly.
- Each game's candidates are sorted by highest score, then earliest achieved time, then stable player ID. Duplicate rows for a player in a game collapse to the player's best record.
- Allocate candidates who have not won in prior weeks first; use prior winners only for unfilled slots. One person may receive at most one prize across all games within the same week, and one game may have at most 10 recipients. Do not truncate to the top 10 or 15 before deduplication.
- For a player eligible in multiple games, choose their best technical rank; equal ranks resolve via lexicographically smaller game ID. This deterministic cross-game priority is a technical proposal pending product approval. Never compare raw scores across different games.
- technical_rank remains score-based; prize_rank is an independent 1..10 sequence within each game's award list. Empty games get no winners.
- Score and timestamp input validation is fail-closed. Timestamps are normalized to UTC.

## Remaining gates before issuing real discounts

1. Finalize discount tiers, expiry, minimum spend/caps, and the historical-winner policy.
2. Implement audited sealed-season snapshots and historical winner storage; explicitly handle valid late completions, account deletion, and retention.
3. Add transactional idempotent prize allocation, uniqueness constraints, secure code storage, one-time redemption and verified shop integration. Do not reuse the legacy CouponManagementService placeholder, which returns unconditional true.
4. Add SQLite/MySQL integration, concurrency, recovery and staging acceptance tests.
5. Server-verify each other mini-game before it participates in ranked prizes. Currently only Dino Run is ranked.

## Tests

Run vendor/bin/phpunit tests/Unit/WeeklyPrizeSelectorTest.php from demian/. CI runs the full suite on SQLite and MySQL. This increment changes no production routes, secrets or database schema.
