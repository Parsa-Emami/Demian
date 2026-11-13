# Mobile-06 — Rendering, Frame Pacing & Battery-Aware Lifecycle

This release strengthens the existing Canvas2D renderer and 60 Hz fixed-step game runtime. It does **not** replace the engine, promise an FPS number on phones, change score calculations or introduce background polling.

## Delivered

### 1. Stop inactive animation loops

- The shared `GameRuntime` **cancels pending requestAnimationFrame** on `pause()`, does not schedule frames while paused or while the tab is hidden, and restarts exactly one RAF on `resume()`.
- `resume()`, `visibilitychange` and `stop()` discard stale simulation accumulator and timestamps. Returning after a long background interval cannot fast-forward gameplay or trigger catch-up spikes.
- A rendering error continues to be recoverable. `start()` and `resume()` are idempotent.

Browsers usually pause RAF when tabs are hidden, but not when an app is merely in a paused menu. Explicit cancellation prevents useless callback work in the latter case.

### 2. Low-cost idle presentation

- `FrameRatePolicy` separates the **60 Hz fixed simulation** from the **presentation cap**: menu/boot/loading renders are capped at 30 Hz. Active gameplay respects the saved `30`, `60` or adaptive `auto` preference.
- Paused/result sessions submit no game frames because of the runtime lifecycle guard, not merely a 30 Hz cap.
- The existing `RenderQuality` still adapts pixel ratio, pixel budget and render rate after sustained slow frames; user-selected quality and frame rate are never silently rewritten.
- Game start restores the preferred gameplay cap without changing elapsed simulation time.

### 3. Eliminate per-frame layout reads

- With ResizeObserver, `RendererService.ensureSize()` reuses cached viewport dimensions and Canvas2D backbuffer geometry. It no longer runs `clientWidth` / `getBoundingClientRect` on every frame.
- Dirty layout, DPR changes, explicit resize and the no-ResizeObserver fallback still trigger a real size check. No backbuffer resolution or art-quality ceilings have been raised.

### 4. Evidence rather than invented battery results

- The existing opt-in `?deviceQa=1` module additionally records a bounded `frameCpuWorkMs` distribution (JavaScript wall time per game RAF callback).
- Production users incur **no additional per-frame timing calls**; the observer is attached only in QA mode.
- This measures neither GPU execution time nor energy use. Thermal and battery measurements require real phones.

## Automated acceptance gates

- New `Mobile06FrameBudget.test.js`: idle/gameplay rate selection, ResizeObserver fast path and missing-observer fallback, QA distribution bounds and consent.
- New `Mobile06RuntimeEnergy.test.js`: pending RAF cancellation, no hidden/paused wakeups, single resume scheduling, no catch-up after background, 60 Hz fixed simulation under 30 Hz presentation, and QA callback failure isolation.
- Existing Device QA browser flow now asserts 30 FPS menu cap, nonzero opt-in CPU samples and no pending RAF after pause in 320×568, 390×844, 844×390 and desktop profiles.
- All previous tests remain in CI: core JS tests, art/character/asset validators, build/atomic export, identity, Coffee Crash, Device QA, Mobile-04 network, Mobile-05 touch, both mid-tier and low-end six-game benchmarks, and SQLite/MySQL PHP API tests.

## Intended execution

```sh
cd demian
npm ci
npm run test:ci
npm run validate:final
npm run build:static
npm run validate:static-assets
npx playwright install chromium --only-shell
npm run test:device-qa:browser
npm run test:mobile-touch:browser
npm run benchmark:mobile:ci
DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
```

## Limits and follow-ups

1. **Headless Chromium is not a physical phone.** It does not supply real GPU power, temperature, battery drain, iOS WebKit timing, or touch-to-photon latency.
2. Menu redraw rate and JS callback count can be asserted; energy savings must be measured independently on Android/iOS hardware.
3. Physical-device QA remains open: [#7](https://github.com/Parsa-Emami/Demian/issues/7).
4. Hosting under a nested path still requires the independent font URL fix: [#12](https://github.com/Parsa-Emami/Demian/issues/12).
5. The existing dynamic DPR/quality budget already handles coarse quality scaling. This phase changes **when** sizing work happens, not the authored sprite fidelity or source art.

## References

- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
