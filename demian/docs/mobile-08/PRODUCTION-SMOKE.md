# Mobile-08 — Production API load and go-live checks

This playbook is for an owner-controlled, authorized Laravel API deployment only. **A single 50-client burst does not prove 50 concurrent real players or sustained performance.** Do not run against third-party hosts.

## Preflight

1. Deploy Laravel source outside public webroot; serve only `public/` over HTTPS. Check PHP version, MySQL credentials and migrations; set `APP_ENV=production`, `APP_DEBUG=false`, distinct secret `APP_KEY`, `APP_URL`, and `DEMIAN_ARCADE_ALLOWED_ORIGINS`. Never upload `.env` as a static asset.
2. Verify `GET /up`, `GET /api/v1/arcade/rules`, `GET /api/v1/arcade/games`, and `GET /api/v1/arcade/leaderboards/dino-run?period=weekly`; all must respond with expected JSON. `/games` intentionally marks games without server verifiers `ranked:false`.
3. Confirm the static PWA's public API URL `DEMIAN_ARCADE_API_URL` points at the HTTPS API, and CORS allows **only** that frontend origin.
4. Register a throwaway player and submit one **verified runner replay**, then confirm one weekly leaderboard entry. Ensure a forged score fails; delete the test player through authenticated `DELETE /api/v1/arcade/player`.
5. Confirm scheduler cron runs `php artisan schedule:run` every minute; the `arcade:prune` job expires stale runs and prunes old replay payloads, but does not delete weekly personal bests. Ensure encrypted backups, rotation and restore drill are scheduled.
6. Record DB CPU, slow query count, PHP process count, total errors, latency percentiles and peak RAM during authorized tests.

## Bounded read-only burst

After confirming the API is yours and this short test window is authorized:

```sh
cd demian
node tools/smoke_arcade_api.mjs \
  --base-url=https://api.example.com/api/v1/arcade \
  --users=50 \
  --p95-ms=1500
```

This performs **at most 50 total concurrent GET requests**, split across rules, game capabilities and weekly leaderboard, no credentials or writes. It fails if any response is not 2xx/valid JSON, if an HTTP 429/500 occurs, or if observed p95 exceeds the example 1500 ms target. Validate real SLOs with repeated warm and cold tests, separately measuring authenticated player registration and replay completion under controlled conditions. An HTTPS certificate, a healthy API and a burst test do not certify server scalability or security.

## Operational response

- 401 on authenticated requests: stale token, request new account only with the user's explicit action.
- 409 on game rules/version: reload current assets, never submit old replay as verified.
- 422 on unsupported mini-game: keep it practice-only until server verifier exists.
- 429: client backs off; review shared IP rate limits and volume before changing limits.
- 5xx/timeout: show offline/practice status and do not publish an unverified score.
- Monday 00:00 UTC: the next week uses a new `weekly:YYYY-WW` key; old rows remain for audit and history. No destructive reset command.

## Release gates remaining outside CI

- Real Android/iPhone physical QA [#7](https://github.com/Parsa-Emami/Demian/issues/7).
- HTTPS host, DB, backups, observability and full API deployment are **unverified** until actual hosting access and output are provided.
- Per-mini-game server-side replay verification beyond DINO RUN must be implemented before expanding ranked competitions.
