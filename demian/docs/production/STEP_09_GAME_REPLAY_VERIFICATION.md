# Step 09 (Phase 2) — Server-Verified Replay Rollout

## Scope and truthful implementation status

The roadmap requires replay/score verification on **five games beyond Dino Run**. The original-game scoring milestone is still **2/5**: Café Critters and Coffee Crash have deterministic server verifiers. A subsequent commit added **three separately labeled, bounded route-trial challenges** for After Hours, Café Rush and Open World. Their independent route results do **not** verify the original games' scores, and this phase is not complete. Games without an end-to-end deterministic verifier MUST stay unranked and must not enter the weekly coupon selection.

| Game | Status | Evidence / limitation |
| --- | --- | --- |
| Dino Run | Existing production-tested verifier | Fixed-tick physics, runner replay with server-generated seed |
| Café Critters | Implemented, gated OFF by default | Every valid action (`select`, `invite`, `next`), 3 canonical guests, server-generated rotation, strict ticks and terminal proof; standard difficulty only |
| Coffee Crash | Implemented, gated OFF by default | Server-issued seed, actual 7x8 board, xorshift32, swaps, cascades, specials, undo, score and level-1 terminal proof; PHP scorer compared with real JS model across multiple seeds |
| After Hours | **Route-trial verifier only (OFF by default); original game UNVERIFIED** | Separate FBX-collision route challenge exists, but the original shadow AI, power state, cards, physics and difficulty-specific scoring are not reconstructed |
| Café Rush | **Route-trial verifier only (OFF by default); original game UNVERIFIED** | Separate station-route challenge exists, not the original orders, ticket schedule, preparation, tray physics, spills and combos |
| Open World | **Route-trial verifier only (OFF by default); original exploration UNRANKED** | Independent finite three-checkpoint challenge exists; unrestricted exploratory progress is never accepted as a score-bearing round |

## Server-authoritative contract

- Client requests `POST /api/v1/arcade/turn-runs` with its game ID, new request UUID and version. The API authenticates the arcade bearer, verifies game-level rollout approval and server weekly period, issues immutable server seed / run ID / expiration and supports exact start retry.
- Client submits `POST /api/v1/arcade/turn-runs/{run}/complete` with only bounded `ticks` and an ordered event history (`actions`). The server verifies owner, game/version, status/expiry, time elapsed and every action using its independent verifier, recomputes the score, persists proof under `arcade_replays`, and atomically updates per-game daily, all-time and weekly personal bests. A different replay on the same run receives HTTP 409.
- Public leaderboard paths `GET /api/v1/arcade/leaderboards/{cafe-critters|coffee-crash}` are hidden (404) unless the corresponding feature flag is enabled. `/api/v1/arcade/games` advertises ranked only when the game's flag is on. Scores from client-side practice games are not accepted.
- The winning model is strictly server-backed; no submitted score, localStorage number, screenshots, cookies or user-controlled seed can create a ranked result.
- Separate `rules_version` per game so archives and historical scores are never silently rescored with a different model. Existing Dino Run and coupon/weekly tables are unchanged.

## Rollout flags (both default FALSE)

DEMIAN_ARCADE_CRITTERS_RANKED_ENABLED=false
DEMIAN_ARCADE_COFFEE_RANKED_ENABLED=false
DEMIAN_ARCADE_CRITTERS_PRIZES_ENABLED=false
DEMIAN_ARCADE_COFFEE_PRIZES_ENABLED=false

**Prize flags are separate from ranked verification flags.** A game can have a verified
weekly score and a complete settlement snapshot without being selected for financial
coupon rewards. `WeeklySettlementService` filters the award selector using
`RankedGameCatalog::supportsPrizes`, not merely `supportsRanked`.

Never turn these on merely because a CI run is green. On first enable, both the browser build and PHP verifier version must be deployed together, and the commercial operator must sign off on their fairness and prize eligibility. Do NOT switch the gate off while a week containing that game's verified records remains open/awaiting settlement, or the fail-closed weekly seal may abort; coordinate a versioned rollout at a season boundary.

## Threat model and limits

- Replay is a **server recomputation** of deterministic game rules; it does NOT prove a human was at the keyboard. A script could solve Café Critters from public fixed answer data. Adding a server seed alone does not solve botting if all challenges are public. No cash-equivalent prizes should use these games until challenge design and bot mitigations are independently assessed.
- Initial Café Critters uses the existing `standard` difficulty with three guests and 240-second cap; it is not a verifier for old local unlocked albums or other difficulties.
- Initial Coffee Crash uses level 1 and replayed actions; other levels are practice, never submit arbitrary high score.
- Server action/event caps, strictly monotonic event tick indices, run expiry, owner checks, completion wall-time checks, request throttles and DB unique indexes reduce accidental/deliberate invalid submissions. They do not prevent coordinated or scripted gameplay. Production prize enablement requires server challenge secrecy/freshness, per-account abuse detection, monitoring and verified multiworker tests.
- Verified replay retention follows existing arcade policy. An auditor must not issue coupons when origin evidence/rules are inconsistent.

## Staging differential acceptance

1. Deploy PHP 8.4 + MySQL 8 InnoDB staging with HTTPS and migration compatibility. Keep all reward/weekly seal flags off until approved.
2. Execute `vendor/bin/phpunit` on SQLite and MySQL and JS tests; run `node tools/generate_coffee_replay_fixtures.mjs` from `demian/` and verify PHP/JS score parity for 8+ seeds. Lock model versions, prove failure on altered swap, wrong guest, out-of-order ticks and duplicate run completion.
3. With flags OFF confirm both turn-run POSTs return 503, both public leaderboards return 404, catalog marks unranked; direct submissions for After Hours, Café Rush, Open World return validation failure and cannot write ledger records.
4. With flag ON in *staging only*, play one Café Critters standard match and one Coffee Crash level 1 match on both mobile and desktop; verify server score, no rewards for discarded practice runs, idempotent retry after lost connection and no duplicate weekly personal best.
5. Validate real wall-clock pacing, expired run behavior, account revocation, closed weeks, server restart, DB lock races and actual budget/latency under realistic authorized traffic.
6. Perform anti-bot design review before moving to financial prizes. Document sign-off, release SHA, challenge rules, monitoring and actual cashier redemption implications.

## Remaining Step 09 work

**After Hours**: extract a headless authoritative rules core shared with/rendering-independent client; port collision/navigation, shadow AI and switch state to deterministic server replay. Use seeded map, bounded tick inputs and differential fixtures.

**Café Rush**: extract deterministic ticket creation, station processing, tray physics, collisions and timing; verify server replay with deterministic seed and input protocol; test spills, VIP, score combos and insufficient-time cheating.

**Open World**: product sign-off for a bounded competitive objective first; separate offline exploration progress from verified timed challenge; implement finite world state, signed seed and server challenge replay before eligibility.

Status is incremental: **2/5 original-game verifiers implemented behind disabled rollout gates; 3/5 original-game verifiers remain outstanding**. The additional route-trial modes do not close Issue #39. Route trials expose `ranked_scope: route-trial` in the public game catalog. Their financial prize eligibility is **hard-coded FALSE**, even if a legacy `DEMIAN_*_ROUTE_PRIZES` environment flag is set. This invariant must remain until original-game parity, abuse review, physical UAT and explicit commercial release approval.

## Next phase after finishing Step 09

**Phase 2 · Step 10 — General Anti-Cheat.** Once all five original-game replay verifiers are complete and their tests pass: add audited suspicious activity reports (`CheatReports` or existing equivalent), bounded per-account/IP velocity detection, anomaly scoring with documented false-positive policy, controlled quarantine and review/appeal workflows, replay evidence retention, abuse dashboards, rate limits and incident alerts. Never auto-revoke a verified score or real coupon on an unreviewed heuristic alone.

**Step 09 exit criteria (still unmet):** headless deterministic original-game rules for After Hours and Café Rush with JS/PHP parity across difficulties; an explicitly product-approved finite original Open World competition; replay invalidation and concurrency tests; QA and authorized anti-bot acceptance; operator approval before enabling financial prizes. GitHub Pages publishing a frontend is NOT proof of live Laravel hosting, real MySQL production acceptance, or anti-bot fairness.
