# Mobile-08 — verified weekly competition and production API

## Current verified coverage (strict security boundary)

Production score verification exists for **DINO RUN only**. No other game may submit arbitrary client-computed scores to the public leaderboard. The `/api/v1/arcade/games` endpoint explicitly publishes the six available modes and marks only `dino-run` as `ranked:true, verification:server-replay`. Other games remain playable offline/practice. This is intentional until each game receives deterministic server replay validation and fixtures.

## Implemented

- No third-party profile API, phone number or Instagram handle required. Registration collects only 2–32-character display name and generates a random token (only a hash is stored in DB).
- Profile self-service: authenticated GET/PATCH/DELETE `/api/v1/arcade/player`; DELETE cascades all player runs, replay events and leaderboard entries.
- Verified per-player best: authenticated `GET /api/v1/arcade/player/best?period=weekly` never exposes hashes or other players' private information.
- Leaderboard: `GET /api/v1/arcade/leaderboards/dino-run?period=weekly` includes UTC server time, Saturday 00:00 Asia/Tehran competition key, UTC start/end timestamps, and seconds remaining; score order is descending, with earlier result winning ties.
- No destructive weekly resets. Every completed run contributes to an immutable `weekly:tehran:YYYY-MM-DD` period key by **run start time**; a new week uses a new key and historical leaderboard rows remain in DB.
- Mobile UI defaults to weekly verified board, refreshes every 60s while visible/open, and renders a second-by-second countdown calibrated to server time, not the user's untrusted phone clock. The user's exact verified weekly rank and high score are shown alongside public standings. Pending runner evidence is owner-bound and can be retried after browser reload.
- Server replay calculation (seed, ordered transitions, tick count) and run idempotency are unchanged. Unsupported games still return 422 instead of publishing unverified scores.
- Frontend device-only scores remain clearly labeled **not worldwide verified**, even if users are offline.

## Architecture and threats

```
Mobile PWA (static HTTPS + Vazirmatn)
          |
          | HTTPS /api/v1/arcade/* (CORS strict allowlist)
          v
Laravel API  ──  MySQL (players / runs / replays / best scores)
          |
          ├── Rate Limit, 256 KiB payload cap
          ├── Token hash authentication
          ├── Server-seeded 60 Hz replay validation (DINO RUN only)
          ├── Saturday Tehran weekly index (UTC timestamps); no destructive reset cron
          └── Scheduled replay pruning (only old replay payloads, never best scores)
```

**Not real-time multiplayer.** Players play independently; rankings refresh every 60 seconds. WebSockets, Redis and PHP long-lived workers are not necessary for the initial limited concurrency target. Host choice is made from measured p95 API latency and database load.

## Weekly contract migration (non-destructive)

Issue #8 defines a **Saturday 00:00 Asia/Tehran** weekly reset, not an ISO Monday UTC week. The migration `2026_11_13_000000_backfill_tehran_arcade_weekly_seasons.php` reconstructs per-player weekly bests from **verified runs** (not legacy aggregates), and retains all prior `weekly:YYYY-WW` keys for audit. Re-running backfill is safe. The 24-character Tehran keys fit the current schema.

**Schedule a maintenance window** while switching code and migrations: stop ranked submissions, back up MySQL and rehearse restoration before executing `php artisan migrate --force`; verify current season and legacy row counts before resuming. Never delete historical period rows as part of a reset. If the API has already been deployed with ISO-Monday week keys, do not assume the new week matches the old week; review the backfill report against historical verified runs.

The public weekly API includes `timezone: Asia/Tehran`, but `server_time`, `starts_at`, and `next_reset_at` remain ISO 8601 **UTC instants**. Client countdown must derive from server time, not local device timezone. Daily and all-time periods retain their existing semantics.

## Deployment boundaries

Mobile-07 created static `_site` suitable for root/subpath HTTPS hosting. The Laravel API requires a **separate PHP-capable hosting environment** with a writable MySQL database, application key, configured CORS allowlist, secure log files and scheduled CLI `php artisan schedule:run` every minute (for replay cleanup).

Production environment example (replace placeholders with secrets in the hosting panel, not in Git):
```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=demian_prod
DB_USERNAME=demian_user
DEMIAN_ARCADE_ALLOWED_ORIGINS=https://play.example.com
```

Set `APP_KEY` and DB password out-of-band, enable HTTPS, run `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, `php artisan config:cache`, `php artisan route:cache` and configure your provider's webroot as Laravel `public/`. Never point a publicly served directory at the Laravel source tree or put real secrets in the static PWA. Build the PWA with the public `DEMIAN_ARCADE_API_URL=https://api.example.com/api/v1/arcade` value. Observe actual runtime API URL and CORS headers after deployment.

For static-only hosting without an API the game is **practice/local mode**; no claim of online rankings is made.

## Test and release matrix

- `php artisan test --filter=ArcadePlatformTest` under SQLite and MySQL.
- Explicit year-end / Saturday Tehran rollover tests, server countdown, no history deletion, own-score authorization, deletion cascade, invalid game rejection and idempotent replays.
- `npm run test:ci` including `Mobile08WeeklyLeaderboard.test.js` for clock skew, browser-only scores and identity erasure on failures.
- All previous Mobile-01..07 production build, network/font/PWA browser and six-game simulated phone tests must remain green.
- Actual Android/iPhone tests #7 and deployment/monitoring of the real private host remain outside CI.

## Next verified-game PRs (do not bypass verification)

1. **After Hours** — deterministic seeded map/timer, action stream, server-side validation of circuit interactions, proximity, and win/lose state.
2. **Café Rush** — seeded orders, time-limited serving actions, collision/spill rules and deterministic replay.
3. **Café Critters** — guest discovery, clue and table actions, server-validated progression and score.
4. **Coffee Crash** — seeded board transitions, move sequence, combinations and score replay.

Each verifier needs locked rule versions, cross-language JS/PHP fixtures, malformed/out-of-order replay tests, replay-time bounds, reproducible scores, and per-game leaderboard enabling **only after green CI**. Open World is not a ranked game.

## Privacy and operational follow-ups

Do not ask users for a phone number, Instagram account, or sensitive personal data without an explicit legal/consent/retention plan. Token revocation on deletion is immediate because the hash row is deleted. Authenticated DELETE is irreversible; a UI confirmation is required before wiring a delete button. PWA reload/update must not interrupt a ranked run.

No deployment to the user's host, network load test or physical Android/iPhone certification is claimed here until host access and actual runtime evidence are available.

## References

- [OWASP API Top 10 2023](https://owasp.org/API-Security/)
- [Laravel 12 production deployment](https://laravel.com/docs/12.x/deployment)
- [Laravel 12 rate limiting](https://laravel.com/docs/12.x/rate-limiting)
