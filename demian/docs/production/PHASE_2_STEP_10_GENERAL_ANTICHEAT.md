# Phase 2 · Step 10 — General Anti-Cheat

This is the **risk detection, review, and monitoring layer** on top of Step 09
authoritative replay. It is NOT the unrelated cafe-staff RBAC Phase 10 and
does not replace the original server score, leaderboards, or coupon ledger.

## Security and abuse requirements

- Never trust a client-submitted score, seed, timestamps, bearer identity,
  leaderboard position, shadow state, ticket, tray or supposed human status.
- Detect repeated failing input replays, start velocity, copied input proofs
  across different accounts, unusually high scores/timing/control density and
  possible account farms sharing one network.
- Use bounded, clear numeric rules with documented reasons, priorities and
  thresholds. A report is a **review signal**, never proof of cheating.
- Protect staff reports using existing cafe session, CSRF, explicit staff
  permissions, current session version and fresh superadmin password step-up.
- Preserve decisions as separate immutable events, not editable notes.
- Allow a reversible, explicitly approved, time-limited hold of **new run
  starts only**. Already verified scores and prizes are never revoked by
  a classifier or review status alone.
- Keep raw IP addresses, bearer tokens, submitted input payloads, user agents,
  coupon codes and secret keys out of evidence and monitoring output.
- Enforce data retention, account-erasure cascades and explicit opt-in rollout.

## Files and trust zones

| Component | Responsibility |
| --- | --- |
| app/Services/Arcade/ArcadeAntiCheat.php | observation, signal evaluation, risk cases, review, hold, summary, pruning |
| app/Http/Middleware/ObserveArcadeReplayFailures.php | authenticated rejected 409/410/422 replay outcomes; sanitized status only |
| database/migrations/2026_11_14_000010_create_arcade_anticheat_tables.php | observations, reports, append-only review events, holds, score/clone indexes |
| ArcadeRunService and ArcadeTurnRunService | observe new runs and independently server-verified scores inside existing locked DB transactions |
| app/Http/Controllers/Cafe/CafeAntiCheatController.php | restricted staff reporting and password-confirmed human decisions |
| resources/views/cashier/anticheat.blade.php | RTL, no raw private telemetry, review and hold forms |
| app/Console/Commands/ArcadeAntiCheatMonitorCommand.php | aggregate JSON/CLI alert and nonzero exit for high risk backlog |
| app/Console/Commands/ArcadeAntiCheatPruneCommand.php | short-lived observation retention and expired holds |
| routes/web.php and routes/console.php | protected staff routes and opt-in scheduled jobs |

### Canonical rule signals

| Signal | Trigger | Risk/severity | False-positive caveat |
| --- | --- | --- | --- |
| start_velocity | >=10 new starts from one player within 10 minutes | 45 medium | retry with same request ID does not count |
| invalid_replay_velocity | >=4 authenticated 409,410,422 rejections within 15 minutes | 60 high | stale clients may cause errors |
| shared_network_cohort | >=12 distinct accounts on the same daily HMAC network fingerprint within 30 minutes | 35 medium | shared cafe Wi-Fi, carrier NAT |
| cross_account_replay | same verified replay SHA, game and version on different player within 7 days | 75 high | identical simple controls can be coincidence |
| statistical_score_outlier | >=20 reference runs of same rules and score >=max(500,median*4+100) | 40 medium | early-season or small samples |
| short_high_score | >=1000 points within <=600 ticks | 45 medium | inspect physics before deciding |
| dense_control_trace | >=85% ticks contain input changes when ticks >=600 | 25 low | touch/accessibility input noise |

All settings are versioned in config/demian-arcade.php and must be tested
before changing. Risk is an operator review priority, NOT a deterministic ban
decision and NOT a probability that a human cheated.

### Data integrity and privacy

- Observations are server-observed small records: account/run references,
  allowlisted event code, game, server score, safe status, time and optional
  daily rotating HMAC-SHA256 of IP using APP_KEY. Raw addresses are never saved.
  Trusted proxy configuration must be reviewed before staging.
- Reports have unique HMAC fingerprints and small numeric evidence. Concurrency
  is handled by a database unique index and atomic hit increments. Reviewed
  false positives stay cleared even if the same signal recurs; reopen requires
  a new explicit human event.
- Original scored runs remain immutable. The observer participates in the
  same transaction as score persistence. A failed score write rolls back its
  verified observation; a rejected submission never creates leaderboard rows.
- Holds are placed only after a superadmin has manually confirmed a report,
  reentered the current password and specified 1–168 hours and reason.
  The same player row is locked for new start decisions and the review hold
  write. Release and natural expiry preserve historical verified data.
- Account deletion cascades to anti-cheat observations, reports and holds.
  Observations older than 30 days and expired holds are pruned. Longer
  retention of reviewed cases requires separate local privacy/governance
  approval; the software does not silently purge confirmed historical cases.

## Deployment and verification

1. On **staging**, back up the database and apply the additive migration to
   PHP 8.4 + MySQL 8 InnoDB. Verify all indexes and rollbacks, HTTPS, trusted
   proxies, privileged staff access and a genuine random APP_KEY.
2. Run full SQLite/MySQL PHP tests plus frontend JS, browser/PWA, mobile
   and build suites. Targeted: vendor/bin/phpunit --filter ArcadeAntiCheat.
3. Set DEMIAN_ANTICHEAT_ENABLED=true **on staging** after migration, then
   php artisan config:cache. This does not turn on ranked games or prizes.
4. Visit /cashier/admin/anti-cheat as active superadmin; admin, manager,
   cashier and players must fail permission checks. Check that reports and
   aggregate logs disclose no IP, raw body, token, coupon or password.
5. Submit a valid challenge, four invalid proofs, a retry with the same request
   ID, a cross-account proof and several distinct players using one cafe IP.
   Confirm signal reason/counts and no automatic ranking/award mutation.
6. Confirm a report manually, apply a 1h hold with fresh password and explicit
   reason, confirm that a NEW run gets HTTP 423 and an existing run can finish;
   then clear the hold and test expiry. Reopen/clear false positives.
7. Configure the persistent cPanel cron and shared lock cache. Run commands:
      php artisan arcade:anticheat:monitor --json --max-high=5
      php artisan arcade:anticheat:prune --json
   Monitor runs every 15 minutes and only logs aggregate warning counts;
   prune runs daily. Connect the nonzero exit alert to operator monitoring.
8. Perform authorized realistic 50-concurrent-session host tests (4vCPU/4GiB
   target), record p50/p95/p99 replay latency, MySQL contention, 429s,
   resource cost, false-positive rate, missed alerts and staff review delays.
9. Conduct independent red-team of legal bot-generated inputs, shared-IP
   multiaccounts and stolen bearer sessions. A valid deterministic replay
   does not prove that a human played it. Get explicit human/operator/cashier
   acceptance before financial activation.

## Test gates

- ArcadeAntiCheatTest: velocity, dedupe, shared-IP false positives, statistical
  outliers, copied replay, privacy, reviewer RBAC, password step-up, hold and
  release, account deletion, monitoring and pruning.
- ArcadeAntiCheatApiTest: real authenticated run-start idempotency, repeat
  invalid submissions, no fabricated scores, account/staff isolation.
- ArcadeAntiCheatConcurrentSignalTest: two independent MySQL workers racing
  to report the same signal; a single report fingerprint and no restrictions.
- Existing Step 09 JS/PHP differential replay, real finish, MySQL concurrent
  score completion and weekly coupon ledger tests must remain green.

## Default safe flags

    DEMIAN_ANTICHEAT_ENABLED=false
    DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED=false
    DEMIAN_AFTER_HOURS_GAMEPLAY_RANKED=false
    DEMIAN_CAFE_RUSH_GAMEPLAY_RANKED=false
    DEMIAN_OPEN_WORLD_ROUTE_RANKED=false
    DEMIAN_COUPONS_ISSUE_ENABLED=false

**Only the code and CI can be signed off in GitHub.** Real production load,
human/bot differentiation, physical mobile/device acceptance, and actual
coupon issuance remain separate independent release gates in Issue #44.
Do not start the next phase until the user requests it.
