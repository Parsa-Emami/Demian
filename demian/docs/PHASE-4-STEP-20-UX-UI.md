# Demian — Phase 4, Step 20: unified UX/UI acceptance

This document tracks the **UX/UI Step 20 from the 34-step product roadmap**,
distinct from the earlier performance-focused "Step 20 fast startup" release.
It is not an assertion that an automated browser is a physical Android/iOS device.

## Scope and acceptance

| Roadmap requirement | Implemented contract |
| --- | --- |
| Shared menu and score UI | Shared GameShell and GameSelectionScreen for all six currently playable games; authoritative catalog count; common pause/results/settings/leaderboard/wallet components. No copied per-game menu logic. |
| Main and end-of-game navigation | Serialized ScreenManager prevents duplicate nested dialogs; current modal alone is operable and accessible; opening/closing/restoring focus remains deterministic across pause -> settings -> pause and results -> wallet -> results. |
| Responsive layouts | Final shell-only CSS supports 320px phones, short landscape, logical rotated viewport sizes, safe-area padding, long Persian labels, scrolling modal content and minimum 44 CSS px targets. |
| Usability and accessibility | Visible Tab/Shift+Tab trapping in dialogs; disabled/inert background; focus return; live region announcing only navigation changes rather than all DOM updates; semantic progressbar percentage and meaningful game-launch labels. |
| Motion and feedback | Existing AnimationService transitions, progress UI, loading feedback, toasts, disabled button states and existing reduced-motion setting preserved. Final stylesheet respects prefers-reduced-motion, prefers-contrast and forced-colors. |

## Architectural boundaries

- Scope is frontend shell, CSS and accessibility behavior only.
- There is **no change** to fixed 60Hz gameplay, game rules, deterministic
  replay, player identity, weekly scoring, rewards, coupons, backend APIs,
  database schema, offline PWA or hosting flags.
- New shell CSS loads **after** Mobile-19 and existing game styles.
- Use existing UI-layer tokens; do not introduce free-form z-index numbers.
- Modals do not manipulate the game's runtime or global document focus
  outside their lifecycle. Focus restoration is constrained to the next
  active screen.

## Automated verification

From `demian/`:

```bash
npm ci
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run build:static
npm run validate:static-assets
npm run validate:build
npm run test:fast-loading:browser
npm run test:mobile-touch:browser
npm run test:mobile-pwa:browser
npm run test:mobile-network:browser
npm run test:mobile-09:browser
npm run benchmark:mobile:ci
```

The new `Phase4Step20UxAccessibility.test.js` tests screen-modal
isolation, stacked modal focus, tab wrap, accessible loading and catalog
semantics, CSS import order, minimum hit targets and reduced-motion rules.
The existing CI workflow executes the JS suite and browser/mobile build gates.

## Manual device and usability gates (not claimed from CI)

1. Verify cold and warm menu, game picker, pause, nested settings, resume,
   results, leaderboard and wallet on Chrome Android and Safari iOS.
2. Using physical keyboard, switch assistive technology and screen reader,
   confirm Tab cycle never escapes the top dialog; closing it returns focus to
   its invoking control; the background cannot be activated.
3. Verify Persian text, 200% browser zoom, 320 CSS px viewport, notch and
   landscape orientation, and non-clipping at safe-area edges.
4. Verify system reduced motion and app reduced motion, high-contrast mode,
   color distinguishability and focus visibility.
5. Play each of the six games on real phones; verify pause/resume and
   game-complete screen overlays do not block necessary controls. Record
   screenshots, short videos, OS/browser/device and the exact tested SHA.
6. Record actual WCAG 2.2 AA audit results; automated contracts alone do
   not establish a full WCAG conformance claim.

External issues #7 and #28 remain open until physical device and production
API evidence is provided. Financial eligibility flags remain disabled.
