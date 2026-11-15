# Phase 4 — Step 21: audiovisual feedback acceptance

## Source and scope

The 34-step Demian roadmap (page 11) requires:
1. Start, finish, and score sounds.
2. Short visual particles and animations.
3. UX transitions.
4. Better loading feedback.
5. CPU/GPU resource limits, an explicit sound disable option, user testing and an FPS regression under effect load.

This work follows the established six-game frontend architecture. It does not add backend APIs, database schema, third-party audio dependencies, gameplay state changes, score formulas or replay data.

## Implementation

| Requirement | Implementation | Acceptance |
| --- | --- | --- |
| Start/end/score sounds | One lazy WebAudio feedback engine with SFX/music buses; original four game-specific cue engines remain independent; Dino Run pass feedback and Open World exploration are covered by shared events | Unit tests + Playwright gesture-gating |
| Music setting | Lightweight two-oscillator tonal ambience keyed by each game. It is not a licensed or mastered musical soundtrack | Music off/on, pause, visibility, exit, disposal tests |
| Visual cues | DOM-only reusable particles triggered from accepted game events; no game-frame allocations, collision modifications, new canvases, shaders or external images | Bounded 10-node pool, throttling, reduced-motion tests |
| Short transitions | Existing AnimationService shell transitions remain unchanged; event-driven feedback augments them | Existing screen-navigation tests |
| Loading | Existing semantic progress indicator gains a CSS-only sheen while the loading screen is visible | Reduced-motion style check; existing fast-loading Chromium regression |
| Device budget | Max four short shared SFX voices + two shared ambience oscillators; max ten particles; lower particle count in economy/low tier, no visual effects in reduced-motion mode | Node limits in unit and browser tests, sampled Chromium frame intervals |

### Events and layering

The shared director consumes `game:session-started`, `game:completed`, `game:session-paused`, `game:session-resumed`, `game:loading`, `application:menu-shown`, `game:load-failed`, `world:chunk-discovered`, and `feedback:cue`. Event payloads are presentation-only. The cue dispatcher ignores stale events from non-active games and refuses gameplay feedback while paused.

For Cafe Rush, After Hours, Cafe Critters and Coffee Crash, the existing authored one-shot sounds remain the source of local gameplay SFX. Their accepted gameplay events additionally emit visual feedback. For Dino Run, the already-computed `passed` count triggers a shared score sound and particles once after a successful step. Open World exploration uses existing chunk-discovery events. All six games receive consistent start and end cues where applicable.

The visual host is a non-interactive, aria-hidden sibling layer using the existing semantic `game-overlay` z-layer. It never intercepts touch or keyboard actions and never alters the simulation clock. The generated CSS uses only short animations and disables them for OS or in-app reduced-motion settings.

### Platform safety

- WebAudio is created only after a user pointer/keyboard event. No autoplay bypasses or network dependencies.
- The player can independently disable sound and music. Muting removes active shared SFX or ambience.
- Hidden, paused and exited games stop shared music and release temporary effects.
- Every one-shot voice disconnects on end; shutdown disconnects all nodes and closes the audio context.
- Feedback is not added to ranked-run proofs; events are sent after the authoritative model updates.
- No per-frame flash or screen shake is used, avoiding seizure-prone strobes or scroll interference.

### CI

```bash
cd demian
npm ci
npm run validate:skills
npm run validate:motion
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run build:static
npm run validate:static-assets
npm run validate:build
npx playwright install chromium --only-shell
npm run test:feedback:browser
npm run test:fast-loading:browser
npm run test:mobile-touch:browser
npm run test:mobile-pwa:browser
npm run benchmark:mobile:ci
```

The new browser acceptance writes `docs/phase4-step21/audiovisual-browser.json` including measured frame count, sampled frame intervals, maximum effect node allocation, and sound state. The Playwright device is an **emulated mobile Chromium session**, not physical iOS/Android.

### Manual release acceptance (separate evidence)

1. On real iOS Safari and Android Chrome, listen using headset, built-in speakers and silent/muted mode. Validate perceived loudness and unwanted clicks.
2. Confirm music and SFX toggles, reduced motion, screen locking, back navigation and network transitions.
3. Perform ten-minute low-end physical-device playback while repeatedly earning score, pausing and switching among all six games. Record CPU/GPU frame times, memory growth, heat and battery.
4. Check usability with at least several representative players; test visual comprehension without sound.
5. Review audio mastering and production soundtrack requirements separately: the current lightweight synthesized tones are intentionally not a claim of professional mix/master or measured LUFS.

## Project-local skills applied

`.agents/skills/router/SKILL.md`, `.agents/skills/game-feel/SKILL.md`, `.agents/skills/audio-design/SKILL.md`, and `.agents/skills/performance-optimization/SKILL.md`. The real engine remains the existing browser Canvas 2D/three.js architecture.
