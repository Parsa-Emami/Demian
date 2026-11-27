# Phase 14 — Multi-game competitive rewards

## Independent scope, not blanket financial activation

| Game | Existing server evidence | Review threat | Financial gate |
| --- | --- | --- | --- |
| Café Critters | original 3-guest choice replay (legacy and weekly rules), timing and hint validation | public solution / speed automation | pending |
| Coffee Crash | original integer seeded Match-3, specials/cascade, legal swap/undo and terminal proof | deterministic solver / undo automation | pending |
| After Hours | original 60 Hz frame verifier, shadow, cards, collision, power and completed escape | path/macro automation | pending; full gameplay only |
| Café Rush | original 60 Hz frame verifier, movement, station reach, ticket/tray, spill and combo | perfect-order macros | pending; full gameplay only |
| Open World | bounded route checkpoint/geometry replay, not an original-game proof | route shortcuts and unsupported sandbox actions | code-locked off |

Existing independent PHP/JS parity and adversarial suites are retained (CrittersRankedReplay, CoffeeCrashReplayParity, AfterHoursFullFrameParity, CafeRushFullFrameParity, CafeRouteChallengeReplay, WeeklyGameContent). No replay result or score formula changed. No claim of proven human-only gameplay; deterministic puzzles can be solved by scripts. Existing anti-cheat controls provide evidence for review rather than automatic punishment. Each original game must pass a separate risk assessment/physical pilot with at least 20 independent participants before commercial rollout.

Independent JSON manifests under resources/game/prize-acceptance/ are PENDING. A gate validates actual game and scoring version, original scope, risk code, exact source map, 13 checks, reviewer/evidence reference, review age <90 days, and future Saturday eligibility. Hashes include game code and shared input/collision, backend financial/verifier files; a common-code update invalidates related approvals. Hashes are calculated against the exact private deployed files, not a client-submitted hash. Missing/altered file, pending, expired or wrong-scope approval is fail-closed. Manifest is operator attestation, not evidence of actual hardware testing. Do not forge it. Both backend packages include the required private sources. Manifest files are not secrets and should not contain personal participant data.

Existing flags for Critters/Coffee preserved; After Hours and Café Rush new env flags DEMIAN_ARCADE_AFTER_HOURS_PRIZES_ENABLED and DEMIAN_ARCADE_CAFE_RUSH_PRIZES_ENABLED default false. Original gameplay ranked flag must be enabled and route flag disabled for those two. Open World has no enabling flag for financial rewards. Production/staging gate requires actual OTP setup, anti-cheat, legal and owner approval, budgeted campaign, settlement, dynamic allocation; no bypass. Testing compatibility is limited to old Critters/Coffee fixtures. The explicit test opt-in exercises the production checks.

At ranked start, version-specific eligibility is frozen in weekly rule lock. Shared lock predicate now used in preview, quota planning, settlement and fresh coupon issue. Required lock must exist, be ranked and prize-eligible, match exact rules version and not predate manifest eligibility. Current gate is rechecked at issuing time; changes cannot make a false lock true. Previously issued valid coupon repayments are not revoked by a later gate change. Existing award ledger, identity policy, economic cap, inventory, unique winner cross-game constraint, cashiers and audit retained. Existing caps: Critters 5, Coffee Crash 8, After Hours 5, Café Rush 8, Open World 4 reserved (not eligible); dynamic target 15% with minimum 20 verified entrants, aggregate budget and stock, one prize per verified account/week. XP/league/mission evidence stays separate from financial flags. Multi-SIM is an unresolved person-uniqueness risk.

New feature tests cover pending gate despite requested flag, four original-game starts with immutable false prize lock, missing lock, conflicting route/full config, exact manifest source and version/time binding. Existing SQL migrations unchanged. No real coupon or deployment. Actual physical devices, owner-approved budget, independent risk-reviewed pilot and complete Open World proof remain unresolved. Mandatory PNG Production art gate remains.

Next phase 15: referrals — nonfinancial by default, distinct identity and abuse controls before any reward.
