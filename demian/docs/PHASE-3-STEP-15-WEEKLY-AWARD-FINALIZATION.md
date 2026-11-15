# Phase 3 · Step 15 — Automated weekly finalization and exact-once awards

## Contract
1. Prepared weekly seasons end on Saturday 00:00 Asia/Tehran; the immutable completion_deadline_at stored in UTC controls acceptance. The orchestrator never seals at or before this deadline. In-flight runs still pass the existing WeeklySettlementService integrity and expiry gate. It does not invent results or accept browser-claimed scores.
2. Existing immutable technical and comparative snapshots are produced by WeeklySettlementService, using existing verified-run checks, game-version locks, prior-winner priority and exactly-one-prize-per-player selection. The coordinator never duplicates that selection.
3. CouponIssuanceService verifies the sealed snapshot, selects unique ready inventory and assigns inside a transaction. The coordinator's outer transaction covers both the seal and all coupon issuance, audit and one-off completion marker. Shortage, tamper or invalid winners roll back the whole week's mutations.
4. A singleton InnoDB row arcade_weekly_award_coordinator(id=1) serializes the entire award processing batch across independent PHP/Cron processes, and enforces chronological completion so previous winners cannot be bypassed. arcade_weekly_award_finalizations(period_key PRIMARY KEY) is an immutable exact-once journal record with snapshot hash, counts, campaign and UTC completion time. A single automatic_awards_finalized event is written to the existing weekly audit. No codes or bearer tokens enter those events.
5. Batch size 1–26 prepared weeks. Processing begins at the explicitly approved Saturday rollout week; historical seasons before it cannot be paid automatically. Invalid/unapproved weeks fail closed. A blocked week stops newer weeks. Earlier completed weeks commit. Retries skip completed weeks; no extra codes.
6. Independent production flags are OFF by default. Existing manual seal and issue scheduler hooks are disabled whenever Step 15 auto-finalization is enabled, preventing conflicting scheduled pipelines.
7. No emails. Existing authenticated private, no-store in-app coupon wallet is the only display channel; existing cashier redemption, revocation and privacy erasure remain unchanged.

## Dry run
After migration and creation of prepared weeks configure an explicit approved Tehran Saturday:

    DEMIAN_WEEKLY_AUTO_AWARD_FROM=2026-11-14

Preview without any writes:

    php artisan arcade:finalize-weekly-awards --json
    php artisan arcade:finalize-weekly-awards --week=2026-11-14

## Production authorization
Do not enable real awards from a code commit. Require sponsor approval of coupon policy, imported unique codes, genuine-device UAT, anti-bot/fraud review and the shared-host 50-concurrent-user load test. Confirm persistent centralized cache locking for onOneServer/withoutOverlapping, a cPanel Cron running php artisan schedule:run every minute, backups, rollback, secure staff sessions, and MySQL 8 InnoDB.

Configure all **only** after approval and migrations:
- DEMIAN_WEEKLY_MANAGEMENT_ENABLED=true
- DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED=true
- DEMIAN_COUPONS_POLICY_APPROVED=true plus complete approved monetary policy
- DEMIAN_COUPONS_CAFE_ENABLED=true for management UI
- DEMIAN_COUPONS_CAMPAIGNS_ENABLED=true
- DEMIAN_COUPONS_ISSUE_ENABLED=true
- DEMIAN_COUPONS_AUTO_ISSUE_ENABLED=true
- DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED=true
- DEMIAN_WEEKLY_AUTO_AWARD_FROM=YYYY-MM-DD (Tehran Saturday)

A fully funded, active campaign must exist per target week. Scheduler every five minutes with shared cache lock and DB coordinator lock; failure returns nonzero status. Dry-run before --apply:

    php artisan arcade:finalize-weekly-awards --apply --json
    php artisan arcade:finalize-weekly-awards --week=YYYY-MM-DD --apply --json

Audit using php artisan arcade:audit-coupons --json. Do not activate the legacy independent coupon scheduler together with the coordinator.

## Tests
- PHPUnit SQLite/MySQL: closed-week UTC cutoff, immutable deadline, no preview writes, default-off gates, approved rollout, verified-score tamper, empty week, shortage atomic rollback plus retry, idempotent CLI, no email.
- Independent MySQL fork-worker race: one immutable journal, one winner set, exactly one coupon and inventory assignment per verified winner, one audit event.
- Entire existing backend regressions, Blade, mobile/browser, PWA, static build.
- Real 50-player staging load and genuine-device anti-fraud acceptance are separate operator release gates.
