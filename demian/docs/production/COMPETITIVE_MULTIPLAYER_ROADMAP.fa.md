# Demian competitive multiplayer — implementation and PR plan

Status: **PR-01 foundation**. This is not a full multiplayer launch. See issue #8.

## Decision and scope

The first production launch uses **asynchronous multiplayer**: every player plays the browser game independently, while a Laravel backend owns identity, ranked sessions, verified high scores and weekly leaderboards. Real-time shared rooms / movement synchronization need a separate authoritative multiplayer service and are explicitly out of MVP scope.

**What exists on main (before this PR):** UUID `arcade_players` with display name and hashed bearer token; `arcade_runs` with server issued seeds; replay verification for **Dino Run**; idempotent completion; `arcade_leaderboard_entries` with a best result per (game, rules version, period, player); `all/daily/weekly` period queries; MySQL/SQLite CI. The static GitHub Pages `playable/` build has no live DB and only enables the API when `DEMIAN_ARCADE_API_URL` is supplied at build time.

## PR-01 contract — first increment

1. Weekly reset instant: **Saturday 00:00 Asia/Tehran**, equal to **Friday 20:30 UTC** under the timezone's present offset. Persist run timestamps in UTC.
2. Period key format: `weekly:tehran:YYYY-MM-DD`, where the date is the local **Saturday season start**. This is exactly 24 ASCII chars, the existing `period_key` column limit.
3. On finishing a replay-verified run, assign it to the period of the **server-recorded run start**, not the client clock or receipt time. A completion after the boundary may still count for the prior season, subject to the existing expiry and replay checks.
4. Weekly period is the default for the HTTP endpoint and the browser client's leaderboard helper; `daily` and `all` remain explicit backward-compatible options.
5. Endpoint includes `server_now` UTC and `season: {id, starts_at, ends_at, timezone}` for weekly. Boundaries are UTC ISO timestamps; end is **exclusive**.
6. Do not wipe scores when the week changes. Period-key filtering creates the new empty season automatically.
7. **Migration caveat:** previous `weekly:YYYY-WW` rows remain as historical data but are not returned by the new weekly lookup. Before deploying against a populated production DB, decide whether to backfill old rows or treat the cut-over as a new official season. Do not rewrite old keys blindly; old ISO weeks and Tehran Saturday weeks have different boundaries. Archive/backfill is PR-02.
8. **Rules version caveat:** the current leaderboard query filters by `rules_version`. Changing scoring rules midweek therefore fragments weekly rankings. Freeze ranked scoring rules during a season, or ship a version-aware migration in PR-04.
9. **Cross-week retry:** the completion logic already uses the original `arcade_runs.started_at`; do not use request arrival time to derive season membership.

## Planned pull requests

| Order | Branch / PR title | Main changes | Definition of done |
|---|---|---|---|
| PR-01 | `feature/weekly-leaderboard-season-contract` | Timezone-aware season period keys, weekly-default API/client, boundary metadata/tests | SQLite + MySQL PHP tests and current browser CI green; no changed static practice gameplay |
| PR-02 | `feature/arcade-season-history` | `arcade_seasons`, season status, archived winners, indexes and cut-over/backfill | previous season remains queryable; concurrent close idempotent; no mass deletion |
| PR-03 | `feature/arcade-player-identity` | secure account recovery and optional private contact method; login/renewal/logout/revoke | cross-device verified recovery; rate limiting; contact never exposed in public API |
| PR-04 | `feature/arcade-weekly-api` | stable season, leaderboard, personal-best and around-me endpoints, pagination and caching | top score per player/game/week; deterministic tie; invalid/stale IDs rejected |
| PR-05 | `feature/arcade-weekly-ui` | nickname onboarding, weekly countdown, my rank, high score, errors/offline practice | Playwright/mobile UX; no fake online rank when backend offline |
| PR-06 | `feature/arcade-ranked-game-verifiers` | per-game server-side replay/proof validation for more mini-games | spoofed scores cannot rank; tests for tampering, replay and impossible duration |
| PR-07 | `feature/arcade-moderation-privacy` | score review/audit, winner snapshots, privacy notice, deletion/retention workflows | moderator actions audited, safe data export/delete, no contact field leakage |
| PR-08 | `feature/arcade-production-deploy` | static CDN + Laravel/MySQL deployment, env/secrets, HTTPS/CORS, monitoring, backups and rollback | repeatable staging and production deploy, restore rehearsal |
| PR-09 | `test/arcade-load-and-release-gates` | 50 users/hour baseline + burst/concurrent load tests, physical devices, weekly rollover E2E | documented p95 latency, error rates, DB performance, no regressions |

Dependencies: PR-02 → PR-04; PR-03 → PR-05; PR-04 + PR-05 + PR-06 → production ranked launch; PR-07 and PR-08 before public prize-bearing competition.

## Player data and authentication

Mandatory: UUID and display name (2–32 chars). Optional: verified phone number **or** an Instagram handle; an Instagram handle is **not** proof of ownership and cannot be used for account recovery without independent verification. A phone number without an OTP is also not proof of ownership.

Existing random bearer token saved in browser storage is **not** durable cross-device login and could be lost on storage clear or compromised by XSS. PR-03 must implement recovery, expiry/rotation and revoke; decide between a same-site Sanctum session cookie and a properly managed token workflow after choosing API/domain topology.

Leaderboard public payload: UUID, display name, score, rank, game, score achieved timestamp, avatar if explicitly added. Never phone, OTP, provider handle, raw tokens, or internal moderation notes. Add data minimization, collection-purpose notice, retention/deletion policies, and access controls.

## Database target (PR-02+)

- `arcade_players`: existing UUID/display_name/hash plus status/last_seen and optional protected verified contact data.
- `arcade_seasons`: UUID/key, timezone, start UTC, end UTC exclusive, status, frozen rules version, created/closed timestamps, unique (game, season key).
- `arcade_runs`: existing source-of-truth start/expire and server-side verification evidence, plus explicit season id (migrate/add safely).
- `arcade_leaderboard_entries`: existing best rows, unique (game, scoring version, season, player); ranking index by season/game/score/achieved_at.
- `arcade_season_winners`: immutable snapshots of finalized rankings, so renaming/deleting a player does not silently rewrite published results; protect PII and support erasure policy.
- `arcade_score_reviews`: restricted moderation, reasons, status, actor and timestamps.

Never trust client-submitted `score` to determine rank. Do not allow all mini-games to submit unverified arbitrary scores.

## API target (PR-04)

```text
GET  /api/v1/arcade/seasons/current?game_id=dino-run
GET  /api/v1/arcade/leaderboards/{game_id}?period=weekly&limit=20
GET  /api/v1/arcade/seasons/{season_id}/leaderboard?limit=20&cursor=...
GET  /api/v1/arcade/me/high-scores?period=weekly
POST /api/v1/arcade/players
POST /api/v1/arcade/runs
POST /api/v1/arcade/runs/{run}/complete
```

Current endpoints remain available. New auth/recovery routes come in PR-03. Countdowns use server-supplied UTC instants, not arbitrary device clocks.

## Threat model and safety checks

Abuse cases: display-name impersonation, fabricated score, altered replay, duplicate completion and retries, multiple accounts, injected public names, scraped phone numbers, stolen browser token, rogue CORS origin, racing updates, late completions, ambiguous timezone/daylight-saving, changing game rules midweek, stale caches, DB backup loss, scheduled archive job overlap and failed OTP delivery.

Controls: server-owned run seed/start/expiry, deterministic replay verifier (per game), idempotency keys, authorized run ownership, strict schema validation, transactional best-score update, indexed queries, per-IP and per-player throttles, dedicated rate limit for OTP, bounded leaderboard pages, contact encryption where necessary, monitoring, safe error messages, only allowlisted CORS origins, no secrets in static builds.

## Operational deployment

- Frontend: prebuilt static release and CDN with hashed assets/cache rules.
- API: persistent PHP 8.3+ Laravel service with MySQL, HTTPS and writable logs/storage; database credentials never in `playable/`.
- SMTP/SMS gateway only if account verification is enabled.
- Laravel scheduler or cron for archiving/pruning; **not** for weekly membership reset (calculated from time and season key).
- Shared hosting can work for an API if it supports the PHP/runtime, database, cron and resource limits; **50 users/hour is not 50 concurrent requests** and must be load-tested on the actual plan.
- Backups, staging, data retention, secrets management and rollback are release gates.

## PR-01 test matrix

- UTC timestamp 20:29:59 Friday vs 20:30:00 Friday transitions between Tehran Saturday seasons.
- Year rollover / ISO week mismatch.
- GET leaderboard defaults to weekly and reports exact UTC boundaries.
- Existing replay verification, idempotent finish, rate-limit/CORS and MySQL + SQLite backend test matrix.
- Existing `npm run test:ci`, `npm run build:static`, bundle validation and browser CI.
- Do **not** merge before CI green; PR-01 does not deploy a live backend.
