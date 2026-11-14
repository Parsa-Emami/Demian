# Phase 2 · Step 09 — authoritative replay implementation & acceptance

## Scope and objective

Step 09 verifies **five additional** games beyond Dino Run. Café Critters and
Coffee Crash already have independent verifiers. This change adds original
After Hours and original Café Rush input-frame replays and strengthens the
finite Open World time trial. Free exploration has no globally comparable score.

**Implementation is versioned, server-authoritative and feature-gated OFF by
default.** The three games are **hard-excluded from coupon awards** in
\`RankedGameCatalog::supportsPrizes\` even if a legacy prize env flag is set.
Source-level simulation is not proof of human play. Do not claim public
production or cash-equivalent prize approval based on CI alone.

## Backend implementations

| Game | Verified original mechanics | Protocol | Version |
| --- | --- | --- | --- |
| After Hours | Canonical FBX circle collision and shadow pathfinding; server-created shadow patrol/hearing/visibility/investigate/chase/capture, grace, power/lit circuit, step noise, card collection, locker/relic, exit, timeout and result scoring. Original player axes simulated at a fixed 60Hz. | \`frames: [[tick,axisX,axisZ,run,interact,powerSelection], ...]\` | \`after-hours-frames-v1\` |
| Café Rush | Full 60Hz game physics and velocity, original FBX geometry, genuine station reach/LOS, seeded ticket schedule, standard/easy/hard recipe patience, preparation, VIP priority, pickup, tray risk, puddles/spills, wrong table, combo, quota, 120s end and computed score. Non-winning shifts can have legitimate *partial* scores if they served at least one order. | \`frames: [[tick,axisX,axisZ,run,interact], ...]\` | \`cafe-rush-frames-v1\` |
| Open World | Approved finite *candidate* competition: canonical entrance → counter save point → lounge save point → arcade save point. Server-issued seed and fixed order, bounded 240s proof, canonical swept FBX traversal, maximum speed, interaction distance and LOS; no arbitrary discovery/save number. Ranked UI disallows fast travel/map/quick-save, recording transient checkpoint proof instead of local saves. | \`actions: [{tick,kind,x,z,target}, ...]\` (route-specific) | \`open-world-route-v2\` |

The client records only original normalized control inputs for After Hours and
Café Rush, not claimed position, score, AI state, ticket state or tray status.
Inputs are quantized *before* local simulation, reducing JS/PHP float drift.
Server replays independent PHP game models and records an immutable evidence
hash under a DB-transactional run.

Historical \`*-route-v1\` results are not silently rewritten or merged into
\`*-frames-v1\` leaderboards. \`open-world-route-v1\` is superseded by \`-v2\`
and must be released at a season boundary.

## Server boundaries

- Authenticated ownership, UUID request idempotency, secure server seed,
  fixed rules_version and expiration, server wall-clock pacing, closed weekly
  periods, transaction locks, replay-hash uniqueness, one personal best per
  game/period/player, and 256KiB request cap.
- \`actions\` and \`frames\` are mutually exclusive. Invalid or unexpected
  event shapes, repeated/nonmonotonic ticks, floating-axis values out of
  [-1,1], and wrong version/game submissions fail closed.
- Each proof's server score is independent from any incoming \`score\` field.
  Client-only practice scores never qualify for coupons.
- Route and original gameplay modes cannot both be submitted under the
  same game/version; newly enabled modes expose \`ranked_scope\` to clients.
- Original modes are server-default **disabled** until safe staging release.
  The independent route-trial modes also remain default **disabled**.

## Validation matrix

| Test set | Expected acceptance |
| --- | --- |
| \`CafeFbxMotionParityTest\` | 1,350 source-JS-to-PHP FBX movement samples across all three games, sub-1e-5 deltas |
| \`ShadowNavigationParityTest\` | Source JS A* paths and smoothing match PHP for >30 routes |
| \`AfterHoursShadowDifferentialTest\` | Source shadow patrol/hearing/chase, 8 scenario/difficulty traces |
| \`AfterHoursFullFrameParityTest\` | Five original source-game scenarios across standard/hard, positions, score, shadow state, forged power rejection |
| \`AfterHoursEndToEndEscapeTest\` | Source model finds actual successful escape in the real shadow AI; independent PHP accepts exact frames and computes the same score |
| \`CafeRushFullFrameParityTest\` | Original JS shift score, delivery, VIP, recipe, expiry, combo, spill counts vs 60Hz PHP in easy/standard/hard and explicit spill stress |
| \`OriginalGameplayRankedApiTest\` | Authenticated successful scores, owner checks, idempotent completions, modified replay 409, early time 422, disabled flags 503, no coupon prizes |
| \`OriginalGameplayConcurrentCompletionTest\` | Actual competing independent PHP processes on MySQL/InnoDB, one DB replay, three period entries, same result; skipped on SQLite/pCNTL-unavailable runners |
| \`RankedWorldIsolation.test.js\` | Ranked-world saves and fast travel don't create checkpoint proof or alter local progression |
| \`RankedGameplayChallenge.test.js\`, \`VerifiedGameplayFrameTransport.test.js\` | Version/seed/shape, input recording and durable HTTP transport; no user-submitted score |
| Existing \`CafeRouteChallengeReplayTest\` | Open World route-v2 route/collision/score and cross-account/incomplete proofs |
| Entire \`vendor/bin/phpunit\`, \`npm run test:js\` + frontend/browser build | Regression gates across SQLite/MySQL and browser |

Test success means source-model software equivalence **for tested traces**,
not proof against automated solving. Full staging browser/device acceptance
and operator load tests must still be recorded before enabling live ranked mode.

## Flags / safe deployment

\`\`\`dotenv
DEMIAN_AFTER_HOURS_GAMEPLAY_RANKED=false
DEMIAN_CAFE_RUSH_GAMEPLAY_RANKED=false
DEMIAN_OPEN_WORLD_ROUTE_RANKED=false
DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED=false
DEMIAN_AFTER_HOURS_ROUTE_PRIZES=false
DEMIAN_CAFE_RUSH_ROUTE_PRIZES=false
DEMIAN_OPEN_WORLD_ROUTE_PRIZES=false
\`\`\`

The legacy After Hours/Café Rush route-ranked flags should remain false when
enabling corresponding original-game flags. Roll out the frontend and PHP
verifier **atomically** at a new weekly boundary, not mid-competition.
Do not enable prize-related config for any of these three games.

## Explicit anti-bot threat assessment

**Protects:** Replay tampering, seeded-version drift, client claimed score,
wall/speed teleporting, impossible route checkpoints, expired/foreign account
runs, duplicate run races, and manipulated ticket/AI/tray outcomes.

**Does not prove:** Whether a person or bot generated legal input events.
An attacker can load the public game, obtain a valid seed for an authenticated
account and simulate it deterministically. A recorded input history may be
mechanically feasible yet bot-operated. Multiple anonymous accounts, scripted
registration, account farming, stolen sessions and parallel replay optimization
remain possible. Hard-coded zero coupon eligibility is therefore intentional.
Input trace similarity, inter-arrival timing, IP/account velocity and unusual
win distributions should be risk signals for **review**, not automatic bans.

### Remaining real-world release gates

1. Deploy PHP 8.4 + MySQL 8 InnoDB HTTPS in *staging*, validate migrations,
   atomic frontend/backend releases and real cPanel worker memory/timeouts.
2. Play true ranked runs using authenticated API on Android/iOS/desktop;
   verify fixed timestep, dialog/paused input, offline proof recovery,
   accessible HUD, Open World savepoint and map interaction, and no
   client/server drift from real touch/keyboard controls.
3. Conduct explicit authorized concurrent load testing at 50 active sessions
   on the actual planned 4 vCPU/4GiB environment. Record p50/p95 latency,
   CPU, memory, payload and false rejection rates. The MySQL fork test is
   necessary but not equivalent to this provider-hosted load test.
4. Anti-bot review: independent scripted solver red-team tests, multiaccount
   abuse, token theft/reuse, rate limit behavior, replay retention and
   staff manual review/appeal runbooks. No human-presence claims from JS alone.
5. Obtain operator/product approval of the exact Open World three-checkpoint
   objective and commercial fairness; obtain explicit owner/cashier sign-off
   before enabling **any** coupon issuance.

**Coding verification and financial release approval are separate decisions.**
If external UAT or sign-off has not happened, do not report production-ready
coupons, and keep explicit release gates outstanding in GitHub.

## Next phase (only after user instruction)

**Phase 2 Step 10 — General Anti-Cheat**: persistent suspicious-run
observability, account/IP velocity signals, deduplicated evidence, human
review workflows, safe quarantines, false-positive appeal, monitoring and
incident response. Do not start Step 10 merely because Step 09 merges.
