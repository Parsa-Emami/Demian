# Demian Phase 7b — Immutable weekly settlement (snapshot only)

Phase 7b stores historical ranking snapshots, provisional prize choices and a seal event. It does NOT create, deliver or redeem discount codes. Discount policy requires explicit approval.

## Boundaries

- Week: Saturday 00:00 Asia/Tehran inclusive to next Saturday 00:00 exclusive; timestamps in UTC. A run stays in its starting season.
- Only completed verified runs from rank-enabled games (currently Dino Run) participate. If one game has mixed scoring-rule versions, or any verified entrant lacks a weekly personal best, fail closed.
- An in-flight run started before rollover can finish after it. Never seal until all in-period started runs have expired or completed. Score completion locks the same period row before publishing a verified score. After sealing, new completions get 409.
- Full technical rankings are snapshotted, not just winners. Each user gets no more than one provisional award across games per week; each game has at most ten. New recipients are prioritized over winners from past weeks.
- Sealing is transactional and idempotent under SQL row locking, DB unique constraints and deadlock retry. Re-running never issues duplicate awards or deletes a week.
- Historic results survive account deletion. Foreign keys to player and run become null on deletion, anonymizing identity while keeping rank/score. Original SHA-256 digest remains initial sealing evidence, not a digest expected to match after anonymization.
- Settlement audit records totals, digest and algorithm version, not names, tokens or coupon secrets.

## New tables

arcade_weekly_periods — UTC boundaries, sealed state, counts and snapshot checksum.
arcade_weekly_results — snapshot of ALL ranked entrants with technical rank.
arcade_weekly_winners — proposed prize rank, separate from technical rank, with a unique key on period and player.
arcade_weekly_settlement_events — append-only seal record with summary JSON.

## Safe rollout

1. Apply additive migrations on staging, run artisan migrate --force and arcade:integrity --json, and verify previous seasons and configured ranked games.
2. Preview command safety gate with php artisan arcade:seal-weeks --week=2026-11-07 (no DB writes; exits nonzero).
3. To write one concluded week after review, run php artisan arcade:seal-weeks --week=2026-11-07 --apply --json. Re-run to confirm already_sealed.
4. Default DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED=false. After a staged acceptance and approval, set true in production and use a shared database/Redis scheduler cache. Hourly minute-10 task uses withoutOverlapping and onOneServer and catches up missed weeks chronologically (max 26 unsealed weeks per run).
5. Any invalid ranking, active run or rules mismatch aborts without partial snapshot. Incident response must investigate; do not roll back or delete historic weeks.

## Tests

WeeklySettlementTest covers period boundary, malformed week rejection, replay lock, late-run safety, tamper rollback, mixed rules, missing best scores, eligibility, anonymization, chronological catch-up, and idempotency. CI runs PHPUnit on both SQLite and MySQL 8.4.

Phase 8 is NOT part of this code. Coupon tiers, expiry, maximum discounts, store webhook signing, issuance and redemption remain gated on explicit business rules.
