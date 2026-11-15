# Phase 5 / Step 27 — Café Critters acceptance

## Roadmap baseline

The Demian Deep Research 34-step/6-phase roadmap requires a complete collectible creature puzzle, unique clues, understandable answer choices, fair bounded hints, accessible text/touch interactions, performance limits, weekly puzzle diversity and **server-side verification** before any score is eligible for prizes.

## Preserved architecture

- 8 guests with unique combinations of two light types, three foods and three decorations, collectible album/souvenirs, NGAR/Pishi narrative clues and drawings.
- Calm (no timer), easy (300s), standard (240s) and hard (180s), three pages per shift; continued discovery in local browser storage.
- Server issue of ranked `cafe-critters-replay-v1` run seed, deterministic 3-guest rotation, independently verified action replay, strict option/action bounds, server-calculated score and idempotent ledger.
- Feature flags remain disabled by default. **Financial voucher awards must remain gated independently of ranked readiness**.

## Step 27 changes

1. **Fair, bounded help:** After two distinct wrong configurations, reveal a single exact field hint per puzzle page. Further guesses never reveal new secret fields; duplicate attempts remain free of extra misses. Hints reset on the next page.
2. **Fail-closed session startup:** A rejected, unreachable or malformed ranked server response returns the player safely to practice; never enters ranked state with an invalid seed or version. Async stale sessions cannot override a new round.
3. **Dialog lifecycle:** Only explicit confirm/skip/cancel actions can dismiss an entry dialog. Unknown actions cannot trigger a run.
4. **Comprehensive regression:** Verify all eight guests have valid unique settings and coherent easy/standard/hard clues, hint invariants, offline fallback and stale-nonce handling, immutable terminal outcome.
5. **Server negative proof:** Reject valid-shaped but incorrect seeded guest answers, implausibly rapid solutions and fabricated hint events; preserve existing cross-account, expiry, replay-hash and scoring tests.
6. **Browser acceptance:** Four emulated Chromium viewports (320×568, 390×844, 844×390, 1440×900) verify entry/hard mode, tabular interaction and touch target size, hint lifecycle, wrong/duplicate choices, three guest visits, album persistence, pause/resume, result, restart and timeout without uncaught errors.
7. **CI artifacts:** JSON report and 390-pixel result screenshot are collected by the deployment workflow. All current JS, PHP SQLite/MySQL, static/PWA and mobile CI gates still apply.

## Verification commands

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
npm run test:cafe-critters-step27:browser
# The repository CI runs PHPUnit with both SQLite and MySQL replay/API coverage.
```

The QA script operates on **practice-only** game sessions. It uses on-screen puzzle choice buttons and does not submit scores to any online leaderboard. The independent PHP replay tests verify ranked action evidence and endpoint abuse cases.

## Outstanding release checks (not closed by a green CI)

- Real Android Chrome and iOS Safari: at least 30 minutes, orientation, focus/touch, zoom, slow devices, screenshot/content readability, sound/reduced motion, memory/thermal metrics.
- Live HTTPS API with real authentication: server-issued seeded run, valid completion, leaderboard and exact replay audit, retry/idempotency, expiry, no voucher without explicit reward enablement.
- Realistic 50-concurrent-player load on the selected host, offsite restore rehearsal, independent red-team/fraud testing.
- **Bot resistance:** Public client puzzle data necessarily reveals all guest settings. v1 server replay prevents fabricated scores and invalid moves, but cannot alone prove a human solved the puzzle. An independent threat model and additional prize-grade anti-automation controls are prerequisites before monetary rewards. A weekly fixed-seed challenge may be designed in a versioned protocol later; do not silently change the v1 scoring contract.

This is gameplay and automated acceptance, not evidence of full Production or financial-prize readiness.
