# Mobile-10 — security, recovery and offline persistence

**Status:** implementation and CI verification are separate from public ranked-mode launch.
**Priority:** P0. **Scope:** Laravel arcade API, player capabilities, replay acceptance,
account erasure and PWA local state. The frontend remains a static GitHub Pages app;
the ranked API is an independently deployed Laravel service.

## Security model and trust boundaries

| Boundary | Rule |
| --- | --- |
| Static game / player device | Not trusted for ranking, time, identity or storage integrity. |
| Browser session | Opaque bearer capability scoped to `sessionStorage` (not `localStorage`); kept in JS memory while active. |
| Durable local state | Non-secret player marker, local practice scores, one owner-bound pending replay. No recovery code or bearer token intentionally persisted. |
| Arcade API | HTTPS-only outside loopback; CORS allowlist; `credentials: omit`; no authentication cookies; all protected requests require server-validated Authorization. |
| Database | SHA-256 hashes of 64-character random tokens, 20-minute recovery secrets and 180-day manually saved one-time backup codes; expiry columns and relational owner keys. |
| Ranked leaderboard | Only replay reconstructed against authoritative rules + server-issued seed/time can produce verified entries. |
| Service worker | Never cache API calls, authenticated responses or score POSTs. Offline modes are practice only. |

### Existing controls retained

- Replay simulation performed on the server; client-supplied `score` is ignored.
- Server transaction locks the player and run; duplicate completion of the same
  evidence returns the same verified result; different evidence is rejected.
- Start idempotency is keyed by `(player_id, request_id)`; reuse with a different
  body fails. Cross-player completion returns 404.
- All profile names pass a Unicode character allowlist; leaderboard cells are
  assigned with `textContent`, not inserted as HTML.
- `DELETE /player` cascades through runs, replay inputs and ranking entries.
- Server limits request body size; recovery and run endpoints have route/IP rate limits.

### Mobile-10 additions

1. A player token is hashed at rest and expires after an absolute 30-day period.
   Migration grants existing token holders one 30-day transition window.
   Expired tokens are rejected for **all** authenticated endpoints.
2. Short recovery links have an absolute 20-minute lifetime; manual backup
   codes expire after 180 days. Both are 64-character random, single-use,
   hashed at rest, and revocable by reissuance. Recovery uses a database
   transaction and row lock, rotates the active bearer, and clears **both**
   recovery capability types. Existing indefinite recovery links are revoked.
3. Per-player issuance budgets (3/hour for short links, 2/hour for backup
   codes) supplement route/IP limits and prevent excessive secret minting.
4. Default browser storage splits non-secret durable data (`localStorage`)
   from bearer identity (`sessionStorage`). Old `localStorage` bearers are
   migrated once and removed. Cross-origin HTTP API URLs are rejected except
   for localhost development; fetches omit credentials/referrers and caching.
5. Replays persist before network submission and are bound to their owner.
   HTTP 401 keeps the owner-bound pending record for recovery. A definitive
   HTTP 4xx rejection is moved to a bounded (10-record) local evidence archive
   **before** the pending entry is cleared; if archival fails, the pending
   record is retained. Failed browser quota writes are surfaced to the player.
   An archived rejection never becomes a verified score or blocks future ranked
   games. The server remains authoritative.
6. Concurrent retry calls in a single tab share one in-flight request. Across
   tabs, server-side idempotency remains mandatory.
7. Account erasure is exposed in the leaderboard UI behind explicit confirmation.
   The browser only reports complete server deletion after the authenticated
   `DELETE` succeeds. An expired/lost token requires recovery first.
8. The recovery UI displays server-issued expiry and never automatically
   redeems a token from the URL fragment. The player can explicitly create
   and manually save a one-time backup code; its plaintext is shown once and
   cleared from the UI on modal close, erasure or successful recovery.

## Recovery and availability caveats (must be accepted before public ranked launch)

- This product intentionally has no email/password or verified secondary
  identity. **If a user loses the bearer and has no currently valid 20-minute
  link or 180-day backup code, the server cannot prove ownership and the account
  cannot be restored.** Session-scoped storage reduces persistent credential
  exposure but makes manual backup-code creation essential. The UI prompts
  the player to save the code outside the browser. Backups must be rotated
  after use, before expiration and after suspected disclosure.
- Recovery URL fragments do not reach the origin via HTTP, but screenshots,
  browser extensions and clipboard sharing may still leak them. Do not log,
  share or paste recovery codes into issue trackers.
- A server may reject a correctly persisted replay after the ranked run's
  expiration window or a rules change. The evidence remains locally available
  rather than silently appearing as verified, but the server must not accept
  unverifiable late evidence. UI distinguishes `practice`, `pending`,
  `rejected` and `verified` statuses.
- `sessionStorage` is not XSS-proof. A compromised same-origin script can read
  the current token. Strong CSP, third-party script inventory, HTTPS reverse
  proxy / first-party HttpOnly cookie migration and independent penetration
  testing are release-gate work, not claims of this PR.
- A deterministic replay verifier proves consistency with the simulated game
  and server clock; **it cannot prove human input** or prevent all automation.
  Add fraud detection/abuse metrics before awarding financial prizes.

## Operations / rollout

1. Apply `php artisan migrate --force` to staging. The new migration adds
   `arcade_players.token_expires_at`, `recovery_expires_at`, `backup_hash` and
   `backup_expires_at`; previously unbounded recovery links stop working.
2. Verify server `APP_URL`, TLS, proxy handling and
   `DEMIAN_ARCADE_ALLOWED_ORIGINS` for the **exact** public static origin.
   CORS includes DELETE for account erasure, credentials are disabled,
   wildcards are not used. Bearer auth does not rely on cookies/CSRF.
3. Verify `CACHE_STORE`/limiter backend and database transaction behavior on
   production MySQL. Configure backups; test a restore with migrations.
4. Run `php artisan test` (SQLite and MySQL), `npm run test:ci`,
   `npm run build:static`, browser offline/online regression and mobile QA.
5. Manually test: issue/redeem/revoke recovery, expire the session, close/reopen
   browser with pending evidence, switch accounts, fill device storage, delete
   full account and confirm all foreign-key cascades. Record Android and iOS
   physical evidence separately in Mobile-12.
6. Do not enable public ranked mode merely because GitHub Pages was deployed:
   API hosting, observability and backup/restore belong to Mobile-11.

## Security acceptance checklist

- [x] Sensitive credentials are not intentionally placed in durable web storage.
- [x] Short recovery and long-lived backup secrets are random, hashed,
      single-use, expiring and rotated.
- [x] Replay completion is owner-checked and idempotent on the server.
- [x] Client survives retry/401/410 without silently deleting pending evidence.
- [x] Deletion endpoint and UI require authenticated server success.
- [ ] Production first-party cookie session / passkey or recovery guarantee.
- [ ] Public API hosting, realistic concurrency/load, log and backup policies.
- [ ] Physical iOS/Android sessions, storage eviction and browser restoration.
- [ ] Independent OWASP ASVS/security assessment before high-stakes competition.

## Reference standards

- OWASP ASVS 5.0 (session management and authorization)
- OWASP HTML5 Security Cheat Sheet (Web Storage / IndexedDB trust model)
- OWASP Forgot Password Cheat Sheet (cryptographic randomness, expiry, one-time consumption)
- OWASP API Security Top 10 (BOLA, Broken Auth, Resource Consumption)
