# Phase 4 · Step 17 — Deterministic Game Loop and Runtime Hardening

## Scope and baseline

Demian already has a **single** requestAnimationFrame-powered GameRuntime, 60 Hz fixed gameplay updates, separately capped presentation (30/60 Hz), a maximum catch-up budget, battery-conscious idle gamepad polling, responsive viewport measurements and opt-in device QA. Phase 4 Step 17 builds on those components rather than adding a second game loop, switching engines or changing scoring/replay mechanics. Existing 60 Hz server replay contracts and game rules are unchanged.

### New safety and frame-time invariants

1. **Single scheduled RAF**. Every pending animation callback is identified by a monotonically increasing token. Game switch, pause, visibility hide, stop and disposal invalidate the previous token and cancel its RAF. Even a canceled callback delivered late by a browser or test harness must remain inert.
2. **Lifecycle atomicity**. fixedUpdate may synchronously finish a round, pause, change games or stop the loop. The engine debits a fixed step *before* calling game code, then re-checks the lifecycle generation after the callback. When the generation changes, no more fixed steps, update calls or render submissions run for that old game. The same rule applies to update. This prevents stale result-screen renders and score/collision changes after a completed session.
3. **Deterministic fixed-step**. Gameplay always receives dt = 1/60 independent of 30/60/90/120/144 Hz display refresh. Small timestamp round-off is tolerated near the fixed-step boundary to avoid losing a full tick to representational drift. Transient input presses are consumed only on the first fixed step in each frame, never during an interpolated-only frame.
4. **Bounded overload**. Elapsed wall time is clamped to the existing runtime cap; fixed steps never exceed maxSubSteps. If an explicitly raised budget cannot catch up, the engine discards the old backlog and emits runtime:frame-drop with droppedSeconds for diagnostics. There is no unbounded catch-up burst, and no retroactive score award during hidden/paused time.
5. **Clock hygiene**. Invalid/non-monotonic RAF timestamps cannot introduce negative time or NaN into the accumulator. A lost renderer surface clears the clock and starts from zero after recovery, without fast-forward. The fixed-step, max delta, substep and idle poll configuration are validated before mounting the visibility listener.
6. **Simulation fault containment**. An exception in input snapshot, fixedUpdate or update is **fatal to that run**. A partially mutated ranked state cannot be retried or continue producing scores. The runtime pauses, blocks resume until a fresh setGame, emits an auditable runtime:error and a safe runtime:fatal notification. GameApplication switches to pause UI and refuses resume, offering a fresh restart instead. Render failures remain recoverable; optional QA observers and disconnected-gamepad polling cannot terminate gameplay.
7. **Resource lifecycle**. Stopping, disposal and game switches remain idempotent. Disposal is terminal for that runtime instance; it cannot re-register frames/listeners or access a disposed game.

### Acceptance criteria

- New GameLoopStep17.test.js exercises 10 seconds of 30/60/120/144 Hz frame schedules and checks invariant 600 ± 1 simulation ticks, valid interpolation alpha and bounded render work.
- It tests synchronous completion/pause during a 6-step backlog, game replacement mid-step, stale canceled RAF deliveries, stop/dispose, non-finite timestamps, lost canvas, and exactly bounded dropped time.
- Fatal simulation/update/input errors stop further work; render and diagnostic failures remain recoverable; the active run cannot be resumed after fatal failure until a game reinitialization.
- Existing GameRuntime.test.js, Mobile06RuntimeEnergy.test.js, Mobile06FrameBudget.test.js, the multi-game replay verifier suite and full frontend/mobile CI must remain green. PHP SQLite/MySQL and real MySQL race suites are required as regression gates even though this change modifies no backend financial logic.
- Full static build, browser touch/device QA and mobile benchmarking must pass. Real Android/iOS GPU execution, thermal/battery measurements and touch-to-photon latency **cannot** be certified from headless CI and require separate real-device acceptance.

### Implementation boundaries

- **No second RAF game loop.** Cosmetic UI animation may have its own existing display loop, but game simulation remains in the single shared runtime.
- **No gameplay-scoring or server verification changes.** In particular, do not accelerate gameplay to compensate for a hidden tab or slow mobile device.
- **No financial activation.** The separate weekly award and coupon approval switches stay disabled by default.
- This work improves correctness and controls worst-case scheduling; it does not constitute a guaranteed 60 FPS on low-end hardware, which must be measured independently with the existing Device QA and physical-phone checklists.

## CI commands

From demian/:

npm ci && npm run test:ci && npm run validate:final && npm run build:static && npm run validate:static-assets

Browser and performance gates are covered by the repository's existing Deploy Demian mobile release workflow (Chromium/Playwright including mobile profiles). Backend verification workflow runs PHPUnit with both SQLite and MySQL.

## Rollback

All modifications are confined to the shared frontend GameRuntime/GameApplication and tests/docs. If a gameplay regression is observed in live device QA, revert the merged Step 17 commit as a unit; do not change fixed timestep or replay rules as an emergency workaround.
