# Step 09 (Phase 2) — Server-Verified Replay Rollout

## Scope and truthful implementation status

The roadmap requires independently verifiable scores for **five games beyond Dino Run**. Café Critters and Coffee Crash are already backend-replayed. After Hours and Café Rush now include **new versioned original-game 60Hz input replayers** (shadow AI, power and original cards; full tray/ticket/spill physics respectively) with authenticated, fail-closed API integration. Open World uses an explicit finite three-checkpoint time trial, `open-world-route-v2`, not unrestricted exploration. **All new ranked modes remain disabled by default. None of these three games is eligible for financial coupon awards.** Full physical staging/anti-bot/operator acceptance is separate from implementation.

| Game | Status | Evidence / limitation |
| --- | --- | --- |
| Dino Run | Existing production-tested verifier | Fixed-tick physics, runner replay with server-generated seed |
| Café Critters | Implemented, gated OFF by default | Every valid action (`select`, `invite`, `next`), 3 canonical guests, server-generated rotation, strict ticks and terminal proof; standard difficulty only |
| Coffee Crash | Implemented, gated OFF by default | Server-issued seed, actual 7x8 board, xorshift32, swaps, cascades, specials, undo, score and level-1 terminal proof; PHP scorer compared with real JS model across multiple seeds |
| After Hours | **Original 60Hz PHP shadow/gameplay verifier implemented, OFF by default** | Source JS vs independent PHP AI/navigation/physics parity; verified authentic escape, signed version `after-hours-frames-v1` and authenticated ledger replay. Unranked until staging approval. |
| Café Rush | **Original 60Hz PHP ticket/tray/score verifier implemented, OFF by default** | Original source JS vs PHP parity in three difficulties, versioned `cafe-rush-frames-v1`, authenticated score recording and duplicate protection. Live UI and financial UAT pending. |
| Open World | **Finite time-trial v2, OFF by default; exploration remains unranked** | Three physically ordered save-point interactions, swept FBX movement and LOS, bounded ticks, locally saved progression / fast-travel isolated from ranked trial. |

## Server-authoritative contract

- Client requests `POST /api/v1/arcade/turn-runs` with its game ID, new request UUID and version. The API authenticates the arcade bearer, verifies game-level rollout approval and server weekly period, issues immutable server seed / run ID / expiration and supports exact start retry.
- Client submits `POST /api/v1/arcade/turn-runs/{run}/complete` with bounded `ticks` and strictly one of `actions` (route/turn games) or compact normalized `frames` (original After Hours/Café Rush). The server verifies owner, game/version, status/expiry, time elapsed and every action using its independent verifier, recomputes the score, persists proof under `arcade_replays`, and atomically updates per-game daily, all-time and weekly personal bests. A different replay on the same run receives HTTP 409.
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

## Step 09 engineering completion and production boundary

The original After Hours shadow/score engine and Café Rush 60Hz tray/ticket
simulations now have independently versioned PHP verifiers and corresponding
recorded frontend input transports. Open World has a finite v2 objective,
default-disabled with no local save/teleport score sources. See
`STEP_09_ORIGINAL_GAME_PROGRESS.md` for exact tests, external UAT gates and
anti-bot limitations.

Do not enable live ranked flags or vouchers merely because CI is green.
The standing verification boundary remains: authentic physical-device UAT,
50-user host-specific concurrency/latency acceptance, operator fairness approval
for Open World and independent bot/fraud review have not been certified by
source-code tests. All three financial prize gates are hard-locked FALSE.

## Next phase after finishing Step 09

**Phase 2 · Step 10 — General Anti-Cheat.** Once all five original-game replay verifiers are complete and their tests pass: add audited suspicious activity reports (`CheatReports` or existing equivalent), bounded per-account/IP velocity detection, anomaly scoring with documented false-positive policy, controlled quarantine and review/appeal workflows, replay evidence retention, abuse dashboards, rate limits and incident alerts. Never auto-revoke a verified score or real coupon on an unreviewed heuristic alone.

**Step 09 exit criteria (still unmet):** headless deterministic original-game rules for After Hours and Café Rush with JS/PHP parity across difficulties; an explicitly product-approved finite original Open World competition; replay invalidation and concurrency tests; QA and authorized anti-bot acceptance; operator approval before enabling financial prizes. GitHub Pages publishing a frontend is NOT proof of live Laravel hosting, real MySQL production acceptance, or anti-bot fairness.
