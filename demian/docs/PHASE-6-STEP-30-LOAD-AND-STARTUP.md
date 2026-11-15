# Phase 6 / Step 30 — Load capacity and first-play performance

## User-reported regression and root-cause audit

User acceptance baseline: first menu **under 5 seconds** and first playable state of each of six games **under 7 seconds**. The existing first-menu and game tests were green in GitHub Actions but did not represent the user's actual device, carrier, geographic CDN routing or warm/cold PWA state.

The pre-change release emitted one **1,350.03 kB JavaScript file (356.88 kB gzip)**, **245.84 kB CSS (50.74 kB gzip)**. Every game class was statically present inside the single atomic bundle, meaning full download/parse was required before the menu could become operable. The prior lab run recorded a 320ms menu time on fast CI loopback; **this does not disprove the real user's slowdown**.

**Why not simply enable Vite code splitting?** An earlier Pages release deleted content-hashed game chunks while a cached open tab still referenced them; switching to arbitrary dynamic chunks would reintroduce deployment 404s and potentially corrupt ranked sessions. The atomic script is intentionally preserved until a proven version-compatible multi-release asset retention strategy exists.

## Step 30 implemented startup improvements

1. **Early HTML menu paint:** an inline, static-release-only bootstrap reveals the actual accessible menu **before the deferred atomic JS bundle downloads or parses**. It does not need character images or APIs. Laravel non-static pages preserve the original logo boot.
2. **Buffered first click:** if the user taps Play / Open World / Settings / Leaderboard / Rewards while hydration is still occurring, exactly one action is retained, with an immediate visible status and normal shell replay once the real engine is ready. No double launch, fabricated game or premature leaderboard request.
3. **No second splash:** the real `GameApplication.boot()` adopts an already visible static menu without reopening the logo loading screen. Failed hydration disables misleading actions and displays an accessible error.
4. **Open World roster fast path:** static Pages `characters.json` is built from the same bundled character manifest. Bypassing its redundant request eliminates an unnecessary fetch or up to **4.5-second request timeout** for this one specific case. Full Laravel/dynamic character repositories still fetch their own records.
5. **Hard performance regression:** `tools/check_phase6_step30_startup.mjs` artificially delays the JS bundle 2.4s to verify early menu and buffered click, then uses headless Chromium emulated **8 Mbps/80ms cold 4G and 2x CPU slowdown** to enforce **under 5s app hydration, under 7s per each of six game launches**. A hard 400-KiB compressed JS ceiling prevents unbounded growth of the atomic startup dependency. JSON evidence is uploaded from CI.
6. **Permanent replay safety:** UI speed changes never alter seeded score validation, server-side receipt or coupon policies; existing PHP SQLite/MySQL and all game browser regressions remain required.

These optimizations improve **perceived first paint** and remove a redundant Open World network dependency; they do not guarantee download time across arbitrary networks. If the user's device is behind a slow CDN, captive portal or unstable DNS, measured first interactive action may still exceed 5s until the actual host is measured.

## Step 30 50-player load architecture

Existing profiles remain:
- `tools/load/cpanel_50_active.js`: 50 active clients polling public endpoints, 3 minutes, p95 target 1s, error rate below 1%.
- `tools/load/cpanel_50_writes_staging.js`: 50 parallel staging account/register/run/idempotency/delete flows, p95 target 2s. Upstream rate-limit capacity must be measured, not disabled or bypassed in production.

**New independent, prize-free load:** `tools/load/cpanel_50_verified_replays_staging.js` requires **50 pre-created disposable staging-only bearer identities**, explicit approval and a unique nonce. Each VU requests its own real server seed, generates a deterministic terminal runner replay using `runner_first_collision.js`, waits the actual game-tick duration, submits a server-calculated replay and repeats the identical completion to check idempotency. The 50-VU profile measures PHP validation and MySQL transaction/concurrency cost, not only HTTP GETs. The request never includes client-calculated score and does not invoke coupons. It must never be run against production.

The replay fixture is pure JS, uses PHP-compatible 32-bit RNG, and its output is cross-checked against two stored authoritative server fixtures (seed 7, width 420, ticks 65; seed 127, width 960, ticks 75). These known fixtures establish basic parity; **live server replay acceptance across all 50 random seeds is the actual required staging gate**, not implied by passing Node tests.

### Required staging run (only with explicit host owner permission)

Prepare one **isolated staging database**, **50 unique temporary test accounts**, and a private JSON file of their bearer tokens, readable only to the load runner:

```bash
# Example shape only: NEVER commit this file or paste tokens into chat.
# /secure/50-disposable-identities.json:
# [{"token":"<64 hex characters>"}, ... exactly 50 entries]

DEMIAN_BASE_URL=https://api-staging.example.com \
DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES \
DEMIAN_REPLAY_LOAD_APPROVED=YES \
DEMIAN_STAGING_IDENTITIES_FILE=/secure/50-disposable-identities.json \
DEMIAN_TEST_RUN_ID=deadbeef \
k6 run demian/tools/load/cpanel_50_verified_replays_staging.js
```

Use a **new nonce per run**; inspect request-group p95/p99, 429, 5xx, PHP worker saturation, CloudLinux Entry Processes, CPU/RAM, IOPS, database locks, deadlocks and slow queries. Review thresholds and raw time-series, not only a green summary. Destroy all disposable staging accounts only after verifying their test runs and replicas are removed; independently confirm no prize issuance/settlement is enabled. Use an authorized off-peak testing window, rate caps and a rollback plan.

**Limits of CI:** The new CI tests exercise generator determinism and k6 source contracts, and enforce real browser startup performance against a loopback static release. GitHub Actions cannot measure the privately purchased cPanel host, provider LVE quotas or a real 50-user transaction workload without staging origin and authorized credentials. Therefore **Step 30 is code/test-ready but the real 50-user hosting capacity gate remains OPEN**.

## Verified acceptance checklist

- [ ] JavaScript unit suite, PHP SQLite+MySQL, cPanel ops contracts green.
- [ ] Early menu visible before JS even with 2.4s delayed entry; one click replayed.
- [ ] Emulated cold 4G menu below 5s; all six first launches below 7s.
- [ ] No unexpected error, double initialization or lost data in full game suite.
- [ ] Real Android/iOS cold and warm loads on actual targeted network recorded; 3G and intermittent CDN measured.
- [ ] Authorized 50-active, 50-write and 50-server-verified replay tests completed on staging; measured p95/p99 and infra limits accepted.
- [ ] Real staging-to-production rollout, backup-restore and device QA accepted before prize features.

The next roadmap step is **31 — Final QA and SLO/SLI acceptance**. Do not label real Production capacity passed until external checks above have evidence.
