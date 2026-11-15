# Phase 5 / Step 23 — Dino Run final acceptance

## Scope from roadmap

The source roadmap (page 12, Phase 5, Step 23) specifies: implement the character and hazards, keyboard/touch controls, score and end-of-round/timer handling, and server score submission. Anti-cheat requires protection against client-side time manipulation and validation of scores by the server. Acceptance calls for browser gameplay tests and real score-submission verification.

## Existing engine and verified responsibilities

- `DinoRunModel` is the fixed-step 60Hz source for jumping, crouching, speed ramp, deterministic obstacles, swept collision, score, time and game over.
- `RunnerReplay` records only bounded transitions and ticks. The Laravel `ArcadeRunService` and `RunnerReplayVerifier` replay input using a server-issued seed, verify elapsed server time and calculate the final score; the client never POSTs an asserted score.
- `ArcadeLeaderboardService` owns API authentication, run issuance, replay persistence and retry after disconnect. In offline practice, the player sees explicitly device-local scores.
- `InputRouter` and `ControlLayoutService` map keyboard, touch and gamepad actions to the shared `DINO_RUN` context. No joystick is required for the runner.
- The responsive HUD and existing 12 character atlases, day/night backgrounds, obstacle art, basic tutorial, results screen and per-game audio are retained.

## Step 23 improvements

| Gap | Change | Quality gate |
| --- | --- | --- |
| Unvalidated ranked-run initiation | Validate server-issued UUID, unsigned 32-bit seed, exact requested track width, rules version and expiry timestamp. Fail closed to practice without uploading or trusting a client score. | Unit tests for every invalid field plus mocked online/offline handshake |
| Missing live time and cleared-obstacle status | Add a compact second row to the shared runner score HUD, sourced exclusively from `DinoRunModel`; sync the final UI when a run ends. | Unit tests verify score/replay untouched and HUD fields match the model |
| Hazard announcement | Use a polite accessible status for short jump/duck warnings | Browser and manual accessibility checks |
| Narrow portrait and landscape presentation | Two-column metrics, nonblocking hazard bubble, comfortable safe-area placement | 320×568, 390×844, 844×390 emulated touch and 1440×900 desktop Chromium |
| Browser-only acceptance gap | CI runs real `GameApplication` gameplay: start, elapsed timer and score, held slide, keyboard jump, pause freezes simulation, resume, deterministic practice collision, results, restart and exit | `npm run test:dino-step23:browser` gate, JSON report and screenshot |

## Data trust boundary

- The backend owns seed issuance, authoritative replay, elapsed-time checks, expiry, leaderboard insertion and rewards eligibility. No DB or PHP logic changed.
- Online status is only accepted after a well-formed server response. Invalid responses fall back to local practice.
- The UI does not use an `input`, `Date.now`, DOM score or mutable animation clock to calculate competitive scores.
- No collision, obstacle generation, difficulty, motion, replay encoding, rules JSON, character hitboxes, API endpoint or prize policy changes were introduced.
- Browser QA injects one obstacle into an **explicitly seeded local practice run**, solely to deterministically exercise the actual collision -> results lifecycle. This never creates or submits a ranked proof.

## Automated verification

```bash
cd demian
npm ci
npm run validate:skills
npm run validate:motion
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run validate:characters:v14
npm run build:static
npm run validate:static-assets
npm run validate:build
npx playwright install chromium --only-shell
npm run test:dino-step23:browser
npm run test:fast-loading:browser
npm run test:mobile-touch:browser
npm run test:mobile-pwa:browser
npm run benchmark:mobile:ci
```

The new JSON report is `docs/phase5-step23/dino-run-browser.json`, with per-viewport input, lifecycle, score, physics and restart evidence. The workflow also retains the existing SQLite/MySQL replay verifier suites. Chromium with device emulation **does not prove** performance on a physical phone.

## Release gates not satisfied by browser emulation

1. Real Chrome on physical Android and Safari on real iPhone: start, jump hold/tap, duck hold/release, orientation, resize, Pause, restart, app background/foreground, and 10-minute play with battery and temperature checks.
2. Real-world 30/60 FPS target on low- and mid-range devices, browser memory under asset-heavy player choices, touch latency, accessibility and legibility at maximum font scaling. Save device/OS/browser versions and full test videos.
3. Live HTTPS Laravel/MySQL API staging end-to-end: create player, issue legitimate ranked run, play until failure, POST actual replay, receive `verification=server-replay`, verify weekly leaderboard entry, force offline after submission, then retry without duplicate points. Confirm no ranked run when API is disabled or unavailable.
4. Independent red-team scenarios and 50 concurrent users; see existing production issue #28 / red-team issue #44 and physical-device issue #7. These cannot be closed by a Playwright mock.

## Project skill routing

Applied `.agents/skills/router/SKILL.md`, `.agents/skills/platformer/SKILL.md`, `.agents/skills/input-systems/SKILL.md` and `.agents/skills/game-feel/SKILL.md`, following repository `AGENTS.md`. The deployed static site is built automatically by GitHub Actions; `playable/` tracked snapshots are independent of the `_site` deployment artifact.
