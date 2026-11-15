# Phase 5 / Step 24 — Open World acceptance

## Source of truth

The original 34-step roadmap, page 13, Phase 5 Step 24, requires:
- Free movement inside a large environment.
- Procedurally generated obstacles or items.
- Environmental resource management and dynamic loading.
- A final-score connection to the server API.
- Long-session gameplay tests, memory-leak checks and verification of submitted scores.

The existing game is a faithful FBX-baked café, not a generic randomly generated city. Its fixed layout, static physical obstacles, routes and online checkpoint proofs MUST be preserved.

## Delivered implementation

1. **Free movement:** Retain the existing top-down Canvas2D player, camera follow/overview, keyboard/touch semantic controls, interaction points, map, safe fast travel and checkpoint saves.
2. **Procedural content:** Generate at most one collision-free exploratory item per eligible chunk using an independent 32-bit seeded PRNG. Candidates are checked against the reference café rooms, persistent spawn/save points, static colliders and (when available) the navigation grid and reachable path from the entrance. Chunk handles contain only lightweight data; artwork is drawn with bounded Canvas2D ellipses on visible active chunks and culled offscreen. No new images, shaders or libraries.
3. **Local progress:** A `WorldFindCollection` only counts finds in active loaded chunks during ordinary exploration, never while the ranked route is starting, running or submitting. Count is shown on the world HUD and recorded in the existing checksummed local save. A legacy save without `finds` remains valid. This is device-local progress, not verified competitive score; client-reported items are never sent to the scoring API.
4. **Dynamic loading:** Reuse the 8-handle cap, 2-concurrent-load chunk manager and the existing abort/eviction policy. On game exit, await chunk unload and explicitly release the chunk factory and NPC simulation budget.
5. **Online ranking:** Leave `RankedRouteChallenge`, `ArcadeLeaderboardService.finishTurnRun`, Laravel `CafeRouteReplayVerifier`, authorization, verified leaderboard entries and anti-cheat untouched. The challenge uses a separate server-issued route proof, not raw client score or collected items.

## Acceptance matrix

| Area | Automated proof | Limitations |
| --- | --- | --- |
| Generation | Seed reproducibility, varied seeds, bounded count, room/path/collider clearance, stable IDs | Review visual taste on real hardware |
| Streaming | 300 sequential position changes, active/dormant culling, cap of 8 loaded and 8 renderer handles, full release on exit | Synthetic travel is not an actual multi-hour hardware soak |
| Local persistence | Saving and restoring discovered item IDs in the current checksummed save envelope; invalid IDs discarded | Checksums prevent accidental corruption, not deliberate forgery; local progress never affects real rewards |
| Ranking isolation | No local item collection during ranked route; no alteration to fixed-step route actions or backend score verifier | HTTPS staging/live end-to-end scoring and concurrent sessions require external deployment |
| Browser | Four viewport configurations; real keyboard movement, first frame, streaming/fast travel, camera, local find pickup, ranked guard and menu teardown | Mobile Chromium emulation is not a physical Android/iPhone |
| Operational | Existing SQLite/MySQL PHP replay/API suites, Mobile-11 backup/restore, mobile/PWA, build, UI-layer, performance budgets | Physical FPS/heat/battery and 50 real concurrent clients are separate acceptance gates |

## Commands

```bash
cd demian
npm ci
npm run validate:skills
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run build:static
npm run validate:static-assets
npm run validate:build
npx playwright install chromium --only-shell
npm run test:open-world-step24:browser
npm run test:mobile-touch:browser
npm run test:mobile-pwa:browser
npm run benchmark:mobile:ci
```

The new browser report is `docs/phase5-step24/open-world-browser.json`; the 390×844 screenshot is `docs/phase5-step24/open-world-390.png`. Both are CI artifacts and never published as proof of a physical phone.

### Outstanding production acceptance

- Validate movement, map, collection, input, memory and frame pacing over at least 30 minutes on a physical low/mid-range Android and real iOS Safari, including orientation changes, background/resume, low data connection and PWA.
- Provision a secure HTTPS API endpoint and use a real player to start and finish a server-verified Open World route; confirm leaderboard entry, idempotency, anti-replay, token expiry, account recovery, server-side time bounds and post-reconnect retries.
- Perform the 50-concurrent-user load test and independent anti-cheat/red-team review before enabling prizes. See existing production issues #7, #28 and #44. Do not interpret local item collection as monetary or prize-worthy achievement.

## Applied repository skills

`.agents/skills/router/SKILL.md`, `.agents/skills/procedural-gen/SKILL.md`, `.agents/skills/performance-optimization/SKILL.md` and `.agents/skills/save-systems/SKILL.md`.
