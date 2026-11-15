# Demian — Phase 4 / Step 20: fast startup, PWA and mobile launch readiness

**Status:** code/CI release gate. Physical phone acceptance requires real evidence and is not represented by simulated Chromium tests.

## Incident: unusually long initial/game loading

### Diagnosed source, not a visual spinner issue

The previous \`GameApplication.boot()\` made the entire Open World a **blocking prerequisite** for the menu, including:

- full Open World renderer, chunk streaming and \`ensureAround(spawn)\` awaiting every requested nearby LOD chunk;
- \`CharacterManager.boot()\`: a remote character directory request (up to 4.5 seconds on an unresponsive server), selected character sprite/atlas download, image decoding, player entity;
- fixed **320ms opening + 160ms closing** screen animations in \`BaseScreen\`;
- individual games starting with preload hooks; Coffee Crash previously **awaited** optional café preview art, which could take up to 12 seconds before image decode timeout.

The app also ships one atomic Vite JS bundle as a deliberate protection against stale dynamic import chunks on GitHub Pages; initial JS parsing still costs time. The deployed 245 MB release artifact is **not** an initial user download; most assets are fetched on demand. Do not report the artifact size as network startup bytes.

### Implemented

1. **Menu-first cold boot.** Initialize the shell, controls and gamepad runtime, then display the menu **without creating Open World**. Open World and any other game are instantiated only after selection. Back-to-menu doesn't reinitialize a full World as a hidden backdrop. The previous game is removed from the renderer and input before displaying the menu, and disposed afterward with exception containment.
2. **Early Open World frame.** Preserve the already implemented immediate fallback café render, but queue chunk streaming instead of awaiting all nearby chunks. A ranked World Route still explicitly awaits the required spawn chunks before starting its time-critical trial; gameplay and server proofs are unchanged. NPC hydration remains optional/background after the first ready frame.
3. **Non-blocking Coffee Crash artwork.** Begin optional polished café preview loading without awaiting it in \`preload()\`. When missing, the renderer's existing fallback paints the game; a delayed image can improve visuals later.
4. **Fast screen transitions.** Boot and loading overlays have zero fixed entrance/exit animation duration. Other primary screens retain a short 160ms transition; modals keep their animation/focus behavior.
5. **Transparent measurements.** \`GameApplication.loadingTimings\` stores only the last 24 in-memory \`{gameId,durationMs}\` / \`{type:'menu',durationMs}\` samples. Emits \`application:boot-timing\` and \`game:load-timing\` events. No names, tokens, player identifiers, network transmission, or persisted telemetry.
6. **Offline and PWA safety.** Preserve release-hashed install/cache manifests, explicit offline game downloads (not automatic downloads of dozens of sheets), manifest pack budget <=96 MiB, no automatic leaderboard-score uploads offline, and updates only by deliberate menu acknowledgement. Root and relocated-subpath font/PWA tests, offline reload/reconnect, purge/reinstall and network recovery remain mandatory CI checks.
7. **New browser acceptance.** Automated local static-release test blocks character/atlas URLs during startup and asserts the menu is still interactive and not blocked by Open World. Tests a deliberate **7-second delay** in Coffee Crash decorative preview loading, then launches every playable game, returns to menu, and verifies no stale loading screen or uncaught error. Writes \`docs/phase4-step20/startup-and-game-loading.json\`. The 12-second local initial menu threshold is a regression **guard**, not a mobile-network SLO.

### Test contract

- \`npm run test:ci\`: no-menu-backdrop startup, cleanup order, crash-safe return to menu, no fixed loading animation delay, open-world asynchronous chunk streaming, Coffee Crash optional art.
- \`npm run validate:final && npm run build:static && npm run validate:static-assets && npm run validate:build\`: source + atomic release invariants.
- \`npm run test:fast-loading:browser\`: real optimized build, 390×844 emulation, character network blocked at boot, first menu measured, all six games booted, stalled optional image not delaying Coffee Crash; screenshots/debug timing report.
- Existing \`test:mobile-touch:browser\`, \`test:mobile-network:browser\`, \`test:mobile-pwa:browser\`, \`test:mobile-09:browser\`, \`test:loading:browser\`, \`benchmark:mobile:ci\` on mid/low and PHP/MySQL+SQLite suites must all pass.

### Production go/no-go (external work is **not** automatically approved or fabricated)

1. On actual Android Chrome (low/mid + modern) and iOS Safari (older + recent notch) record cold first paint, menu interactive, first launch of each of the **six** games, second launch, pause/resume, mobile keyboard, different zoom levels, orientation, multitouch and touch hit targets at small device width.
2. Use \`?deviceQa=1\` for at least **15 minutes** on each class of physical phone, including repeated game/character switches and five background/foreground cycles. Attach JSON, video, device/OS/browser/version, battery/thermal observations and raw OS PSS/RSS or Web Inspector/Instruments memory traces. JS heap alone cannot validate memory use of decoded images, GPU or browser processes. A simulated CI result is **not physical device certification**.
3. Install on both platforms, verify full and offline fallbacks, explicit per-game offline download/remove/reinstall, storage-near-quota behavior, upgrade waiting while ranked run active, and menu-only upgrade after all pending submissions are settled.
4. Verify HTTPS and scoped service-worker registration under actual production host and nested paths. Static Pages deployment is **not** verification that the separate authenticated Laravel/MySQL API is live. Staging and production API secrets must be provisioned and tested under Issue #28 before ranked scores/rewards are enabled.
5. Report p50/p95/p99 actual startup/first-frame and energy/resident memory *from measurements*, not estimates. If device cases fail, leave the physical-device gate open and fix before launch.

Related GitHub Issues: #7 physical phone acceptance, #10 mobile-first roadmap, #28 separate Laravel API production go-live.
