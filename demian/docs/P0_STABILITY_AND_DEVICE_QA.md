# P0 release verification — 2026-11-11

## Blade and release gate

Laravel 13 interprets JSON-LD's `@context` as a Blade directive. The schema opened an unmatched PHP conditional, causing HTTP 500 on `/`. The schema now lives inside a verbatim block. The static exporter preserves literal blocks while rejecting unsupported directives outside them. PHP regressions cover uncached and cached homepage rendering and JSON-LD parsing; JavaScript tests cover the same template's portable static output.

Pages runs the reusable SQLite/MySQL backend matrix alongside the frontend build. Publication requires both jobs. Pull requests run the same checks without publication. Standalone backend checks include view-only branch changes, compile and lint cached views, and finish both database jobs even if one fails.

## Physical-device status

**Pending: no physical Android or iOS device has been measured in this task.** Viewport emulation is functional evidence only. CI cannot establish real-phone 60 FPS, touch-to-photon latency, resident memory or thermal stability.

Project guidance applied: local router, threejs-scene-setup and performance-optimization; existing Canvas/three.js architecture, lifecycle, semantic layers and dependency versions are retained. No unmeasured optimization is claimed.

## Capture on a phone

1. Open the release URL with `?deviceQa=1`. Record the exact release commit SHA separately with the evidence. The QA panel is absent unless explicitly enabled.
2. Expand **QA**, enter actual device model and OS/browser versions, press **شروع ثبت**, close the panel and play.
3. Record scenario labels using **ثبت مرحله**. Session, viewport and visibility transitions create boundaries so paused/hidden time does not inflate frame intervals. Game/quality changes and target 30/60 FPS are separate segments.
4. Press **توقف ثبت**, then **دانلود JSON**. The game does not upload the file. Repeat three times, cold and after sustained play.
5. Attach JSON, screenshots, multitouch/rotation video, OS memory traces and notes to the release evidence. Device identity is a tester-supplied label, not automatic proof of physical hardware.

Suggested minimum fleet (record exact available models; these have not been tested):

| Class | Browser | Required evidence |
| --- | --- | --- |
| Low/mid-range Android, 4 GB RAM | Chrome | 15-minute play, frame/input JSON, Android process memory trace |
| Recent Android, 6–8 GB RAM | Chrome | Same sequence and evidence |
| Older supported physical iPhone | Safari | Same sequence; Web Inspector and Instruments memory evidence |
| Recent physical iPhone with notch | Safari | Same sequence, safe areas and multitouch recording |

For every device: menu → all six games → menu; switch all 12 characters repeatedly; simultaneous joystick/action touches where supported; rotate both ways; background/foreground five times; pause/resume; continuous play for at least 15 minutes including the most demanding scene. Record power-saving mode, charging status, refresh rate, thermal warnings and attached debugger. Repeat final timing without a debugger.

## Measurements and proposed acceptance targets

| Metric | Interpretation / acceptance |
| --- | --- |
| Frame intervals | Successful actual game render submissions, using raw monotonic time rather than clamped simulation delta. Review p50/p95/p99, maximum, slow frames (>1.5× target interval) and estimated missed frames. Proposed stable target: p95 ≤20 ms at 60 FPS, ≤38 ms at explicit 30 FPS; slow-frame share <5%. Report fallback to 30 FPS explicitly. |
| Touch proxy | Trusted touch pointers only. Event-to-dispatch and event-to-next-render-submission include scheduling delay, but do not prove action consumption or displayed pixels. Screening target: p95 ≤50 ms. Measure true touch-to-photon separately with high-speed video; proposed target ≤100 ms. |
| Memory | `performance.memory.usedJSHeapSize` where supported is only JS heap. Unsupported Safari values stay null. Capture Android resident/PSS memory using Android Studio/Perfetto or `adb shell dumpsys meminfo <browser-process>`; use Safari Web Inspector and Instruments on a paired Mac for iOS. Compare settled resident memory across three identical game/character cycles; investigate retained growth >10% or OS termination. |
| Lifecycle | No stuck controls, lost touch capture, clipped safe areas, blank canvas, unexpected resume or lost state after rotation/background/pause. |
| Completeness | At least 15 minutes of active gameplay, all scenarios and external evidence. Review missing input samples, unsupported memory or overflow; JSON alone never returns a physical-device pass. |

Histogram percentiles have 1 ms resolution; values ≥1000 ms use the observed maximum. Histograms, queued touches (128), markers (100) and segment details (100) are bounded; overflow counts are exported. No per-frame DOM update or telemetry upload occurs. Normal gameplay does not construct the controller or register QA listeners.

## Automated checks

Run `npm run test:ci`, release validators, `npm run build:static`, `npm run validate:build`, `npm run test:coffee-crash:browser`, `npm run test:identity:browser` and `npm run test:device-qa:browser`. Device QA automation covers opt-in behavior, trusted emulated touches, actual-render sampling, pause exclusion, JSON download, four viewport sizes and disposal. Its report explicitly states `physicalPhoneMeasured: false`.

Run `vendor/bin/phpunit` on SQLite and MySQL, plus `php artisan view:cache`, PHP lint of generated views, and `php artisan view:clear`. GitHub Actions is authoritative for PHP 8.3/MySQL and final browser checks. Identify tested commit and run URLs in release evidence.
