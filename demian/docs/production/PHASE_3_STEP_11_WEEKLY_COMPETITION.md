# Phase 3 · Step 11 — Weekly Competition Management

**Scope:** The 34-step Demian roadmap, Phase 3 Step 11 (P0). This is a
single-player, server-replayed weekly competition, NOT real-time multiplayer.
Step 12 (cross-game scoring normalization) and Step 13 (leaderboard UX) are
separate deliverables and are not implemented as part of this change.

## Requirements and acceptance

| Requirement | Implementation | Gate |
| --- | --- | --- |
| Independent competition each week | One unique key per Tehran Saturday; UTC start/end stored in arcade_weekly_periods | No duplicate periods under retries or MySQL race |
| Calendar | Asia/Tehran Saturday 00:00 (UTC conversion via Carbon IANA zone) | Boundary seconds / cross-week tests |
| Explicit state machine | lifecycle_status: scheduled → active → closing → finalized | Existing open/sealed settlement state retained; no history erased |
| Immutable scoring rules | arcade_weekly_rule_locks, one game+rules_version per season, first ranked start under row lock | Different-version starts rejected 409, even with historical pre-migration runs |
| Fixed prize policy | Snapshot ranked_enabled/prize_eligible on the first ranked start | Turning prize flag ON later cannot award a prior non-prize week; turning it OFF remains an emergency stop |
| Near-boundary start cutoff | Immutable start_cutoff_seconds in period; default 30 s before end | New starts rejected 409; existing idempotent request can recover original run |
| In-flight completion | Replay stays in original START season; expires_at capped at period's stored completion_deadline_at | Closing accepts valid replays; deadline rejects 410 |
| Concurrent sealing | Settlement locks period, validates all unfinished runs and verified personal bests before immutable snapshot | Never seals while a valid run can complete |
| Historical audit | Settlement results, winners, hashes and events preserved; added lifecycle audit event table | Repeated prepare/seal cannot duplicate history |
| Upcoming season preparation | arcade:prepare-weeks --apply, optional opt-in daily scheduler | Never issues or changes coupons |
| Read-only client schedule | GET /api/v1/arcade/competition/weekly | Only window, state, cutoff, deadline and public game-rule versions |

## State machine and compatibility

The old database column **status** is deliberately still open/sealed because
WeeklySettlementService, CouponIssuanceService and historic snapshots use it.
It is never repurposed mid-upgrade. The new **lifecycle_status** is:

- **scheduled** — prepared before the Tehran Saturday start; no new runs.
- **active** — now inside [starts_at, ends_at). New starts allowed until
  ends_at − the period's frozen start_cutoff_seconds.
- **closing** — now >= ends_at and not sealed. No new starts for the old
  week; authorized in-flight runs may complete before both their original
  expires_at and the immutable period submission deadline.
- **finalized** — settlement has written technical rankings, winner
  candidates and canonical snapshot hash; old status=sealed. No completion
  or reopening.

A freshly prepared upcoming period has **scheduled** state even while an
earlier period is active. Live state is derived from server UTC on public GET
so it cannot become inaccurate if cron pauses. Database state transitions and
effective/recorded timestamps are synchronized during actual management
operations; historic periods are not forged into artificial intervening states.

No automatic rule edits, score reweighting or coupon issuance occur here.
A new scoring version in the same game during a live week is rejected
**even if the operator changes a rollout flag**. Different games can have
independent version locks. A planned rule change takes effect in the NEXT
Tehran week, with a new lock after the first new ranked start. Emergency
disabling an untrusted mode can still stop public writes; this is deliberate
fail-closed behavior, not silent mid-week rescore.

A game's first run also stores ranked and financial eligibility. Historic
ranked technical results remain auditable when an operator disables a mode;
financial eligibility additionally requires the CURRENT approved prize gate
when settlement runs. No new financial entitlements may be created simply
because an operator enables a game after the week began.

## Time policy

- Time zone: IANA Asia/Tehran; **persist UTC timestamps**, never browser time.
- Season identity: weekly:tehran:YYYY-MM-DD, date is LOCAL SATURDAY.
- Default new-start cutoff: 30 seconds before end (stored once on creation).
- Default last server submission: 900 seconds after end (stored once).
- Existing Run expiry: min(start + verifier maximum duration + existing
  completion_grace_seconds, immutable season submission deadline).
- Idempotent retry with the same request_id returns the original still-active
  run, including after start cutoff. It never issues another seed.
- Completion is tied to the run's original start week, even after rollover.
- A period may seal after end only when no unexpired started run remains,
  replay/leaderboard ownership matches and every game's locked scoring
  version is consistent. Sealing and completion share the same period row lock.

Both the cutoff and deadline are configured **only for future periods**:
DEMIAN_WEEKLY_START_CUTOFF_SECONDS=30 and
DEMIAN_WEEKLY_COMPLETION_DEADLINE_SECONDS=900. Changing ENV cannot mutate a
prepared/current period. Values are clamped to reasonable bounds; migrate and
prepare before enabling any new ranked deployment.

## Database changes and deployment

One additive migration creates:

1. arcade_weekly_periods.lifecycle_status, start_cutoff_seconds,
   completion_deadline_at. Historic rows receive derived state and immutable
   deadline, without changing the old open/sealed field.
2. arcade_weekly_rule_locks (unique period_key/game_id), with version and
   eligibility snapshot.
3. arcade_weekly_lifecycle_events (unique period_key/state), effective time,
   recorded time, append-only operations from the application service.

Operational commands:

    php artisan migrate --force
    php artisan arcade:prepare-weeks --apply --json
    php artisan schedule:list
    php artisan arcade:seal-weeks --apply --json  # only after existing approval

The daily preparation schedule is OFF unless
DEMIAN_WEEKLY_MANAGEMENT_ENABLED=true. Configure cPanel's single scheduler
and a **persistent shared cache/lock** for onOneServer/withoutOverlapping;
test migration and rollback on a throwaway MySQL staging copy. Do not run a
sealing or financial task automatically until existing independent operator
and financial approval gates pass.

Public route:

    GET /api/v1/arcade/competition/weekly

This reports current and upcoming weeks, including their start/end, status,
cutoff, submission deadline, frozen game-rule versions, server UTC time and
seconds remaining to stop new starts. GET has no write side effects.

## Validation

- WeeklyCompetitionManagementTest: Saturday Tehran/UTC boundaries, staged
  upcoming week, repeating preparation, API privacy, cutoff, idempotent
  start, immutable per-game rules, historical rule conflict, crossing-week
  valid gameplay replay and seal, late replay rejection, frozen duration
  policy, prize eligibility, emergency disabling, CLI safety, no coupons.
- WeeklyCompetitionRuleRaceTest: independent MySQL workers compete to set
  different rules for the same game/week. One wins, one receives 409; one
  period, one lock, one event, no duplicate prizes. Skipped where real MySQL
  + pcntl is absent.
- Existing WeeklySettlementTest, OriginalGameplayRankedApiTest,
  ArcadeAntiCheatTest and older runner/turn-verifier suites must remain
  green across SQLite/MySQL.
- Frontend, browser/mobile QA and production build CI must remain green.

## Explicit non-goals and release gates

This change does not implement Phase 3 Steps 12–16: cross-game normalized
scoring, leaderboard enhancements, campaign administration, automatic
coupon allocation or payout delivery. Existing settlement/issuance services
and their feature flags are unchanged.

Production hardware verification, 50-active-session replay and database
latency under hosting constraints, physically operated mobile QA, manual
fraud red-team and business/prize approval are still outstanding in
Issues #44 and #28. GitHub Actions success alone cannot authorize live
coupons. Step 12 must not begin until explicitly requested by the owner.
