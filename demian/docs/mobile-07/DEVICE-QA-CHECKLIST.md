# Mobile-07 / Issue #7: physical-device acceptance protocol

**Status: pending actual devices.** Automated emulation must never be labeled physical certification. The release already provides opt-in `?deviceQa=1`, frame interval / input / JS CPU-work capture, but physical battery and GPU memory are not measurable from GitHub Actions.

## Evidence matrix (attach to Issue #7)

| Device | Browser | Scope | Evidence |
|---|---|---|---|
| Android low/mid 4GB | Chrome | all six games, 12 characters, 15min | QA JSON ×3, Perfetto/PSS, battery, screen recording |
| Android recent 6–8GB | Chrome | same | QA JSON ×3, Perfetto/PSS, battery |
| iPhone older supported | Safari/WebKit | same | QA JSON ×3, Web Inspector/Instruments, video |
| iPhone recent/notched | Safari/WebKit | same + safe areas | QA JSON ×3, safe-area/rotation video, Instruments |

## Exact procedure

1. Record tested **commit SHA**, deploy URL, device model, OS, browser and version, available RAM, display refresh rate, charging/power saver/thermal state. All measurements must reference a single deployed release and a date.
2. Cold-open URL at both root and subpath (if production uses a subpath); confirm text uses self-hosted Vazirmatn (font Network tab has no 404) and icon/manifest/PWA installation work.
3. Open `?deviceQa=1` and start capture. Run all six games, including at least 15 consecutive minutes of the busiest scene; do three separate repeated sessions. Save local JSON, no automatic upload.
4. Test 12-character switching, both orientations, keyboard open/close, two-thumb joystick+action, `pointercancel`, pause/resume and **five background→foreground cycles**. Test physical iOS notch and Safari bottom controls; any stuck input or clipped button fails.
5. Switch network among Wi-Fi/mobile/offline during optional image loading. Confirm PWA shows the explicit offline screen rather than a broken page on cold navigation; reconnect without losing local settings. **Never** expect offline verified leaderboard submission.
6. Inspect p50/p95/p99 frame intervals and missed frames, trusted-touch event-to-render submission proxy; separately film true touch-to-photon latency. Inspect Android native/PSS and iOS Instruments **outside JavaScript heap**.
7. Attach screenshots/video, full QA JSON, memory timeline, thermal state and battery consumption recorded by OS tooling, plus reproducible defects to Issue #7. If benchmarks show p95 >20ms on a claimed 60fps device or persistent memory growth >10% over repeated cycles, do not close.

## Automated work already available

The CI executes 320×568, 390×844, 844×390, 1440×900 viewport Device QA and mid/low six-game benchmark. Mobile-07 adds root/nested PWA/font/offline/reconnect browser checks. All such evidence is tagged **emulated** and not used to close Issue #7.

The acceptance gate may be closed only after *all* required physical-device evidence and unresolved failures are reviewed by the owner.
