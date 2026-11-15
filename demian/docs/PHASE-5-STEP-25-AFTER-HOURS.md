# Phase 5 / Step 25 — After Hours (Night Shift) acceptance

## Requirements traced to the 34-step Deep Research roadmap

1. Deliver night-shift gameplay with two shift cards, power routing and a time-limited escape.
2. Keep meaningful nocturnal hazards, stealth/noise and shadow line-of-sight.
3. Render bounded night lighting/markers without extra texture/network dependencies.
4. Submit eligible results only through authoritative 60Hz server replay, never client score.
5. Verify play on multiple screens, terminal reasons, and correct final-score bookkeeping.

## Existing implementation retained

- Canvas2D top-down FBX café; original room geometry, collision, reachable routes and 3 card layouts.
- Two difficulties (standard 5 minutes, hard 4 minutes), two cards, three circuits with exactly one unpowered section, optional relic, exit and shadow AI.
- Fixed simulation tick, explicit start/stop state, muted/reduced-motion compatible effects, responsive HUD, keyboard, touch and gamepad semantic inputs.
- Original-game evidence protocol `after-hours-frames-v1` with seed + quantized inputs, independently simulated by Laravel `AfterHoursFrameReplayVerifier` and compared against JavaScript in `AfterHoursFullFrameParityTest`.
- **No client score may authorize discounts.** Weekly prizes must remain gated until production review.

## Step 25 change set

- Reset shadow footstep accumulator, HUD interval, radio briefing and transient audio whenever a server-ranked attempt replaces a practice run.
- Keep the power selection modal open when an invalid circuit choice is rejected instead of silently dismissing it.
- Add regressions asserting terminal escape and terminal timeout cannot be changed by late interactions or new movement.
- Add `test:after-hours-step25:browser` for four Chromium viewport/device emulations: 320x568, 390x844, 844x390 and 1440x900.
- Wire browser acceptance into GitHub Actions deploy gate and publish JSON and phone screenshot as workflow artifacts.

## Automated verification

| Acceptance gate | Automated evidence | Limit |
| --- | --- | --- |
| Core gameplay | Unit paths + scoring + all difficulty/layout win routes | Test runtime, not manual playtest |
| Hazard, lighting, power | Night renderer and shadow parity tests; interactive power dialog and locked exit in Chromium | Physical night readability remains manual |
| Input and HUD | Real browser keyboard movement, responsive overlay and accessible difficulty controls | Touch hardware latency not established by emulation |
| Pause/restart/timeout | Browser clock freeze and resume; hard-difficulty persistence; restart reset; terminal timeout | Browser emulation only |
| Reward integrity | Replay parity and backend anti-cheat/API tests; browser is practice-only | Live HTTPS + real player verification required |
| Cleanup | Modal removal and no runtime page errors on return to menu | Long-session memory leak/thermal soak outstanding |

### CI and local commands

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
npm run test:after-hours-step25:browser
# Also run repository PHP arcade replay verification under SQLite and MySQL in CI.
```

### Production release blockers (not waived by a green CI)

- Physical Android Chrome and real iOS Safari: at least 30-minute play with orientation, touch, background/resume, microphone/sound disabled, accessibility zoom, frame pacing, and memory/thermal evidence.
- Configured HTTPS Laravel/MySQL API: real account creates a legitimate ranked attempt and replays real player input; audit exact score, expiry, retry, idempotency, disconnect recovery and leaderboard entry.
- Realistic 50-concurrent-player host load test, off-site backup/restore and independent fraud/threat model review before any voucher is enabled.
- See existing GitHub issues #7, #28, #44 and #49; do not close them based on Chromium emulation.

## Regression isolation

The browser script deliberately exercises **practice mode only**. Its test-only changes to actor coordinates facilitate deterministic inspection of the interactive UI; they are **never** submitted as ranked proof. Actual route traversal, collision and JS/PHP parity are verified separately in the respective unit/feature tests.
