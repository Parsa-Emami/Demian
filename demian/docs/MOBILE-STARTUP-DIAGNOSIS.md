# Mobile Startup Performance Diagnosis — real-device protocol

## Scope

This step measures and compares startup/network/CPU/image-decode/game-lifecycle
performance **without changing game rules, scoring, sessions or cache policy**.
The browser instrumentation is off by default. It is strictly local, stores
samples only in memory, and exports a sanitized JSON on deliberate user action.

Open the deployed site with the query parameter `?startupQa=1` and expand
**Performance QA** in the lower-left corner. The diagnostic is not a benchmark
certification: `physicalPhoneVerified: false` remains false even when the
user runs it on a real phone, since no hardware attestation is possible.

### Exact measurements and limits

| Report path | Meaning | Caveat |
|---|---|---|
| `page.navigation` | DNS/TCP/TLS, TTFB, response, DCL/load from Navigation Timing | Unsupported timing may be null; local navigation may have zero phases |
| `page.paint` | FP/FCP/LCP where supported | Safari may omit LCP and long-task entries |
| `page.menuReadyAtMs` | Time since navigation to JavaScript menu-ready event | Includes navigation and hydration, not paint confirmation |
| `page.menuBootMs` | App `boot()` wall duration | Does not include JS download/evaluation |
| `page.javascriptParseEvaluateMs` | Always null on-device | Browser Web APIs cannot independently measure V8 parse/evaluate |
| `network.byCategory` | Per-class request count, transfer/encoded/decoded bytes and durations | Zero transfer bytes is NOT proof of HTTP cache; cross-origin TAO may hide values |
| `longTasks` | Main-thread Long Tasks and blocking over 50 ms | Unsupported API -> no samples; not equivalent to whole JS CPU |
| `gameStarts` | Module import, preload, scene entry, session-start and rendered-frame-submission timings | First render submission is not physical first displayed frame |
| `characterImages` | Image download-to-onload and `image.decode()` duration, dimensions, variant | Image loader coverage, not all canvas/GPU uploads |
| `environment` | Viewport, DPR, PWA standalone display mode, SW control and network hint | Browser-dependent, not device verification |

**Cold/Warm:** The Web Performance API cannot prove a cleared HTTP cache.
Label each JSON externally as cold (new browser context / cleared site storage)
or warm (normal reload or same-origin revisit). Avoid clearing the live PWA's
storage if offline assets, user progress or installed state matter.

### Physical phone matrix (external acceptance)

1. Android Chrome: first visit over Wi-Fi and mobile data, then reload with
   warm cache. Export two JSON files. Repeat with Battery Saver / low-end
   Android if available.
2. iOS Safari: same cold/warm protocol. Unsupported metrics remain null.
3. Installed PWA: launch the actual installed icon (standalone display mode),
   add `?startupQa=1` inside the app's own navigation scope and export the
   report. Verify `environment.standalonePwa` and
   `environment.serviceWorkerControlled`.
4. In each run, start **every game** once (including Open World), return to
   menu and launch again; inspect the first and second entries for module,
   preload, scene and first-render times. Test character switching separately.
5. Test a slow 4G connection, offline recovery, and a 15-minute loop for
   stutter/thermal behaviour. The current exported JSON cannot measure
   battery power, GPU memory or physical touch-to-photon delay.

Do not send user/account data, URLs or API credentials as part of a report.
The exported JSON contains only categorized aggregate performance and generic
device capability hints. It is *not* uploaded automatically.

### Automated CI acceptance

- `npm run test:ci`: privacy, timing, unsupported API and lifecycle unit tests.
- `npm run build:static`, `npm run validate:static-assets`: production build, release and PWA contract.
- `npm run test:startup:browser`: cold/warm browser sessions, six games, resource
  categorization, first render, local JSON export and service worker status.
- The existing `benchmark:mobile:ci` captures Chromium CDP `ScriptDuration`,
  `V8CompileDuration`, `TaskDuration`, decoded JS heap, cold/warm and
  throttled mobile frames. Unlike a browser report, CDP is a lab-only probe.
- Existing device-qa, PWA and browser compatibility tests remain mandatory.

Never claim an on-device P75/P95 or a fully validated mobile score until real
Android/iOS and actual hosting measurements are supplied. The CI lab only
establishes that instrumentation and game regressions pass.
