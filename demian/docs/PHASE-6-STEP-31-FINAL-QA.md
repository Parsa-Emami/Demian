# Demian — Phase 6, Step 31: Final QA, accessibility and SLO/SLI acceptance

**Source of truth:** the 34-step Deep Research plan, Phase 6 / Step 31 (P0). Scope includes Unit, Integration and E2E for all six games; primary browsers and physical Android/iOS, offline/reconnect/rotation/background, 15–30 minute continuous play, weekly boundaries, tampered replay, duplicate/expired/redeemed vouchers, DB backup/restore, accessibility and regression. Original acceptance: **all critical scenarios pass and all critical bugs are fixed**. This document distinguishes what CI can prove from what an actual cPanel host and physical devices must establish.

**Production verdict: BLOCKED, pending external UAT/security/hosting evidence.** CI success is *source-release candidate acceptance only*; it must never enable prize issuance, authorize public ranked prizes or imply a real-host capacity certificate.

## Executed in required CI on every PR and main

| Trace / journey | Test evidence and file | Expected gate |
|---|---|---|
| Unit and code contracts, deterministic score, animation, anti-cheat | `npm run test:ci`, `npm run validate:final` | Every test passes |
| PHP API registration, auth, run start, forgery rejection, verified score, leaderboard and deletion | `tests/Feature/Phase6Step31CriticalJourneyTest.php`; full PHPUnit SQLite + MySQL | No unverified score, foreign run access, repeat rank insertion, identity leak |
| Verified real seeded runner replay ➜ weekly sealing ➜ campaign-issued private in-app prize | `tests/Feature/Phase6Step31PrizeJourneyTest.php`; full PHPUnit matrix | Exactly one award, no emails, no leakage to other player; coupons **only in disposable testing DB** |
| Weekly cutoff, tie-breaks, fairness, anti-cheat, idempotence, fraud/snapshot integrity | Existing `ArcadePlatformTest`, `WeeklySettlementTest`, `WeeklyFairScoringTest`, `WeeklyAwardFinalizationStep15Test`, `CouponIssuanceTest`, `CouponDeliveryStep16Test`, `InCafeRedemptionTest`, `ArcadeAntiCheatApiTest` | Zero critical logic failures |
| All six games independent gameplay acceptance | Six `check_phase5_step23_...` through `check_phase5_step28_...` browser suites + dedicated PHP game replays | Each produced `status:passed` JSON, no browser exceptions |
| Full integration of menu, six-game switches and accessibility focus | `tools/check_phase4_step20_loading.mjs`, `check_weekly13_ui.mjs` | All navigation, modal keyboard trapping, private wallet, no stuck loading |
| Cross-engine integration | **New** `tools/check_phase6_step31_compatibility.mjs`: Chromium, Firefox, WebKit; keyboard, six real UI launches, no horizontal overflow, offline/reconnect practice | Every engine and every game passes; browser engine on Linux **not** physical iOS |
| Startup regression | `tools/check_phase6_step30_startup.mjs`: delayed JS, early click, CPU x2 cold 8Mbps/80ms | First menu <5s, each first play <7s **laboratory** |
| Offline, Save-Data, PWA, cache, retry and font | `check_mobile_network_resilience.mjs`, `check_production_pwa.mjs`, `check_mobile09_pwa.mjs` | All recover without recording fake ranked receipts |
| Two emulated phone profiles and performance | `benchmark_mobile.mjs` for `mid-mobile` and `low-mobile` | 6 game render/CPU/transfer reports and zero crash; budgets advisory unless separately enforced |
| Release asset integrity, cPanel deploy/restore and negative secret-path checks | `validate:static-assets`, `validate:build`, Mobile-11 cPanel ops contract, MySQL disposable restore, PHP Blade compile | All CI jobs success |
| Composite release gate and chain of custody | **New** `tools/qa/step31_collect.mjs` ➜ `docs/phase6-step31/qa-evidence.json` ➜ **separate** `release-qa` job | SHA-bound artifact, all 14 reports present/passed, both PHP DB jobs + build successful; production still explicitly blocked |

The release pipeline now requires `release-qa` before publishing GitHub Pages. Missing or failed reports, missing browser engine, missing one game, over-budget startup, altered commit SHA or a forged `productionRelease.ready=true` value make the gate fail. The report is uploaded as a GitHub Actions artifact from the *current* workflow run. It is not a claim that previous CI reports were independently signed.

## SLI definitions and proposed SLOs (subject to owner approval)

An SLI is the measured indicator. An SLO is the allowed threshold **over a defined sample window and target environment**. Test results from local GitHub runners, screenshots or a single successful HTTP request do not establish production SLIs.

| SLI | Provisional target | Minimum future evidence |
|---|---|---|
| Cold menu to engine-ready from navigation on specified 4G tier | <5,000ms (lab hard gate per run); proposed production p75 <5,000ms | Android Chrome + iOS Safari; ≥30 cold samples/device, uncached, device and carrier recorded |
| Tap-to-playing for each game | <7,000ms (lab hard gate); proposed production p95 <7,000ms | ≥30 launches/game per representative device and connection, warm+cold recorded separately |
| API public read latency | p95 <1,000ms | 50 authorized active players, staging same host class, timestamped per-endpoint k6 |
| API authenticated write latency (excluding deliberate gameplay wait) | p95 <2,000ms and p99 <4,000ms | Real HTTP runs, server-seed completion and DB transaction per VU |
| Valid request and replay error rate | <1% 5xx/timeouts; 0 unverified rankings/duplicate awards | Same workload with 50 VUs, no anti-cheat threshold bypass |
| API availability | Proposed ≥99.5% measured monthly; **UNMEASURED** | External health probes and logs, step 33 Observability, planned/excluded windows defined |
| Crash-free gameplay & UX | 0 blocker/P0/P1 incidents in supported launch flows | 15–30 minute thermal battery + background/rotation/call interruption on physical phones |
| Data RPO / RTO | Proposed RPO ≤24h, RTO ≤60min; **UNMEASURED** | Independent encrypted offsite backup and full isolated MySQL restore, timed |
| Prize integrity | 0 counterfeit scores, 0 duplicate/replayed redeemed codes | Authorized human review, bot/fraud tests, signed policies, closed P0/P1 |

Percentiles use nearest-rank over successful *and* failed/timeout attempts as appropriate; always report sample size, client/platform, clock range, rate and error distribution. Never hide HTTP 429, simulated clients or samples with failures. CI Step 31 only enforces the two explicit cold-start hard budgets and report integrity; live SLOs are **not** measured or enforced by GitHub CI.

## Mobile home and character-art integration

The mobile-first start screen is a dedicated CI gate: `tools/check_phase6_step31_mobile_home.mjs` checks 320×568, 390×844 and 844×390 Chromium touch viewport layouts, the 12 character portraits, nonempty image pixels, selection persistence and lack of browser exceptions. The image system falls back from a failed character poster to matching atlas artwork; v14 pack integrity checks are retained. Final art-direction approval on real Android/iOS devices is separate.

## Manual / external P0 acceptance: must not be auto-checked

1. **Physical device matrix** — Android Chrome (low/mid-range), iPhone Safari (supported recent iOS), desktop Chromium/Firefox/WebKit where available. Test 320×568, 390×844, 844×390, 1440×900 plus actual touch/safe-area/keyboard. Each device runs 15–30 min continuously, tracks visible FPS, memory, thermal state, input latency, audio, pause/resume, quick app background and rotation.
2. **Networking and PWA** — hard reload, first install, update during ranked run (must wait for menu/approval), repeated offline/online, weak 3G and lost DNS, mismatched/cached asset revisions, no stale score or duplicate POST. Check real CDN and TLS.
3. **Live staging backend** — disposable HTTPS cPanel deployment, external domain, source isolation, PHP 8.4 CLI + web handler, distinct MySQL and secrets, ephemeral approved accounts. Run `tools/load/cpanel_50_active.js`, `cpanel_50_writes_staging.js`, `cpanel_50_verified_replays_staging.js` only with owner-approved staging permission and 50 unique secret accounts; inspect p95/p99, LVE/EP, RAM, CPU, I/O, slow query/locks and 429/5xx. Never run prize or destructive load against production.
4. **Fraud and security** — an independent manual/authorized OWASP ZAP passive baseline against **staging only**, API authentication and IDOR review, rate limits, redeem race, forged replay, token/session recovery and audit logging; no scan of public third-party hosts. Scores and all eight static critter answers remain visible in client assets; **human anti-bot resistance is unverified**, so voucher issuance remains disabled until approved. Follow GitHub issue [#44](https://github.com/Parsa-Emami/Demian/issues/44).
5. **Weekly competition and prizes** — actual end-of-week time-zone boundary, finalizing once, qualification/ties, inventory depleted, simultaneous redemption (single ledger event), expired and revoked coupons, in-app wallet isolation, no email, authorized cashier signature, reconcile snapshots and ledger audit; never test using real customer codes.
6. **Backup/restore and retention** — independently encrypted offsite backup, verify archive integrity, restore to disposable independent schema and measure actual RPO/RTO; no rollback of irreversible DB migrations without reviewed forward-only recovery.
7. **Accessibility** — assistive-technology iOS VoiceOver/Android TalkBack and keyboard navigation; focus order/modals, captions, reduced motion, high-contrast targets, no inaccessible horizontal overflow. Chromium DOM checks **cannot substitute** for screen reader acceptance.
8. **Legal & operations dependencies** — step 32 legal/privacy and step 33 health alerting remain separate. Do not authorize step 34 Go-Live based solely on this step's CI result.

### External acceptance evidence template

For each gate, record `gate_id`, `environment=staging|physical-device`, `exact main SHA`, `run start and UTC end`, `operator`, `device/browser/OS`, `network conditions`, `sample_count`, `p50/p95/p99`, `error categories`, `masked artifact URL`, `acceptance outcome`, `bug IDs`, `fix/rollback`, and `reviewer sign-off`. Keep bearer tokens, voucher codes, recovery secrets, raw personal data, database dumps and insecure screenshots **out of Git and public Actions artifacts**.

Do not manually edit `qa-evidence.json` to mark external checks passed; the CI report intentionally has `productionRelease.ready=false` and requires future separately reviewed external evidence. Never silently downgrade a P0/P1 issue to green. Re-run the complete test suite after each fix and preserve a reproducible failing test.

## Known unresolved external gates

- [#7 — Physical Android/iOS frame/input/memory evidence](https://github.com/Parsa-Emami/Demian/issues/7)
- [#10 — Mobile-first launch readiness and real-device QA](https://github.com/Parsa-Emami/Demian/issues/10)
- [#28 — Real cPanel, offsite restore, live load and operational integrity](https://github.com/Parsa-Emami/Demian/issues/28)
- [#44 — Anti-bot, production scoring and coupon fraud review](https://github.com/Parsa-Emami/Demian/issues/44)
- [#49 — Real player and adversarial fair-scoring data](https://github.com/Parsa-Emami/Demian/issues/49)

**Step 31 implementation status:** automated code and laboratory acceptance can pass once GitHub Actions validates this branch and its squash-merged `main` SHA. **Real production QA cannot be marked complete without the outstanding gate evidence and owner sign-off.**
