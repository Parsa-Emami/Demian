# Loading and acceptance audit — 2026-11-17

Scope: the 60 commits ending at `a94643d3a41f7c38b3ba59dbe9edcbb53d737753`, all six shipped games and all twelve built-in characters. History review is a source/diff audit, not a benchmark of all 60 builds. Paired browser measurement uses the exact prior-main static artifact from Actions run `44022430672`.

## Findings

| Evidence | Effect | Change |
| --- | --- | --- |
| `c006321`, `b34f4d4` | Lossless WebP and lite mobile art reduced transfer; high-quality desktop Canvas players still awaited detail packs | Every implicit player launch starts with complete playable lite art; high-resolution art upgrades after the first presented frame |
| `b12c3e8`, `0c5bc51` | Warmup and Open World lite startup improved entry; selecting a new desktop character could still demand the detail variant | Foreground selection promotes the lite request before cancelling optional NPC work |
| `6e94816` | Lazy chunks reduced the initial JS package and preserved old-tab compatibility | Keep versioned splitting and rollover gates; regenerate stale tracked playable output |
| `a4e1de7`, `a94643d` | Truthful loading stages and a successful-presentation tracker already existed | Keep the loader visible until a successful frame; feed RUM from that frame instead of earlier module/scene completion |
| Existing Step 31 gates | Cold menu <5s and game start <7s were weaker than the requested 3s | Add an independent hard <3000ms gate for cold/warm entry, rendered environment and character selection |
| Arcade completion services | Deterministic replay CPU ran inside a player/run locking transaction | Verify against an immutable snapshot first; recheck identity, eligibility, expiry and rules under lock before the single atomic write |
| Feedback burst loop | Each particle forced a layout flush | One layout flush for the entire burst |

Desktop Darya detail WebP is 6,608,940 bytes in the build: its transfer alone exceeds six seconds at 8 Mbit/s. A fast phone-only test cannot prove the desktop high-quality path. The new browser harness explicitly exercises that path. Quality upgrades are optional, preserve animation progress/position, respect Save-Data, and cannot overwrite a superseded or disposed avatar.

## Evidence boundaries

The browser budget uses new Chromium contexts, 8 Mbps down / 80 ms latency, CPU x2, two phone and desktop samples per game, all twelve character switches per profile, SW disabled, and uncompressed loopback HTTP. It observes successful Canvas presentation and actual decoded environment image drawing. This is a reproducible laboratory budget, not a guarantee on every connection, physical GPU, or hosting location. The initial menu measurement includes navigation time; the first playable measurement begins at the application launch request.

The HTTP harness is restricted to CI, localhost, `APP_ENV=testing`, disposable MySQL `demian_test`, and eight PHP HTTP workers. It creates 50 temporary accounts, submits server-issued replays, verifies retry receipts and abuse rejection, and applies p95 <2s / p99 <4s completion limits. It never targets production, issues prizes, or exports bearer tokens. A real cPanel 50-user certificate still requires the existing staging k6 profile and actual host CPU/RAM/database-lock evidence.

Replay persistence remains atomic. A changed snapshot cannot be committed; an expired run or revoked ruleset is rejected again under lock. A previously completed identical replay returns its original receipt. Verification failure opens no completion transaction. Existing leaderboard tie-breaking, weekly finalization and human anti-cheat review remain authoritative.

## Implementation and operational acceptance

| Requested item | Implemented evidence | Remaining acceptance |
| --- | --- | --- |
| P0: <3s loading | Per-game/environment/character budget and paired prior-main comparison | Physical device and live-network measurements |
| P0: Android and iOS | Existing Chromium/Firefox/WebKit, touch, rotation, offline and soak suites retained | Physical Android and iPhone required; browser emulation is not hardware acceptance |
| P0: 50 users | New concurrent HTTP/MySQL replay and retry workload | Actual cPanel staging capacity |
| P0: Anti-Bot | Existing anti-cheat suite plus real HTTP forged score, timing, payload, bearer and NAT/rate-limit probes | Human/bot cohort review, false-positive acceptance, prize-fraud exercise |
| P0: independent API security | Black-box HTTP probes complement authenticated integration tests | Independent assessor and authorized staging DAST |
| P0: Disaster Recovery | Encrypted dump, tamper detection, isolated restore, linked-record and FK integrity, timed recovery | Independent offsite copy and actual production RPO/RTO |
| P1: DDD | Framework-free domain contracts, clock/transaction ports and adapters; shared immutable verified-replay commit boundary | Broader legacy application/infrastructure placeholders are not the authoritative prize path |
| P1: large frontend classes | Extracted CharacterAssetLoader, CanvasAvatarHydrator and GameMetrics; late-resource disposal tests | Further decomposition can follow measured hotspots |
| P1: differential fuzzing | Reproducible seeded JS/PHP parity and invalid mutations; existing six-game parity suites retained | Longer scheduled corpus and more mutation families can increase coverage |
| P1: Replay CPU/transaction | Simulation before locks, locked reauthorization, CPU timing artifact, HTTP contention checks | Actual hosting lock-duration traces |
| P1: module dependencies | Domain purity, model/UI separation and performance-module cycle gates | Additional package boundaries as modules evolve |
| P1: RUM | Navigation-to-menu, first-presented-playable metrics, per-game p95 and 3s violations | Operator enables private telemetry and gathers a representative live sample |
| P2: Game Feel/balance | Batched visual effects, phase-preserving quality upgrades, deterministic physics and six-game regressions | Human playtesting is required to judge enjoyment and rebalance difficulty responsibly |
| P2: Retention | `php artisan arcade:retention --days=90 --json` aggregates D1/D7/D30 verified-play cohorts | Live data, sufficient cohort age and business interpretation |

Retention uses completed Tehran calendar days and existing verified-play records. A player is counted once per exact target day; immature D1/D7/D30 values are null. Practice/unregistered/deleted accounts are excluded. No browser tracking identifier or new personal-data field is added. Queries are bounded and mark truncated reports incomplete. Output contains aggregates only and is an internal operator command, not a public API.

RUM remains off until configured. It does not send tokens, URLs, player IDs, raw exceptions or persistent identifiers. Reporting errors never block gameplay. The 15-minute SLO report is sampled and must not be described as a population-wide or capacity guarantee.

## Reproduction

- `npm run test:js`, `npm run validate:skills`, `npm run validate:motion`, `npm run validate:cafe-presentation`, `npm run validate:final`, `npm run validate:ui-layers`.
- `npm run build:static`, `npm run validate:static-assets`, `npm run validate:build`.
- `node tools/check_loading_budget.mjs`; optional `DEMIAN_FIRST_FRAME_BASELINE` points at the prior-main static artifact.
- `vendor/bin/phpunit` on SQLite and MySQL. Differential fuzz seed: `0x51a7cafe`; timing JSON under `docs/acceptance-lab/`.
- The backend workflow runs `ops/mobile-11/ci_mysql_restore.sh` and `tools/load/ci_http_acceptance.mjs` only against disposable CI MySQL.
- Existing browser matrices, all six game regressions, runtime soak, PWA/update/offline/Save-Data and release QA remain required.

Applied project guidance: router, performance-optimization, threejs-scene-setup. Preserve canonical character art, foot pivots, FBX collision geometry, fixed-step physics, settings/input/lifecycle, and pinned vendor dependencies.

## Reviewed commits

| Commit | Subject |
| --- | --- |
| [`a94643d`](https://github.com/Parsa-Emami/Demian/commit/a94643d3a41f7c38b3ba59dbe9edcbb53d737753) | perf(startup): P0 first-playable frame and critical loading pipeline (#83) |
| [`3df408f`](https://github.com/Parsa-Emami/Demian/commit/3df408f8d0621620b6a7cce44e8d2db7a89ccf4b) | fix(cpanel): validate release prerequisites before migrations (#82) |
| [`5899882`](https://github.com/Parsa-Emami/Demian/commit/5899882b3fa42b56ee0b37c24cd19a2d22357b5a) | fix(deploy): enforce fail-closed health checks and rollback (#81) |
| [`6e94816`](https://github.com/Parsa-Emami/Demian/commit/6e9481619287e56bc1b93533f1427f4505c6d0e0) | perf(startup): versioned lazy chunks with safe atomic publishing (#80) |
| [`0c5bc51`](https://github.com/Parsa-Emami/Demian/commit/0c5bc51b576f5a9ee5a38cfe446a31a9eaa51f93) | perf(open-world): make lite player first-playable before optional streaming (#79) |
| [`b12c3e8`](https://github.com/Parsa-Emami/Demian/commit/b12c3e89009e6b69db48e72676e908d1fbaec5ba) | perf(startup): safe critical sprite warmup and priority loading (#78) |
| [`9df3ab7`](https://github.com/Parsa-Emami/Demian/commit/9df3ab7bf11eb0c7806850f71c0c9a151f943bd0) | fix(ui): move optional ranked gameplay prompt into collapsed HUD details |
| [`70b3355`](https://github.com/Parsa-Emami/Demian/commit/70b3355aec2975b8f3f96917f258ee9e77c571db) | perf(runtime): optimize Open World presentation and bounded long-run profiling |
| [`4eee9e1`](https://github.com/Parsa-Emami/Demian/commit/4eee9e11d91e2b163fd4b5f392eb299dcc78f09e) | perf: instrument mobile startup, game loads and sprite decode |
| [`a4e1de7`](https://github.com/Parsa-Emami/Demian/commit/a4e1de798a5a8e0bc5736ffbc7cfdd032c95096a) | feat(ux): refresh Demian motion system with truthful interactive loading and targeted warmup |
| [`d496412`](https://github.com/Parsa-Emami/Demian/commit/d496412ce18da6921c8733e8c6f230713096669c) | feat(step33): add production-aware Demian observability, SLO and private operations monitoring |
| [`8bc644b`](https://github.com/Parsa-Emami/Demian/commit/8bc644b92a77085a209c3c0e33107dd4ba81df95) | feat(step32): implement privacy, legal acceptance and protected player data access |
| [`d8f93a6`](https://github.com/Parsa-Emami/Demian/commit/d8f93a6c87bd5b482e0c36338455eda37879d940) | feat(hosting): configure demiancafe.ir and improve Open World first paint |
| [`565a8cd`](https://github.com/Parsa-Emami/Demian/commit/565a8cdd385d39ffa7beeae97eae443b9a7c4673) | test(step31): complete cross-browser, auth, prize and SHA-bound release QA |
| [`6aa74b0`](https://github.com/Parsa-Emami/Demian/commit/6aa74b0c60c9cd845af2909bd40bf63dc37505f5) | feat(step31): mobile-first Demian home and verified 12-character portraits |
| [`74c3df9`](https://github.com/Parsa-Emami/Demian/commit/74c3df9c9800d97f1a92257f6fecce11f5ad1986) | perf(step30): restore instant Demian menu and fast six-game startup |
| [`f8bf18a`](https://github.com/Parsa-Emami/Demian/commit/f8bf18a322d5a70c6867903896b7d096fbde5062) | feat(hosting): complete Phase 6 Step 29 cPanel production readiness gates |
| [`7d6f386`](https://github.com/Parsa-Emami/Demian/commit/7d6f3867f2f41a261fbe2ac0a3e1abefa902740f) | feat(coffee-crash): complete Phase 5 Step 28 Match-3 and ranked replay acceptance |
| [`a0d2fbc`](https://github.com/Parsa-Emami/Demian/commit/a0d2fbcd60f7c1181244218cf82d07253c934f01) | feat(cafe-critters): complete Phase 5 Step 27 puzzle and replay acceptance |
| [`4147164`](https://github.com/Parsa-Emami/Demian/commit/4147164afa2ba45196f99df14e61e41bc8adf5cd) | feat(cafe-rush): complete Phase 5 Step 26 concurrent order and gameplay acceptance |
| [`05cf2f3`](https://github.com/Parsa-Emami/Demian/commit/05cf2f32563ef0c3be0da09c45227d444d6633f4) | feat(after-hours): complete Phase 5 Step 25 acceptance and lifecycle hardening |
| [`404627f`](https://github.com/Parsa-Emami/Demian/commit/404627f728bc428e55846f78ce05126913fd10f3) | feat(open-world): complete Phase 5 Step 24 exploration and streaming acceptance |
| [`180250e`](https://github.com/Parsa-Emami/Demian/commit/180250e6d6d0399171c95860f6b8a624c1d56faf) | feat(dino): complete Phase 5 Step 23 acceptance and ranked session validation |
| [`dc0a982`](https://github.com/Parsa-Emami/Demian/commit/dc0a9822813c7ae1bf350b287c8834f4737f6b5a) | feat(step21): complete audiovisual feedback for six Demian games |
| [`2d812cb`](https://github.com/Parsa-Emami/Demian/commit/2d812cb26ee07559e7be5b0891e8a0f664db0671) | feat(ux): complete Phase 4 Step 20 responsive and accessible game shell |
| [`b34f4d4`](https://github.com/Parsa-Emami/Demian/commit/b34f4d41683079eb09ca5b073e926c69ee872a18) | perf(mobile): under-2s 4G first-play with lite WebP and deferred actors |
| [`b9ac30a`](https://github.com/Parsa-Emami/Demian/commit/b9ac30a9c4f2cfaf00a425d06b5863603df86d41) | feat(startup): complete Phase 4 Step 20 fast initial and per-game loading |
| [`9f0780c`](https://github.com/Parsa-Emami/Demian/commit/9f0780cab829b0facd5b12f421ca0590068df5d4) | feat(mobile): complete Phase 4 Step 19 touch controls and HUD hardening |
| [`c006321`](https://github.com/Parsa-Emami/Demian/commit/c00632149312db40d0f0dab6a8082df0c35259d3) | feat(assets): complete Phase 4 Step 18 lossless graphics and resource optimization |
| [`be5fb10`](https://github.com/Parsa-Emami/Demian/commit/be5fb10f099fb074b5cdeb40f7edb961532ff366) | feat(game-loop): complete Phase 4 Step 17 deterministic Game Loop hardening |
| [`af8a7b5`](https://github.com/Parsa-Emami/Demian/commit/af8a7b5ef911636ae482add8ce53cac8f3234d3a) | feat(arcade): complete Phase 3 Step 16 secure in-app reward delivery and support |
| [`f23e9fb`](https://github.com/Parsa-Emami/Demian/commit/f23e9fb27ea275103e3c76d57c1a1da4c4319a97) | feat(arcade): complete Phase 3 Step 15 automatic weekly prize finalization |
| [`64e660d`](https://github.com/Parsa-Emami/Demian/commit/64e660d188cbd4f369d0476222322950a3b3dfae) | feat(arcade): complete Phase 3 Step 14 secure reward campaigns and code inventory |
| [`49f37a1`](https://github.com/Parsa-Emami/Demian/commit/49f37a1e2655fca12cf9245cc01975c7bfbee58a) | feat(arcade): complete Phase 3 Step 13 weekly leaderboard and in-app discount wallet |
| [`ac82173`](https://github.com/Parsa-Emami/Demian/commit/ac821736a945614e6ec19a28f8349545701bf418) | feat(arcade): complete Phase 3 Step 12 fair cross-game scoring |
| [`4446c64`](https://github.com/Parsa-Emami/Demian/commit/4446c6484daf53147561ce6f24ad500cfd1d3a85) | feat(arcade): implement Phase 3 Step 11 weekly competition management |
| [`1227159`](https://github.com/Parsa-Emami/Demian/commit/122715922e34bd8243b5bd4f69de242bf3b9fc6a) | feat(arcade): complete Phase 2 Step 10 General Anti-Cheat |
| [`dce8435`](https://github.com/Parsa-Emami/Demian/commit/dce8435601161f26292c2dad02530d3318389f25) | feat(arcade): complete Step 09 original-game replay engines and bounded world trial |
| [`6c06acd`](https://github.com/Parsa-Emami/Demian/commit/6c06acdaa5611ac6d8d3a363b9abc3145f82a66e) | feat(step09): audited original Cafe Rush and After Hours mechanics proofs |
| [`f713aa3`](https://github.com/Parsa-Emami/Demian/commit/f713aa38bb2504eef3e00f0ed869a6d6f289ec06) | fix(arcade): fail-close route-only rewards and strengthen Step 09 replay handshake |
| [`1d65b03`](https://github.com/Parsa-Emami/Demian/commit/1d65b032289195c6ba03e39b69067328e373c52a) | feat(arcade): bounded verified route trials for remaining games (Step 09 foundation) |
| [`e224f60`](https://github.com/Parsa-Emami/Demian/commit/e224f60f1a11a2ce738adb90fc48dcf3100973f6) | feat(arcade): verified Cafe Critters and Coffee Crash replays (Step 09, 2/5) |
| [`2afc3f0`](https://github.com/Parsa-Emami/Demian/commit/2afc3f06eaf37dda0aa6253c51ba848d65c65919) | feat(cafe): superadmin manual discount gifts — Phase 11 |
| [`037950b`](https://github.com/Parsa-Emami/Demian/commit/037950b6d1ef565068bf2946f015c018107e249a) | feat(cafe): phase 10 three-tier admin security and guarded production readiness |
| [`4a2a9eb`](https://github.com/Parsa-Emami/Demian/commit/4a2a9ebc463ec6e7754e5892082fd9f4096fda72) | feat(cafe): physical coupon redemption and authenticated cashier portal |
| [`d5c8d90`](https://github.com/Parsa-Emami/Demian/commit/d5c8d909a851c62dd3b626cca1a9f87a79571b9d) | security(coupons): enforce HTTPS, erase secrets and audit Phase 8 ledger |
| [`0c0f8c4`](https://github.com/Parsa-Emami/Demian/commit/0c0f8c465cbb3669d723b9fc5fbc56f60b73307c) | feat(arcade): Phase 8 secure weekly discount coupons |
| [`4cc9933`](https://github.com/Parsa-Emami/Demian/commit/4cc99331f1804449d1f4b9bf50d5dd6665a8fe6c) | fix(ci) + feat(arcade): audited weekly settlement phase 7b |
| [`79c41f0`](https://github.com/Parsa-Emami/Demian/commit/79c41f05f3e597e4011ab1d896cc8f590f7035e5) | feat(arcade): deterministic weekly prize selection and browser QA isolation |
| [`8945ea0`](https://github.com/Parsa-Emami/Demian/commit/8945ea0fb803970dc2bdcf6cc443bca196728ef9) | feat(cpanel): prepare Demian API for 50 concurrent players |
| [`2b861d1`](https://github.com/Parsa-Emami/Demian/commit/2b861d1e1e5369628126646025c33e30eb435b2e) | feat(mobile-11): API hosting operations and verified data integrity |
| [`3daac86`](https://github.com/Parsa-Emami/Demian/commit/3daac86ee0ed6ff8230bf0b828a5f858783723bd) | feat(mobile-10): secure arcade sessions, backup recovery and durable replay |
| [`e564482`](https://github.com/Parsa-Emami/Demian/commit/e5644828956dcac6bf5496aa046cd5f53f1408d9) | feat(mobile-09): offline-ready PWA with selectable game packs and CI |
| [`dc43b9a`](https://github.com/Parsa-Emami/Demian/commit/dc43b9a9cf6dcf729a3de026cd5810cfe531e6b5) | feat(mobile-08): secure one-time account recovery links and session rotation |
| [`ca7e1b0`](https://github.com/Parsa-Emami/Demian/commit/ca7e1b046c2e630e14637fe62aa6fc4cbb4bdfbd) | feat(mobile-08): Saturday Tehran weekly seasons and non-destructive history migration |
| [`c047eae`](https://github.com/Parsa-Emami/Demian/commit/c047eae26946dfdaa319d3e5f57255fb8910f889) | feat(mobile-08): exact personal placement and durable server replay retry |
| [`8e237f3`](https://github.com/Parsa-Emami/Demian/commit/8e237f373aae599b83c82e693106cdc4261653aa) | test(mobile-08): bounded read-only load smoke and production runbook |
| [`dd792b9`](https://github.com/Parsa-Emami/Demian/commit/dd792b9c586cffcaba01d9f50209d1fd9de6ea9b) | feat(mobile-08): verified weekly leaderboard and player profile API |
| [`04cda4c`](https://github.com/Parsa-Emami/Demian/commit/04cda4cc4a16fa77d6efa5eef3514d104ee446c7) | feat(mobile-07): production hosting, portable fonts and safe PWA readiness |
| [`304529d`](https://github.com/Parsa-Emami/Demian/commit/304529d0b0834d3d111613ff916e61595c7d6dfc) | feat(mobile-06): battery-aware frame lifecycle and Canvas2D performance |
