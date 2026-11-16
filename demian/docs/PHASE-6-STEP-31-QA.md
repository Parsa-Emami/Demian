# Phase 6 / Step 31 — Full-system and mobile character QA

This change targets the real main-branch Demian Laravel/Canvas2D source. All six games share the existing shell, screen stack, gameplay checks and backend API contracts.

## Audited defects and mitigations

1. The static/mobile menu has no lightweight active roster until Open World boots. A prebuilt, 12-character selection adapter now presents shipped artwork without loading game scripts or decoded full sprite atlases. The selected slug uses the existing CharacterVisualService persistent selection policy; real gameplay authority remains with CharacterManager.
2. One failed character card poster fell directly to a two-letter placeholder. Poster loads now fall through to validated directional atlas artwork, with a face-forward preview direction preference. If both resources fail, the existing accessible fallback remains.
3. The first-screen mobile visual hierarchy was a plain dark green stack with no featured art. A bounded three-poster illustration, more deliberate type scale and touch hierarchy, portrait/landscape layouts, safe-area spacing, scroll containment, focus-visible states and reduced-motion behavior are added without loading a game simulation.
4. The shipped 12-character manifest is checked against poster and lite/runtime atlas presence. CI adds a genuine browser check for menu layout and decoded poster pixels on 320x568, 390x844 and 844x390 simulated phone viewports, with all 12 card portraits checked at 390px.

## CI gates and coverage

- JavaScript unit suite and complete Laravel PHPUnit suite on SQLite and MySQL (account lifecycle, session controls, weekly leaderboard, replay verification and coupons).
- Build, skill integrity, UI layers, atomic bundle, full character-pack image hash/frame validation and release assets.
- All six independent Chromium game suites for Dino Run, Open World, After Hours, Cafe Rush, Cafe Critters and Coffee Crash.
- New mobile menu and character portraits Chromium regression, with JSON report and screenshots as workflow artifacts.
- Step 30 cold 4G startup, 50-client staging load *contracts*, mobile network, touch, PWA and benchmark emulator checks.

## External acceptance gates — not implied by green CI

- Actual iOS Safari and Android Chrome touch, notch/rotation, background/recovery and character-face visual checks on physical devices.
- Host-specific HTTPS authentication, real score submissions, leaderboards, coupon issuance and redemption against authorized staging data.
- Authorized 50-player staging load with PHP/MySQL concurrency metrics (p95/p99, errors, DB locks, CPU/RAM).
- Independent security and prize-abuse review, production backup/restore and release rollback rehearsal.
- Final product owner review of visual direction and artwork across all six games.

The branch must not be merged or called Production-ready if CI fails. No active game rules, prizes, scores, schema or private credentials are changed.
