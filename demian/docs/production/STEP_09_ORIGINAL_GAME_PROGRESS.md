# Phase 2 · Step 09 — original-game verification progress (2026-11-14)

## Delivery boundary

**This is NOT a completion sign-off for Step 09 or Issue #39.** Existing independent
route challenges for After Hours, Café Rush and Open World produce verified scores
for *their finite route modes only*; they do not certify the original games.
All financial prize gates for those route modes are hard-disabled by code.

### Completed pieces

| Original game | Implementation | Safety contract |
| --- | --- | --- |
| Café Rush | `CafeRushGameplayReplayVerifier` independently simulates original tickets, variation, three difficulty rules, recipe duration, expiry, VIP priority, station pickup, table delivery, combos and score. Checks monotonic timestamped position/interaction evidence against canonical FBX geometry and line-of-sight. JS original-model-to-PHP differential and negative fixtures. | **Internal-only; NOT linked to API or prize selector** until full 60Hz movement/tray fidelity and end-to-end tests pass. Sampled locomotion can diverge from the original per-frame tray risk; do not silently treat parity on a few paths as exhaustive. |
| After Hours | `AfterHoursMechanicsReplayAudit` replays original cards, power circuits, locker/relic, exit conditions and candidate scoring with geometry and timestamps. | **Audit only**, explicitly returns `shadow_verified=false` and `eligible_for_ranked=false`. Original shadow patrol/search/chase, noise and capture require independent 60Hz deterministic parity. |
| Open World | Existing `CafeRouteReplayVerifier` + client integration enforce a finite server-seeded three-checkpoint tour using FBX traversal. Original open exploration remains local and does not have a score. | Do not rank local discovery/save files. Product/operator acceptance of the finite tour and gameplay identity is a separate release gate. |

### Gates still required before closing #39

- [ ] **After Hours:** extract/version the exact 60Hz shadow/navigation AI including visibility, hearing, power light circuits, reactions, pathfinding, chasing, capture and timeout. Replay all interactions from a real client run. Exercise deterministic JS↔PHP fixtures for each difficulty, collision tampering and fake exits.
- [ ] **Café Rush:** reconcile the original 60Hz tray tilt, momentum, spill puddles, preparation and interaction physics with server state. Record authenticated input transitions rather than trusting sampled positions alone. Demonstrate differential parity over many seeds/difficulties, VIP, wrong table, three-hit combo, spills and expirations; run authorized MySQL race/performance tests.
- [ ] **Open World:** explicitly approve its finite scoring objective and source-of-truth interaction model; lock map/rules version, disallow fast travel/saves during a run and verify character movement and legitimate save-point activation end-to-end on physical devices.
- [ ] **Shared:** restore, expiration, owner binding, duplicate/idempotent completion, concurrent posts, original-score leaderboard isolation, signed rule/game version, fixture retention and latency budgets verified in CI on PHP/SQLite/MySQL and browser/PWA builds.
- [ ] **Financial integrity:** no real cafe coupon awards until anti-bot/abuse review, independent staging tests, physical in-cafe acceptance and owner sign-off. Source code checks alone cannot establish a human player or live hosting capacity.

### Validation

`vendor/bin/phpunit --filter 'CafeRushGameplayProofTest|AfterHoursMechanicsAuditTest'`  
`node tools/generate_rush_gameplay_fixture.mjs 7 standard`  
`node tools/generate_rush_gameplay_fixture.mjs 11 easy`  
`node tools/generate_rush_gameplay_fixture.mjs 8 hard`

The proof prototypes are deliberately **unregistered** in `ArcadeTurnRunService`.
No feature flag, request, or environment variable can enable them as public
ranked paths without a later reviewed change. This prevents premature weekly
reward settlement while the live score contracts are incomplete.

## Phase after Step 09

**Phase 2 · Step 10 — general Anti-Cheat**: risk signals, account/IP velocity
caps, suspicious replay evidence, audit trail, quarantine with appeal/review,
operator dashboards and incident alerting. Never auto-revoke a legitimate score
or redeemed coupon on an unreviewed heuristic alone.

Do not start financial prize rollout merely because this step's CI turns green.
