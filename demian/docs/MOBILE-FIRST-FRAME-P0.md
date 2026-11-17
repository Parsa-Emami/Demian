# P0 tap-to-playable-frame startup

Base main: 3df408f8d0621620b6a7cce44e8d2db7a89ccf4b. Applied project-local router, performance optimization and three.js scene setup (three 0.185.x; existing Canvas2D renderer retained).

Measured baseline GitHub Actions run 44018513717 (old sequential mixed-cache CPU x2 / 8 Mbps/80 ms test): coffee-crash 505 ms, dino-run 1310 ms, after-hours 348 ms, cafe-rush 1245 ms, cafe-critters 232 ms, open-world 1519 ms. These legacy timings are NOT a matched first-render baseline or a real-phone measurement.

Changes:
- Import the selected game's versioned module as soon as an explicit launch starts, overlapping critical sprite work and screen transition. Reuse the exact module promise, do not silently double-retry a failed explicit import. Bounded intent prefetch for a mobile press on a launch button, respecting network and existing two-module cap. Main Continue prewarms only Open World.
- Maintain the existing revision-checked atlas/image handshake and critical pack policy; do not fetch unvalidated image URLs, skip ranking authentication or remove authoritative collision/game rules. The optional Open World NPC upgrade begins only after successful runtime render, rather than during session initialization.
- Do not run fixed updates until session initialization and screen close. FirstPlayableFrame records one successful current-game render after loader removal per launch. Report is local and records no user data. Actual display scanout is not observable by this JavaScript metric.
- Existing Step30 all-six 4G test now uses real touchscreen tap and awaits a successful current-game render; Step20 2-second test measures the same frame indicator. Existing hard budgets preserved; never certify live hosting/mobile performance from CI alone.

The paired matrix uses the exact archived pre-change build (run 44018513717) for a PR targeting the pinned base and the current build, with the same browser, independent new contexts for every game, genuine touchscreen taps and same-session re-entry. It independently instruments Canvas presentation for both builds. CI enforces <7s cold and <3s warm on the candidate at 8 Mbps, 80 ms, CPU x2; 2s minigames/3s world and 1s warm are reported targets. Each game has one cold/warm sample per build. No production API contacts; practice-only HTML and connect-src self. The baseline is intentionally pinned to this PR base, not a perpetual dependency.

Still required: physical Android/iOS profiling, real domain CDN, and further asset/canvas optimization based on measured bottlenecks. Old legacy timings are not a controlled speedup experiment.
