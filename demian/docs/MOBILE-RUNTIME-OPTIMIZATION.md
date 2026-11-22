# Mobile Runtime Optimization — Step 3

## Scope and safety invariants

This step targets CPU/DOM allocations, long-session memory growth and Open World streaming while **preserving all deterministic fixed-step gameplay**. Existing GameRuntime remains 60 Hz fixed simulation, with bounded catch-up steps; ranked scoring, challenges, server-side replay, collisions, input processing, and result submission are unchanged.

### Changes

| Component | Change | Why |
|---|---|---|
| Open World UI and studio summaries | `UiFrameBudget`: mobile coarse pointer 10 Hz, desktop 15 Hz; immediate first update | Avoid rebuilding minimap, HUD DOM and studio status at 60 Hz. World, actor movement, ranked timer, and renderer still update continuously. |
| Open World ChunkManager | Reuse a frozen active-chunk ID snapshot, invalidate on load, unload and tier transitions | No repeated array allocations/filtering twice per render cycle. Keep active-radius and eviction policies unchanged. |
| Open World static Canvas cache | Tier-specific target for optional offscreen overscan: performance 950k px, balanced 1.6M px, high 2.2M px | Reduce decoded bitmap lifetime on constrained phones. The actual backing buffer cannot be smaller than the viewport; these values are *target overscan*, not total GPU allocation limits. |
| Device QA | Opt-in 30-second windows for up to 30 minutes, p50/p95 frame-submission interval, CPU callback work, JS heap, estimated sprite-cache bytes, max loaded chunks | Detect sustained stutter and trends without unbounded trace storage or added instrumentation to normal gameplay. |
| CI | Node contract/stress tests, all-six-game browser soak, 18 streaming teleports, existing 12-character artwork QA and PWA/Game QA | Verify performance path does not break lifecycle or ranked logic. |

## Running on a real phone

1. Open the *actually deployed* version with `?deviceQa=1`. For an installed PWA, navigate to the same in-scope URL from the installed application; do not assume the test of a standalone browser verifies an installed PWA.
2. Expand QA, enter device model and scenario, choose **شروع ثبت**, then close the panel.
3. Play each of six games, including multiple character switches and Open World exploration, for at least **15 minutes**. Exercise portrait/landscape and background/foreground. A separate 15-minute Open World run is recommended for thermal and long-lived cache behaviour.
4. Reopen QA, choose **توقف ثبت**, then **دانلود JSON**. `runtimeSoak` includes 30-second windows, p95 latency, work-over-budget, heap and sprite estimates. Compare early/middle/late windows under the same device, settings, network, and location.
5. Compare against the pre-change main build on the same device if a baseline artifact exists. The CI headless Chrome run is not a valid substitute for touch-to-photon, battery, thermal, native RAM or actual mobile GPU measurement.

## CI gates and evidence

- `npm run test:ci`: UiFrameBudget, 18-minute synthetic-clock trends, Open World chunk-snapshot semantics, fast-teleport churn and existing fixed 60 Hz tests.
- `npm run build:static`, `npm run validate:build`, `npm run validate:static-assets`: no missing assets or broken release.
- `node tools/check_mobile_runtime_soak.mjs`: same-source Chromium viewport emulation; six real game launches, fixed-length render samples, 18 Open World transfers, memory/chunk budgets and browser errors. Artifact `mobile-runtime-soak`.
- Full CI includes phase 4/5/6 six-game browser QA, rendering/audio, twelve character artworks, offline PWA, multiple browser engines, SQLite/MySQL and Mobile-01 mid/low phone emulation.

**Caveats:** 18 minutes in the synthetic unit test means virtual clock time, *not* an 18-minute physical test. Real on-device 15-minute thermal acceptance is an external gate and is not claimed by GitHub Actions. A lower average frame duration in one CI run alone cannot prove a speedup due to CI hardware variability.

## Acceptance criteria

No exception, lost ranked tick, mismatched score or orphan chunk handles. Open World memory:
`ChunkManager.stats().loaded <= maxLoadedChunks` and `chunkRenderer.handles.size <= maxLoadedChunks` under sustained teleports. Frame sampling remains bounded: at most 60 windows (30 minutes at 30s each). Existing sprite cache stays capped by its tier policy; `cacheBytesEstimated` is **not** total process/GPU memory.

A failure in any mandatory test blocks merge. The unchanged original atomic-build main remains the fallback until CI passes.
