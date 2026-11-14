# Step 09 — Verified Cafe Route Trials: After Hours, Cafe Rush and Open World

**Scope:** This introduces **finite, opt-in, server-verifiable route-trial challenges** within three games that did not previously have a meaningful rankable score. It does not retroactively verify historic local high scores or claim a full 1:1 PHP simulation of After Hours shadow AI, Cafe Rush tray/cooking/mistake scoring, or unrestricted Open World movement and saves. Those original casual scores stay unranked. Phase 2 Step 09 may only be declared fully complete when those mechanics are independently replayed and tested to approved acceptance criteria.

## Player flow

1. Play one of the three games. On the live game screen, press **شروع چالش ثبت امتیاز** in the accessible RTL mini-panel. If the API is offline or the game's ranked flag is disabled, the player remains in practice mode; nothing is submitted as ranked.
2. The backend authenticates the arcade player and allocates a unique run, server-chosen random seed, immutable rules version, canonical checkpoint list and expiry. Retrying with the same request ID is idempotent.
3. Challenge starts from the canonical location in the original game. After Hours resets to standard difficulty and the server-chosen shift card layout. Cafe Rush resets to standard difficulty and the server-chosen order variation. Open World returns to its canonical entrance without accepting previous save-game travel as proof.
4. The original client simulation continues. The challenge records actual game-engine X/Z positions every ~10 simulation frames and a checkpoint only upon the original game's real card/exit, accepted/preparing/served order or activated save point interaction.
5. Server receives the immutable bounded proof, tests authenticated ownership, rules version, started/expired state, server wall-time, monotonic simulation ticks, gaps (<=30 ticks), maximum speed (<=11.7 world units/sec with limited numeric tolerance), collision-free swept segments through the *canonical FBX floor/colliders*, physical reach (<2.25), checkpoint order and valid terminal proof.
6. Server recomputes a **route-trial score** from number of confirmed checkpoints and elapsed simulation ticks, writes a single verified replay and period-separated personal best. The client cannot submit its own score. Duplicate completed runs return the same result; altered evidence fails.

## Finite challenge objectives

| Game | Rules version | Checkpoint sequence | Time budget | Original gameplay limitation |
|---|---|---|---|---|
| After Hours | `after-hours-route-v1` | both seed-selected shift cards then escape at exit | 300s | Shadow AI and power state run in the client but are not reconstructed in the PHP route score |
| Cafe Rush | `cafe-rush-route-v1` | first two real orders: ticket, original recipe station, matching table | 120s | PHP proof validates geometry/sequence, NOT every ticket schedule, tray collision, spill and combo from local model |
| Open World | `open-world-route-v1` | counter, lounge, arcade save-point interactions | 240s | This is a new timed time trial. Free exploration, world save and free travel do not count as verified score |

The canonical collision snapshot `resources/server/cafe_geometry_v5.json` is derived from `resources/js/game/shared/cafe/FbxCafeData.js`, with FBX source SHA, 317 collider records and 523 floor rows. Tests compare these resources and generate legal routes from the real JavaScript navigation/collision engine; PHP validates those independently. An FBX geometry change MUST update both the snapshot and tests before the verifier can accept a newer layout. Do not silently swap geometry versions.

## Security / realism and rollout

Versioned per-game feature flags are **all disabled by default**, separately from the game modes already shipped:

```dotenv
DEMIAN_AFTER_HOURS_ROUTE_RANKED=false
DEMIAN_CAFE_RUSH_ROUTE_RANKED=false
DEMIAN_OPEN_WORLD_ROUTE_RANKED=false
DEMIAN_AFTER_HOURS_ROUTE_PRIZES=false
DEMIAN_CAFE_RUSH_ROUTE_PRIZES=false
DEMIAN_OPEN_WORLD_ROUTE_PRIZES=false
```

Ranked flags allow these route trials to publish verified *route scores*, NOT previous casual score records. The independent prize flags must remain off until signed physical cafe and anti-bot acceptance, including demonstrable prevention of replay scripting. **Legal path simulation is not proof a human played,** because automated agents can synthesize collision-free movement trajectories. These challenges are not suitable for cash-equivalent codes without extra fraud controls.

Do not mistake successful GitHub Pages frontend deployment for a live cPanel Laravel backend. The use of PHP-only verifier + static geometry avoids dependency on Node.js availability in cPanel. Real deployment requires host-specific PHP8.4, MySQL8, HTTPS, independent secrets, tested backups, migrations and real multiworker load validation.

## Acceptance and regression gates

1. Default-off: no public ranked leaderboard, no started run and no prize winner can arise for these games; direct arbitrary client-score POST is rejected.
2. PHP/JS schema parity: floor mask/bounds/collider count and source SHA match the canonical FBX data. Node generates legal traversals from the production JS navigation and verifies score and terminal results in PHP.
3. Security: wall teleport, speed cheat, falsified checkpoint ID, out-of-order ticks, truncated route, early completion, unknown game, expired/other player's run and malformed event structure are rejected.
4. Database: one replay per run, exactly one personal best per game/rules/period/player, idempotent retry, no cross-game rankings or silent scoring-version drift.
5. UI: real interactions only, optional opt-in and clear practice fallback; no fake score on offline/disabled API; accessible HUD on small screens.
6. CI: both MySQL8.4 and SQLite suites; frontend JavaScript, browser/PWA, production build and Mobile-11 cPanel operations checks green before merging.
7. On real staging devices: verify collision/interaction UI parity for each game and monitor false rejections, CPU and payload size under provider-authorized concurrent traffic. If stale clients are present, keep flags OFF.

## Remaining for full original-game Step 09 completion

- **After Hours:** port deterministic pathfinding/FBX shadow patrol, chase and memory; power-circuit state and card interactions, and exact escape/caught/timeout score formula into the independent PHP verifier, with JS↔PHP differential fixtures.
- **Cafe Rush:** independently simulate ticket arrival/expiry, recipe prep timing, pickup/tray balance, spills, wrong table, combos and full score—not only checkpoint travel.
- **Open World:** product acceptance is now possible for a bounded route challenge; adding any other world-score objectives needs its own explicit versioned verifier and security review.
- **Fraud/financial:** assessed anti-bot measures and physical UAT must be completed before enabling any discount-eligible game. Keep Issue #39 open until these requirements are proven.

**Truthful release status:** Additional route-trial modes implemented behind disabled flags. Original free-play scoring verification for the three games remains incomplete; do not mark the full Step 09 as done.
