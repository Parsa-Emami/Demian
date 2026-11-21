# Phase 0 — stabilization, release gates and baseline

Date: **2026-11-21**. Baseline commit: `780773d59d74cb448fc7d6e49c631178a0a49cb9`.
Scope: **the new 12-phase Demian quality roadmap (F0-01 ... F0-08)**, not the older Roadmap 90+ phase numbering.

## Original observed baseline (before this patch)
| Signal | Observation | Source |
| --- | --- | --- |
| Default branch | `main` at `780773d` | GitHub commit API |
| Latest main frontend workflow | failed | Actions run 44801501565 |
| JavaScript CI (initial baseline) | 801 passed, 1 failed | `build` job logs for run 44801501565 |
| Failing test | `Step 20 UX: game counts and menu affordances reflect the real catalog` | `Phase4Step20UxAccessibility.test.js:135` |
| Root cause | test still demanded removed `data-game-library-summary` on homepage | Blade view and source |
| Laravel / MySQL | passed | same workflow, backend matrix |
| Laravel / SQLite | passed | same workflow, backend matrix |
| Open PR count | 24 | GitHub PR listing |
| Browser/device acceptance | not fully certified on physical devices | independent #7 / #28 gates |
| Performance / size before fix | not re-measured for `780773d`; last green deployment on `7f4da70` | Actions 44696281948 |

CI source: https://github.com/Parsa-Emami/Demian/actions/runs/44801501565

## Weekly rollover CI discovery (2026-11-21)
- The first Phase-0 PR run (44869263008) cleared the obsolete homepage-selector failure but exposed **four additional stale test fixtures** after weekly versions became active at `2026-11-20T20:30:00Z` (Saturday 00:00 Tehran).
- Root cause was not a production bypass: the client correctly rejects old/missing version or content-week proofs and falls back to practice.
- Fix tests in `Phase5Step23DinoRun.test.js`, `VerifiedGameplayFrameTransport.test.js` and `VerifiedTurnReplayTransport.test.js` to issue version-matched, week-bound proof fixtures. Keep negative cases strict, and add an explicit epoch-boundary assertion.
- CI run on the **final revised SHA** is required before acceptance; prior failed runs are not proof of readiness.

## F0 deliverable ledger
- **F0-01 (repair failed test):** remove the obsolete homepage-summary selector from the runtime screen; update the regression assertion to protect intentional removal. Keep the live `data-game-library-count`.
- **F0-02 (24 PRs):** each PR is classified in [OPEN_PR_TRIAGE_2026-11-21.md](OPEN_PR_TRIAGE_2026-11-21.md). Do not force-merge stacked financial/animation work into a stabilization patch.
- **F0-03 (source/catalog consistency):** add a source-level release contract asserting the fixed seven-game roster, unique IDs, live game count, nonempty/unique character roster, and consistency of Blade and tracked playable home markup.
- **F0-04 (frontend build):** use existing pinned `npm ci`, `test:ci`, motion, character, final/static/bundle gates and generated static artifact; evidence must come from **the new SHA**.
- **F0-05 (Laravel):** retain the two-database PHPUnit, Blade compilation, restore and 50-user disposable lab tests in `arcade-backend.yml`. These are **not** equivalent to external hosting load tests.
- **F0-06 (browser):** retain Chromium and the existing Firefox/WebKit compatibility run plus per-game smoke and PWA/rollback checks. Physical Android/iOS acceptance remains independent.
- **F0-07 (safe publishing):** enforce/re-test the existing `build + backend → release-qa (SHA-bound) → deploy on main only` workflow; new release contract detects gate regressions. A failed workflow must not publish.
- **F0-08 (comparable baseline):** record source SHA, test counts, previous successful deployment and explicit **unknown** real-device metrics. Attach the new GitHub CI run and downloaded benchmark/QA artifacts to the release decision after it completes; do not fabricate p95 FPS, network startup or asset size numbers.

## Phase-0 release exit criteria
1. The new SHA passes **all** mandatory JS, PHP (SQLite/MySQL), Vite/build/static/PWA and browser checks.
2. `release-qa` passes the exact SHA and is not `skipped`.
3. A main deployment is `success`, or deployment is explicitly deferred with an accurate reason; never infer production Laravel availability from GitHub Pages.
4. All 24 pending feature PRs have a recorded safe integration decision (triage above); do not silently mix phases.
5. Baseline QA artifacts are retained and contain real data; environment-specific host, OTP, physical phone, coupon and visual-art gates stay open for later phases.

**Status:** This document is a phase-0 implementation and acceptance checklist. It must not be interpreted as a green CI certificate until its exact commit's Actions run is checked.

## Next phase when the CI gate is green
**Phase 1 — game design and architecture standardization** for the seven catalog games. Work can start after Phase-0 stabilization, while full art rebuild remains tracked as independent technical debt.
