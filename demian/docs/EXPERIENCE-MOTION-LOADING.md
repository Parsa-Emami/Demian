# Demian — Motion-led UX, real loading and sub-3s performance strategy

## Intent and design reference

Reference: https://60fps.design/ — a curated library of interaction and motion patterns, not a reusable product theme. The Demian design language is **original**: deep olive/forest, restrained warm champagne, tactile controls, minimal compositing-only motion, anchored typography and clear loading states. No external fonts, animation packages, photos or design-site source assets were imported.

The UI styles cover the cafe home, six-game selection rail/cards, selected-character roster, settings, pause, results, reward panels and the shared HUD. Game renderers, deterministic ticks, score calculations and cashier authorization remain untouched.

## What actually delayed loading before this change?

1. **Atomic shell JavaScript / hydration** on first visit, then per-game dynamic imports with network and parse costs. The early static menu can already paint before the engine is downloaded.
2. **Atlas + image pair** for each character. A high-detail character can require a large decoded image allocation. Preview art and lite/runtime/detail atlases have different purposes. The asset integrity handshake intentionally validates an atlas revision before loading its image; it must not be disabled blindly to hide latency.
3. **Open World initial game setup**, including art/tiles, image decoding and main-thread scene creation, takes time beyond network transfer. Sending these static assets through PHP on a shared host would often make this worse.
4. **HTTP cache misses, CDN edge geography, device decode/CPU, poor radio links**, and first-install PWA work are independent of Laravel host CPU. Extra mobile DPR increases decode work.
5. The previous loader displayed arbitrary 8/18/42/68/100% milestones, which could misleadingly imply byte progress even during a long unchanging import.

## New behavior

The centered interactive loading panel shows a continuously moving GPU-composited signal, real elapsed seconds, contextual tips the user can change, and an accessible label. The bar is **four completed stages**, never a network byte counter:

| Stage shown | Only advance after this succeeds |
|---|---|
| 0/4 | Initial UI exposed, engine requested |
| 1/4 (25%) | Dynamic JS module imported and valid game object constructed |
| 2/4 (50%) | Required asset preload promise resolved |
| 3/4 (75%) | Scene construction and game enter promise resolved |
| 4/4 (100%) | Game startSession completed; screen can be hidden |

A new loading attempt resets the stage and stopwatch; the timer is cleared on close or dispose. After eight seconds the copy acknowledges the long operation; after twenty it suggests connectivity/asset inspection without fabricating a percentage or silently reloading the page. The animated ring is decorative; the bar is text-labeled and remains meaningful under prefers-reduced-motion.

On an already loaded game instance, the module/assets/enter stages have already been completed, so the UI can start at stage 3/4 before a fresh session. No fake byte-count estimate is used.

### Safe network warmup

Only **pointer hover (non-touch)** or **keyboard focus** on an actual game card can initiate its dynamic JS import 160ms afterward. This is capped to two game modules and disabled on hidden, offline, Save-Data, 2G/3G via the existing optional asset policy. It warms code only, not all six maps or all twelve high-resolution characters. The registry de-duplicates promises and evicts failures so user clicks can retry.

The existing menu deliberately avoids downloading Open World as a decorative backdrop. The selected avatar's first paint and FPS stay independent of the PHP API.

## Hosting decision

**Moving from GitHub Pages to shared cPanel does not guarantee 3 seconds.** Prefer keeping static PWA/atlases/tiles on a geographically appropriate CDN and putting only the private Laravel API, MySQL/competition/replay verification on the shared PHP hosting. At 50 users the browser runs the games; the PHP host is sensitive to login, score verification, weekly rankings and vouchers, not local canvas draw frames.

Before migrating, obtain real resource quotas (CloudLinux EP, IO/IOPS, vCPU, memory, PHP-FPM workers and MySQL concurrency), HTTPS/HTTP2 compression and regional latency. Set long-lived immutable caching for fingerprinted chunks; give HTML/manifests/SW an update-safe cache policy; do not cache sensitive API data. Keep public asset URLs valid under the final demiancafe.ir origin and SW scope. Review content negotiation (Brotli, gzip, WebP), decoded-image memory and payload bytes, not only total transfer.

**Goal, not promise:** under controlled representative mobile network, initial menu P75 <1.5s, touch-feedback <100ms, warm game re-entry <1s, first light game P75 <3s and Open World P75 <3s where achievable. Cold first load on low-end phone or 3G may exceed these targets even with a premium host; do not show a false 3-second guarantee.

## Verification

Required CI:
- Node/unit contracts: no ticker-driven fake percentages, no unauthorized scores or network telemetry from loader, ≤2 warmed modules, Save-Data/offline no hint.
- Browser test on Chromium emulated mobile 320×568, 390×844 and 844×390: delayed import still shows **0/4** with a responsive tip action; stopwatch advances; loader centers without overflow; completed session hides it; reduced-motion disables decorative rotation.
- Existing full PHP SQLite/MySQL, game rules, replay validation, character drawing, PWA service-worker, all six games in Chromium/Firefox/WebKit, Step30 CPU×2/emulated 4G, Step31 final acceptance and release-QA gates.

**Remaining acceptance, not falsely certified by CI:** physical Android/iOS devices (cold, repeat and offline), different radio conditions, production CDN + actual domain TLS, 50-user shared PHP host DB/replay load, monitored p50/p75/p95 from real sessions. No legal policy, voucher or score calculation is changed by this UX work.

### Debugging slow first visits

Use Chrome/Firefox DevTools Performance and Network with **Disable Cache** for cold and enabled cache for warm:
- record DNS/TLS + TTFB + JS parse/evaluate, download/init of each dynamic chunk, character Atlas/PNG/WebP, decoded image size and Open World scene entry time;
- identify whether the long phase is module import, resource preload or enter/startSession from the loader;
- compare on the canonical domain (both cache warm and incognito) and the GitHub Pages deployment, on the same device/network, to avoid guessing from host marketing claims;
- treat high CPU time and excessive raster/memory as app/device work; solve with progressively loaded art rather than only moving domains;
- if API is slow, check private Step33 dashboard and cPanel worker/DB locks separately.

The custom Product Design interactive Work workflow remains distinct; this repository PR is an independently implemented code improvement based on the accessible interaction catalogue, not a claim of a pixel-faithful clone or visually approved mock.

## P1 responsive loading motion

Tune the existing visual feedback rather than introducing a second loading pipeline. The ring period changes from 2200 to 1000 ms, the heartbeat from 1050 to 720 ms and the fill transition from 250 ms width to 120 ms transform with a fixed-size RTL-origin fill. The former spinning spark rotates around its own center and contributes no useful progress signal; use a static accent instead. Stage truth, accessible values and the one-second elapsed clock remain unchanged. No minimum display time or extra animation awaits. Honor both OS reduced-motion and the in-game reduced-motion setting; use a static heartbeat on constrained/economy profiles. Stop decorative motion when leaving/hidden. The existing browser test now holds real module/preload promises to validate 0/25% independently of runner timing, tests desktop and mobile layouts, actual computed timing, reduced/economy policies, RTL geometry, first-playable frame and cleanup. Skills: project router, game-ui-ux, game-feel and performance-optimization. Canvas2D/three.js and all gameplay/ranked rules unchanged. Motion timings are design choices, not a measured gain in user-device startup latency.
