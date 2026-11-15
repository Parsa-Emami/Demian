# Phase 4 — Step 19: mobile controls, HUD and accessibility hardening

## Scope and existing architecture

Demian already exposes a shared InputRouter, two independent pointer channels
for action buttons and the virtual joystick, joystick calibration in Settings,
a context-aware gamepad/keyboard input model, adaptive HUD scaling, native
orientation lock with CSS rotation fallback, and Mobile-05 Chromium touch QA.
Step 19 hardens real failure paths without rewriting the game engine, changing
the deterministic 60 Hz simulation, or modifying score/replay/discount logic.

### Changes

1. **Pointer-scoped one-shot actions.** Unconsumed virtual presses retain their
   initiating pointer identities. A cancelled second finger must not erase a
   completed first-finger jump; two cancelled fingers cannot leave a ghost
   action; cancellation after a previously consumed press cannot remove a
   fresh unrelated press. Keyboard and assistive-technology clicks keep their
   own press source and are consumed exactly once by the existing input
   snapshot. No change to the game's semantic action names.
2. **Toggle lifecycle.** Run/duck toggles accept only one transition when
   multiple fingers are resting on the same button. Browser or OS
   pointercancel/lostpointercapture restores the pre-gesture latch, rather
   than leaving Sprint/Duck permanently stuck. Normal taps intentionally
   remain latched in toggle mode. Context changes, pagehide, blur and
   orientation reset every hold, pending press and pointer owner.
3. **Action tray lifecycle.** The optional action tray no longer auto-collapses
   140ms after pointerdown regardless of user intent. It stays visible while
   any mini-action finger is held, closes after the final genuine pointerup,
   leaves itself open on cancellation, and closes after keyboard/AT activation.
   Closing is deferred to the next task so the input router can process the
   complete release. A new gesture invalidates any scheduled close.
4. **Listener cleanup & gesture safety.** The UI now removes its contextmenu
   listener on disposal instead of leaving an anonymous callback installed.
   Context menus are suppressed only over the active gameplay canvas/touch
   controls: long-press text selection in menus, dialogs and settings remains
   available. VisualViewport scroll events are observed as well as resize
   events. Layout signatures suppress duplicate notifications but reset
   active touches on genuine coordinate shifts.
5. **Joystick and controls.** Preserve proven radial dead-zone and sensitivity
   normalization, eight-direction analog input, floating/fixed placement,
   left/right handedness, touch-action:none on gameplay controls only, and
   >=44px hit targets. Numeric inputs are clamped. Gamepad/keyboard controls
   and separate controls for Dino Run remain unchanged.
6. **HUD and Safe Area.** Final CSS pass adds safe-area-limited toolbar/HUD
   sizing, wrapping where needed, bounded scrollable mini-action tray based
   on *logical* viewport dimensions (including CSS-rotated iOS portrait),
   >=44px mini actions, visible focus indications, reduced-motion support and
   responsive 320px typography. Existing score, time, level, lives and
   per-game HUD data bindings remain authoritative and unchanged. HUD scale
   and contrast settings continue to apply.
7. **Memory lifecycle.** Pointer sets and pending-close timers are cleared on
   navigation/disposal; window, stage, orientation and viewport listeners are
   removed. No persistent timers, new polling loops or added GPU textures.

## Definition of Done

- Node regression tests verify two-finger cancellation/press provenance,
  long-held multiple contacts, toggle rollback, accessibility input,
  dead-zone stability, blocked contexts and action tray opening/closing.
- CSS contract enforces safe areas, 44px controls, focus visibility and
  balanced viewport/contextmenu listeners without disabling browser zoom.
- Existing Mobile-05 headless Chromium test is expanded: a two-finger hold on
  the optional actions tray stays visible beyond 140ms, only the last release
  closes it, the narrow **320×568** HUD/joystick/pause hitboxes fit within the
  physical viewport; portrait/landscape/forced-rotation and interruption
  scenarios still pass.
- Full JS, static release and Vite atomic bundle checks, keyboard/gamepad
  contracts, Mobile-04/network, Mobile-07/PWA, Mobile-09/offline, mobile
  mid/low hardware emulation and PHP SQLite/MySQL CI must be green.
- Test on physical Android Chrome and iOS Safari/WebKit (including a notched
  iPhone, screen reader, hardware keyboard, external gamepad, dynamic browser
  bars, pinch zoom and 15+ minutes active gameplay) before making any
  universal mobile reliability, accessibility or power-use claim.

## Explicit non-goals

- No gameplay rules, anti-cheat, scoring, seasonal leaderboard, auth,
  coupons, redemption, database, API or reward switch changes.
- No permanent 60FPS guarantee for low-end physical phones based solely on
  Chromium emulation.
- No global touch-action:none or disabled user scaling; dialogs still scroll.
- No forced reorientation of games that declare orientation:any.

## Source and verification

- Shared JS: resources/js/game/input/InputRouter.js,
  resources/js/ui/MobileGameUI.js
- CSS: resources/css/mobile-19-controls.css (last-loaded control overrides)
- Unit tests: tests/js/Phase4Step19MobileControls.test.js,
  tests/js/Phase4Step19MobileCssContract.test.js
- Browser: tools/check_mobile_touch.mjs; CI generates screenshots and
  docs/mobile-05/browser/mobile-touch-qa.json
- Run from demian/: npm ci, npm run test:ci,
  npm run build:static, npm run validate:static-assets,
  npm run test:mobile-touch:browser and both mobile performance profiles.

Rollback is an ordinary revert of the Step 19 merge; older settings remain
compatible because no persistent schema changes are made.
