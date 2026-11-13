# Mobile-05 — Touch Controls & Mobile UI Correctness

Scope: harden existing InputRouter, TouchStick, MobileGameUI and CSS touch surfaces. This phase does **not** rewrite controls, scoring, physics, sprites or backend.

## Design and key fixes

- **One pointer per touch ownership:** the analog joystick captures its own pointer and the action router tracks each action pointer independently, allowing one finger to move and another to jump/dash/interact. One pointer release never cancels an unrelated hold.
- **Cancel is not a tap:** `pointercancel` and `lostpointercapture` clear an unconsumed one-shot press from that pointer. A normal `pointerup` retains a one-shot press until the game loop consumes it. The last remaining hold releases the action.
- **Emergency release:** window-level pointerup/cancel capture events recover from target removal or missed bubbling; `pagehide`, `blur`, `orientationchange`, `mobile:layout-changed`, existing context/sidebar changes and hidden-tab events reset all pointer/action/joystick state.
- **Safe pointer capture:** setting or releasing capture is wrapped to avoid crashing when DOM elements are removed during route/rotation. Each listener is removed on disposal.
- **Numerical stability:** joystick vector computation returns zero, never NaN, if a rapidly resizing viewport reports invalid geometry.
- **Physical orientation vs virtual keyboard:** MediaQuery physical orientation is the source of truth, not the possibly-shrunken VisualViewport dimensions. Identical layout callbacks are deduplicated so minor browser chrome notifications do not repeatedly interrupt a held stick.
- **Safe-area correctness:** preserve `viewport-fit=cover`; remap CSS `env(safe-area-inset-*)` for 90-degree rotated landscape fallback (notch/top becomes logical left). Apply insets to joystick/action groups, HUD/readout, pause toolbar and runner controls. `touch-action:none` is **only** applied to game controls; normal modals, text/roster lists and scrollable settings remain scrollable.
- **Touch hit targets:** preserve >=44 CSS px for visible action controls; 48 CSS px coarse-pointer target baseline when possible. Avoid orientation locking non-game screens or blocking accessibility zoom at document level.

## Automated tests

- `tests/js/mobile/MobileTouchIntegrity.test.js`: two independent pointers, repeated hold references, cancelled vs released button presses, capture-loss, detachment-safe reset, joystick ownership, zero geometry, and keyboard-induced VisualViewport resize with physical orientation preserved.
- `tools/check_mobile_touch.mjs`: Playwright **optimized static release** Android-like touch emulation at 390x844 and 844x390, simultaneous CDP touch events for stick+action, action-finger release without movement loss, `touchCancel` neutral state, pagehide/blur resets, forced landscape transition, target hitbox >44px and viewport containment. Reports screenshots & JSON in `docs/mobile-05/browser/`.
- Existing JavaScript tests, Motion/Character/Café static validation, Coffee Crash/Identity/Device QA browser tests, Mobile-04 network recovery regression and both Mobile-01 six-game lab profiles remain required in CI.
- PHP SQLite and MySQL backend suites remain required, although Mobile-05 does not change their code.

## Run

```bash
cd demian
npm ci
npm run test:ci
npm run validate:final
npm run build:static
npm run validate:static-assets
npx playwright install chromium --only-shell
npm run test:mobile-touch:browser
npm run test:mobile-network:browser
npm run benchmark:mobile:ci
DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
```

## Known limitations and release gates

1. Headless Chromium is **not** real Android Chrome, iPhone Safari/WebKit or a physical touch panel. The notched-device mapping requires real-device visual confirmation.
2. The 2D touch tests do not replace 15+ min real-device thermal, battery, orientation, thumb comfort and one-handed testing ([Issue #7](https://github.com/Parsa-Emami/Demian/issues/7)).
3. The nested-host font path issue remains independent ([Issue #12](https://github.com/Parsa-Emami/Demian/issues/12)).
4. Existing optional orientation lock remains restricted by the browser. Manual CSS landscape fallback is preserved, and a missing browser API is never treated as an unrecoverable error.
5. No multiplayer synchronization or weekly leaderboard behavior is touched.

## References
- [MDN: Pointer events, pointercancel and pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN: Multi-touch interaction](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction)
- [MDN: touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN: CSS env safe area](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [MDN: viewport meta](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag)
- [Mobile-first roadmap #10](https://github.com/Parsa-Emami/Demian/issues/10)
