# Phase 3, Step 12 — Fair Cross-Game Competitive Scoring

**Scope:** The 34-step Demian roadmap, Phase 3 Step 12 (P0).
This implements a **versioned, reproducible, non-financial comparative
scoring model** over the server-authoritative weekly best scores delivered
in Steps 08–11. It does not create a shared real-time multiplayer mode.

**Explicit caveat:** Relative rank is a transparent provisional way to
compare unequal raw score ranges. It does **not** prove games are equally
difficult, that accounts represent independent humans, that characters are
equivalent, or that real discount awards are safe. Those claims require
physical playtests, operator approval and independent anti-bot review.
There are no trustworthy per-game human playtest distributions bundled with
this repository. Fabricating difficulty calibration coefficients would be
a worse outcome than publishing an honest versioned comparative model.

## Existing behavior preserved

- Arcade replay verifiers, server-owned seeds, bounded input and start-time
  season ownership remain the ONLY sources for verified raw scores.
- The unique weekly personal best per (game, version, player) already prevents
  repeated runs from SUMMING arbitrary extra raw points.
- The existing WeeklyPrizeSelector uses per-game technical positions, first-time
  winner priority and one weekly prize per player. **Step 12 never modifies
  this financial policy or existing winner, coupon and settlement hashes.**
- An unapproved game mode remains unable to earn coupons; award rollout
  flags are unchanged. The normalized global ranking is not a payout queue.

## Formula v1 — relative-cohort-v1

For each game within one Saturday 00:00 Asia/Tehran week:

1. Take exactly ONE already-verified personal best per player for that game
   and its single locked scoring Rules Version. Raw scores from different
   games are **never** compared or added.
2. Let n be the number of distinct players in that game during that week,
   and h the number whose best raw score is **strictly greater** than the
   current player's. The scoring formula is exact integer arithmetic:

       competitive_points = floor(1000 × (n − 1 − h) / max(n − 1, 19))

3. Points are always an integer from **0 to 1000 inclusive**.
   The game's leading score receives 1000 if n >= 20; the last distinct
   score receives 0. For n < 20, shrink the numerator against the minimum
   cohort denominator of 19; a single player gets **0 provisional points**.
4. A game is **qualified** only when **n >= 20 distinct player identities**.
   All other scores are explicitly provisional. Qualified standings rank
   ahead of provisional ones. Distinct accounts are not necessarily human:
   the anti-cheat case review and independent bot tests remain mandatory.
5. Equal raw scores within one game receive **identical points and game rank**
   (competition rank 1,1,3 rather than 1,2,3). Earlier server-observed
   run START time and then immutable player UUID determine DISPLAY ORDER ONLY.
6. A player appearing in multiple games contributes **exactly one** result:
   prefer a qualified result, then the HIGHEST normalized score; if tied,
   prefer earlier server run start, then lexical game ID. Do not sum raw,
   normalized, or number of attempts. A single player's alternate game
   cannot grant additional standings positions.
7. Across players, qualified first; normalized score descending, then
   earlier server start, then stable player UUID. Equal normalized scores
   with the same qualification status **share competition rank** even if
   their display positions differ. No client-provided rank is trusted.

All values are independent of floating-point rounding, browser score,
time-zone claims, character names, request count and the absolute raw point
scale of another game. A changed game rules version within the same week is
rejected by Step 11 before entering this model.

## Versioning, immutability and reproducibility

- The original technical weekly snapshot is already SHA-256 hashed by
  WeeklySettlementService; existing winners and coupons rely on that exact
  stable data. This digest is NEVER overwritten by Step 12.
- WeeklyFairScoringService::VERSION = relative-cohort-v1 explicitly freezes
  the calculation and its 20-player qualification / 1000-point parameters.
  arcade_weekly_fair_policies freezes that version when the current or
  upcoming season is created. Repeated preparation never changes it.
- Scoring a week writes two append-only parallel snapshot tables:
  arcade_weekly_fair_game_scores (one game/player verified best),
  arcade_weekly_fair_standings (one effective best per player/week),
  plus their deterministic canonical SHA-256 and count metadata in
  arcade_weekly_fair_policies. The score snapshot does not include its
  wall-clock calculation timestamp in the hash.
- Write all normalized data inside the same transaction as the verified
  technical result snapshot and old winner candidates. A failed score
  validation rolls back the ENTIRE settlement, not just normalized points.
- A repeated seal/backfill cannot duplicate rows or replace a finalized
  source hash. Backfilling older sealed weeks re-derives the original
  historical SHA-256 before scoring; corruption or personal-data erasure
  may prevent retroactive backfills, and must be investigated manually.
- Future scoring strategies must be introduced with NEW version identifiers,
  explicit backward-compatible implementation, playtest evidence and frozen
  season policy. Never silently change this version's mathematics.

## Persistence and public API

Migration (additive, roll back only on disposable staging database):

    2026_11_15_000002_create_arcade_weekly_fair_scoring_tables.php

Read-only endpoint to announce rules and their limitations BEFORE a game:

    GET /api/v1/arcade/competition/fair/rules

The existing competition calendar includes the same public scoring policy:

    GET /api/v1/arcade/competition/weekly

Historical or current comparative table (safe empty response until sealed):

    GET /api/v1/arcade/competition/fair?week=2026-11-07&limit=20

The optional week is a **Tehran Saturday** YYYY-MM-DD; limit is 1–50.
Public results include qualified/provisional, normalized points, technical
source game, cohort size, tied rank and deterministic display position. They
contain no raw replay bytes, auth token, fraud evidence, coupons or private
reward policy. Deleted accounts are excluded from the public display.

Historic sealed periods created before the migration are NOT automatically
rewritten. An operator may backfill the non-financial table only if the
original source checksum matches:

    php artisan arcade:fair-score --week=2026-11-07 --apply --json

Without explicit --apply and --week, the command refuses writes. It never
seals a week, allocates, issues, revokes or otherwise changes any coupon.

## Verification gates

- Pure deterministic normalization for wide disparity in game raw score
  ranges; same score ties; percentile points; integer [0..1000] bounds;
  double/triple game best and no unlimited retry inflation; stable
  deterministic sorting and no award-changing effect.
- Cohort 1, 19 and 20 boundaries; provisional before qualification; single
  account cannot earn a 1000-point eligible win in an empty competition.
- Reject duplicate player/game sources, mixed rule versions and malformed
  source; no client score POST path, no dynamic calibration from unverified
  data or future times.
- Transactional seal writes and canonical hash reproduce under SQLite and
  MySQL; repeat and historical backfill are idempotent; forged source SHA
  fails before any derived data are created.
- Independent two-process MySQL InnoDB race attempts to seal one week:
  exactly ONE source snapshot, comparative standing set and event log.
- Public API bounds and Saturday validation; no scores before finalization;
  account erasure redacts foreign identity links and removes public identity.
- All existing Step 09/10/11 backend replay, payout, bot-detection and
  frontend/mobile/build tests must stay green.

## Release decisions explicitly NOT implemented

1. No claim of statistical balance across asymmetric game difficulty until
   observed gameplay and cohort sampling are available.
2. Do not automatically adjust scores for different characters. Instead,
   measure per-character success/rank distributions and review outliers:
   unverified automatic handicaps create another attack surface.
3. Do not turn this model into the live voucher selector, and do not sum
   normalized scores. Step 13 can build a dedicated comparative leaderboard
   UX using this API. Financial prize mapping must be decided separately.
4. Real-device UAT, authenticated bot farming, 50 concurrent sessions on the
   cPanel PHP/MySQL host, and actual discount policy remain independent
   issues #44 and #28; all financial flags remain unchanged.
5. Step 13 has not started; do not claim production or business acceptance
   from GitHub Actions CI alone.
