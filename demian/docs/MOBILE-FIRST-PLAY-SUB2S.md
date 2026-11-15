# Mobile first-play latency hardening — 15 Nov 2026

## Diagnosis

After Step 20 decoupled the menu from Open World startup, individual mobile games still awaited multi-megabyte character sprite transfers. The image variant previously followed GPU tier, not transfer cost, meaning a powerful phone could be forced to load ~5–8 MB Detail source PNG. Dino Run awaited two attacker atlases beyond the player's pack, and Café Rush awaited three character sheets. Safari does not support Network Information API, so network-tier hints are not reliable on iOS.

The Vite bundle is roughly 1.33MB original and 350KB gzip in the earlier CI; one atomic JS chunk is intentionally retained because stale code chunks caused 404s on Github Pages. A 245MB deployment artifact does not imply a 245MB initial network download.

## Implemented

- **Mobile first-play uses lite:** coarse pointer / touch devices fetch the pixel-art lite variant for the initial player atlas, even if GPU score rates the phone high. Desktop retains runtime/detail; Save-Data and 2G remain economical.
- **Lossless WebP release:** static export converts lite in addition to runtime/detail in the release-only copy, only if output is >=2% smaller and RGBA pixel-identical. Updates atlas image metadata, content SHA-256, and independent character manifest target. Source PNGs and gameplay animation frames are untouched.
- **Offline PWA:** the offline manifest selects the one published lite format (PNG or WebP). A missing or duplicate format aborts the build. Authenticated API and score submissions are never cached.
- **Dino Run:** startup awaits the player only. Two attacker assets hydrate with background priority after enter; a labeled visible hazard placeholder maintains collision and cue clarity while waiting.
- **Café Rush:** startup awaits the lead actor only. Staff hydrate after enter and draw bounded in-world placeholders until ready, without altering orders, collision, simulation or ranking.
- **Lifecycle:** background work checks scene ownership/disposed before applying any late result. Returning to menu aborts optional loads. Existing tier-decoded-cache budgets continue to apply.
- **Preview rail:** 12 off-screen character cards no longer all fetch their poster PNGs when a game starts. IntersectionObserver progressively loads near-visible cards, with a compatibility fallback on older browsers, and is disconnected on rerender/dispose.
- **QA:** Node regression tests for variant selection, true asynchronous artwork, fallback, PWA manifest and sprite integrity. Production static-build browser acceptance adds a cold 390×844 Chromium 4G simulation (8 Mbps, 80ms) and a 2-second tap-to-first-playable gate on Dino Run, Café Rush and Open World, while keeping existing offline, browser, mobile and backend CI.

## What the target means

The intended 2-second budget is **time from game selection to first PLAYING state** on a healthy 4G / capable phone with app code loaded. It is **not** a universal guarantee for cold site navigation or arbitrary 3G, slow CPU, packet loss, insufficient cache or iOS Safari. The lab gate is not a physical-device SLA. Real-user p50/p95 and Safari/Android device data must be gathered before a production promise, including first visible gameplay frame after PLAYING, battery, decoded image/GPU and resident memory, 15-minute mobile gameplay, orientation, PWA updates, offline packs and reconnect behavior.

No database, coupon, reward, replay, score verification, leaderboard or public API contract changes. Reverting the merge reverts all release pipeline changes without touching source art.
