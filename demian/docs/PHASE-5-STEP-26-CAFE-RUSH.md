# Phase 5 / Step 26 — Café Rush acceptance

## Roadmap source

The 34-step Deep Research roadmap requires order-management gameplay, tangible interactions with drinks/customers, timed service, server-verifiable score, safe concurrent order handling, and multi-customer gameplay testing. The six-phase/34-step plan supersedes the older 20-step roadmap.

## Preserved gameplay and architecture

- Existing Canvas2D FBX café, semantic keyboard/touch/gamepad controls, clock-driven 120-second shift and accessible guide.
- Three difficulties: easy (quota 4, capacity 1), standard (quota 6, capacity 2), hard (quota 8, capacity 3).
- Deterministically scheduled tea/espresso/cake orders, prep durations, tickets, bar/pastry stations, tables 1/2, tray balance, spills and puddles, combo and bonus.
- VIP Uzudi's tea-and-espresso order starts late in the shift when capacity is available.
- Ranked protocol `cafe-rush-frames-v1`: server-issued seed, 60Hz compact input transitions, independent PHP `CafeRushFrameReplayVerifier`; **client score and local storage are never authoritative**. Ranked/prizes are disabled without environment opt-in and production acceptance.

## Step 26 changes

1. **Concurrent order priority:** `CafeRushModel.stationOrder` now selects the oldest ready order at an active station before any preparing one. This prevents a cooked item from being hidden behind an incomplete preparation. PHP replays use the same ready-first rule.
2. **Contextual objective:** `rushObjective` highlights completed pickup before a second accepted ticket. Ready food cannot be silently overlooked while customers wait.
3. **Ranked reset:** a new verified session resets elapsed HUD refresh, ephemeral message expiry, tray cue visual and old audio. The model is recreated from the server seed, with no practice-mode state carry-over.
4. **Dialog safety:** only explicit 'confirm'/'skip-guide' actions can start a new shift from the entry modal.
5. **Additional unit scenarios:** ready/preparing concurrency, correct vs wrong table, no duplicate points, VIP scheduling under full capacity and terminal score immutability.
6. **Dedicated Chromium acceptance:** four viewport/device emulations for first-frame/guide, keyboard movement, pause/resume, genuine ticket/station/serving actions, 2+ concurrent tickets, late VIP prep/delivery, quota/result, reset and terminal timeout. CI preserves JSON and screenshot evidence.

## Regression gates

| Scope | Evidence | Limit |
| --- | --- | --- |
| Server replay | PHP SQLite and MySQL full frame parity suites for seed/physics/orders/score, negative forged proof tests | Real deployed HTTPS API and credentials untested by CI |
| Multiple customers | Unit constrained queue + VIP backlog tests; browser two-or-more simultaneous orders | Timing balance across many real players needs UAT |
| Food preparation and delivery | Unit and four viewport browser interaction sequence, wrong station/table, saved local best | Practice-only browser UI checks are not competitive proof |
| Controller and mobile | Shared semantic input context, responsive HUD, browser emulation | Physical touch and hardware performance still pending |
| Performance | Full static asset policy, build and mobile CI benchmark | Real 30-minute soak/FPS/heat and battery pending |
| Security | Deterministic server simulation with server-issued seed and rate/anti-cheat backend CI | Independent red-team and production fraud simulations pending |

## Run locally / reproduce in GitHub Actions

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
npm run test:cafe-rush-step26:browser
# PHP unit/feature replay tests run separately with SQLite and MySQL CI.
```

Browser QA intentionally repositions the **practice-only** actor and clock for deterministic UI/state acceptance and NEVER submits scores to the API. Legitimate traversable movement, timed service, collision and replay parity are exercised by the separate source-model and independent PHP tests.

## Production acceptance remains open

- Real Android/iOS Safari/Chrome devices (orientation, touch interactions, fonts, screen reader, frame pacing and battery/heat under 30+ minutes).
- Live HTTPS Laravel/MySQL API, real player registration and verified replay submission, receipt on weekly leaderboard, retry/idempotency, expiry and account recovery.
- 50-user concurrent cPanel-host capacity verification, independently reviewed score fraud/red-team scenarios and offsite backup recovery (existing issues #7, #28, #44, #49).
- No discount voucher issuance enabled until those gates are passed.
