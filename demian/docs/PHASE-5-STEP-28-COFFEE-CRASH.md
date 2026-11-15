# Phase 5 / Step 28 — Coffee Crash acceptance

## Roadmap acceptance

The Demian 34-step Deep Research roadmap requires a stable Match-3 engine, reproducible 7×8 board generator, no deadlocked boards, safe shuffle, 12 levels, bounded cascade/combos, special-piece behavior, accessible feedback and animations, correct terminal win/loss, server-issued seed and **independent server replay** for ranked scoring.

## Existing implementation retained

- A fixed deterministic 7-column × 8-row Match-3 board with five ingredient types, legal-adjacent swap checks and automatic generation without pre-existing matches.
- 12 authored campaign levels with per-level goals and move budgets. Every level has a verified winning move sequence in `tests/js/coffee-crash/solutions.json`.
- Four specials: row, column, bomb and rainbow; bounded chain effects and gravity; automatic reshuffle of dead boards.
- One-use undo, no-cost invalid moves and hints, keyboard/touch/swipe/gamepad interactions, reduced-motion support, Persian accessible HUD and optional FX.
- Server-issued seed and v1 `coffee-crash-replay-v1` event log for **ranked level one only**, independently simulated in PHP with score computed server-side. Real prizes are not authorized by client score.
- Existing extensive browser QA `npm run test:coffee-crash:browser` covering five viewports, swipes, keyboard/gamepad, pause, hint, undo and gameplay.

## Step 28 changes

1. **Fail-closed ranked startup:** If network/API throws, times out or supplies malformed game ID, rules version, run ID or xorshift32 seed, the puzzle continues as local practice, never displays a false ranked badge or sends client scores.
2. **Dialog event integrity:** Only explicit start/skip/close actions can dismiss entry; unrecognized events cannot silently start a game.
3. **Replay contract hardening:** PHP verifier rejects zero/negative/>32-bit seeds, unknown replay fields and unversioned extra data (e.g. client-provided scores or injected hint claims).
4. **Seed and board matrix:** JS tests verify zero pre-matches, valid playable first move and deterministic board equality across all 12 campaign levels and nine diverse 32-bit seeds. Stress tests exercise repeated legal moves, bounded cascade animation frames, scores, no soft locks and immutable terminal states.
5. **Additional security tests:** Reject forged score fields, unknown hint action, illegal first undo, duplicate timestamps, out-of-range tile indices and invalid seeds in PHP verifier.
6. **Dedicated acceptance:** Four Chromium viewport emulations (320×568, 390×844, 844×390 and 1440×900) inspect menu, invalid dialog action, real click-swaps, pause, hint, undo, practice-only level 12, legal last move loss, results, restart and cleanup.
7. **GitHub Actions gate:** Static build must pass both the existing Coffee Crash browser suite and the Step 28 acceptance suite; JSON and a 390px results screenshot are uploaded as workflow artifacts.

## Verification

```bash
cd demian
npm ci
npm run validate:skills
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run build:static
npm run validate:static-assets
npm run validate:build
npx playwright install chromium --only-shell
npm run test:coffee-crash:browser
npm run test:coffee-crash-step28:browser
# CI additionally runs PHP Replay/API verification under both MySQL and SQLite.
```

The browser test intentionally unlocks level 12 **in memory and practice mode only** to verify the level selector and terminal state; it never submits or authorizes ranked evidence. Seeded PHP/JS parity is verified separately in feature tests. Do not confuse emulated touch with real physical UAT.

## Remaining production release gates

- Real Android/iOS touch, orientation, VoiceOver/TalkBack, 30-minute performance/memory/battery/thermal soak and accessibility acceptance.
- Live HTTPS Laravel/MySQL server-issued ranked run, legitimate full sequence, replay receipt and leaderboard, token recovery, retry and idempotency; real 50-user host load and offsite backup/restore.
- Independent anti-bot/red-team review before monetary vouchers. Full client board rules, deterministic seeds and a known solver cannot prove human participation; replay validation stops fabricated scores but not algorithmic play.
- Consider versioned server-defined weekly puzzle policy and separate rank categories for any future multi-level ranked competition; do not silently change v1 level-one scoring or grant rewards from local level 12 test data.

Step 28 development acceptance does **not** certify production hosting or prize issuance.
