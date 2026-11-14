# Mobile-11 — Production Hosting, Operations, and Data Integrity

**Current state:** Code/infrastructure-as-code is ready for CI; there is **no verified provisioned API host, live database, configured DNS, or off-host restore proof** in this repository. GitHub Pages continues to serve a static/PWA frontend. Enabling worldwide ranked scores is gated on actual Mobile-11 staging/production evidence. **Only Dino Run has a server-verified ranked replay**; other mini-games remain practice-only.

## Architecture and trust boundaries

- Public PWA: GitHub Pages, content fingerprinted service worker, explicit game packs.
- Backend: separate **HTTPS** origin and Nginx -> PHP-FPM 8.3+ -> Laravel 13 -> MySQL 8.4. Laravel project root lives outside Nginx webroot; Nginx serves `current/public` only.
- One server with staging and production isolated by **separate directories, credentials, schemas, hostnames and GitHub Environments**. No shared application keys or databases.
- Shared per-environment `storage/` and `.env`, immutable versioned code releases. MySQL database is external to release directories.
- Database-backed rate limiting/cache (persistent shared cache), Scheduler via host cron (`php artisan schedule:run` every minute). No queue worker is assumed necessary unless asynchronous jobs are later introduced.
- Explicit **manual** GitHub Actions workflow for server deployment, separate from automatic GitHub Pages static deployment. No VPS credentials appear in Git history.

## 1. Provisioning checklist (operator responsibility)

1. Obtain a managed VPS (initial planning size ~2 vCPU/4 GiB; verify by load testing), SSH deployment user, DNS and trusted TLS certificates. Staging and production must be independent.
2. Install Nginx, PHP 8.3+ with Laravel-required extensions, PHP-FPM, MySQL 8.4, curl, tar, rsync, flock, cron and Composer where needed. Use the pinned Nginx example at `ops/mobile-11/nginx.conf.example`, adjusting TLS certificate and PHP-FPM socket. Configure the server firewall (only 443/80 public; SSH restricted), automated OS security updates and least-privilege DB account.
3. Create `/srv/demian-api-staging/shared/.env` and `/srv/demian-api-production/shared/.env` from the **examples**, with distinct `APP_KEY`, database, TLS API origin, `APP_ENV`, `APP_DEBUG=false`, and `DEMIAN_ARCADE_ALLOWED_ORIGINS=https://parsa-emami.github.io` (exact origin, no path or wildcard).
4. Ensure the deployment user and PHP-FPM group share writable ownership/ACL for `shared/storage`, and ensure application code and secrets are not writable by the public web process. The script creates standard storage directories; ownership remains operator responsibility.
5. Configure `* * * * * cd /srv/demian-api-production/current && /usr/bin/php artisan schedule:run >/dev/null 2>&1` for scheduler. Configure the equivalent isolated staging cron if needed. `php artisan schedule:list` confirms the prune task. Use process supervision only when a queue worker is actually required.
6. Protect `storage/logs`, TLS keys and DB credentials; set log rotation and monitored disk/CPU/RAM/DB connections, 5xx, p95 latency, cache errors and backup age.

## 2. GitHub Environments and authorized deployment

Create **staging** and **production** GitHub Environments in repository Settings. Set environment **vars**:
- `API_DEPLOY_HOST` (hostname, no scheme), `API_DEPLOY_USER` (non-root deployer), `API_DEPLOY_ROOT` (e.g. `/srv/demian-api-staging`), `API_BASE_URL` (e.g. `https://api-staging.example.com`).

Set environment **secrets**:
- `API_DEPLOY_SSH_KEY`: a deployment-only SSH private key.
- `API_SSH_KNOWN_HOSTS`: verified/pinned SSH host public key line(s), established out-of-band. The workflow does **not** accept a blind `ssh-keyscan`.

Production should require reviewers, forbid self-approval, and be restricted to the `main` branch in GitHub Environment settings. **Environment approvals and secrets require owner configuration**; they cannot be treated as present by merely committing this workflow.

Go to **Actions -> Mobile-11 authorized API deployment -> Run workflow** on `main`. Select `staging` first. The job verifies both SQL engines, creates a backend-only tarball with locked Composer dependencies, copies the artifact over pinned-host-key SSH, and executes `ops/mobile-11/release.sh` on the authorized host. No ordinary push deploys a live API server.

For production enter `DEPLOY_PRODUCTION_WITH_BACKUP` and provide an offsite-backup/restore-drill receipt identifier. This is **a human attestation, not proof of backup recovery**. Never enter a database password in the input. Deployment is blocked if the receipt/approval is absent.

### Atomic release and rollback semantics

1. Stage code in `releases/<full 40-character commit SHA>`. Symlink in shared `.env` and `storage/`; do not deploy `.env` in tar.
2. Build config/route/view caches in the new release. Apply **backward-compatible/additive migrations before switching the symlink**.
3. Run `php artisan arcade:integrity --json` and refuse cutover on inconsistent ranking data.
4. Atomically move `current` symlink to the new release, check public `/api/v1/arcade/health` for the **exact SHA**, then request `/rules`, `/games` and `/leaderboards/dino-run?period=weekly`.
5. Restore the prior code symlink on smoke/reload failure. **Schema migrations are NOT rolled back by code rollback**; never ship destructive DDL in a rolling release. A cutover can still leave a backward-compatible migration in place.
6. After server cutover, Actions runs an additional bounded **read-only** public API smoke test. Performance failure of this additional test requires investigation; it is not proof of a corrupted release.

## 3. Data integrity, migrations, and backup

The new read-only `php artisan arcade:integrity --json` checks:
- Every leaderboard entry matches a **verified** run on owner, game, rules version, score and original start timestamp, with a live player.
- Verified runs have replay hashes and completion timestamps.
- Recent verified runs still retain replay evidence; older input evidence may be pruned after the configured retention window without losing leaderboard results.
- Every active player has a bounded session expiration field.

No automatic repair occurs (a consistency failure needs human incident response). The check runs on **both SQLite and MySQL in CI** using feature tests. MySQL FK cascades, one-time account recovery and duplicate completion tests remain part of the backend suite.

Before every production migration:
1. Produce an encrypted snapshot using `bash ops/mobile-11/backup_mysql.sh DATABASE /secure/mysql-backup-client.cnf AGE_RECIPIENT /secure/backup-output`. The MySQL client file must be mode `0600`; `age` recipient is a public encryption key. Never commit the private decryption key.
2. Copy the encrypted file **off-host**, verify its SHA-256 checksum and retention policy (provisional daily snapshots, at least 7 off-host copies).
3. Run a **restore drill into an isolated disposable database**, never into active production:
   `age -d -i /secure/age-identity backup.sql.gz.age | gzip -dc | mysql --defaults-extra-file=/secure/mysql-restore-client.cnf demian_restore_test`
4. Point a separate temporary Laravel staging environment to that restored database and run `php artisan arcade:integrity --json`; check player counts, rankings and recovery capability validity. Compare control totals from before backup.
5. Record a dated backup/restore receipt and the tested recovery time in your release evidence. Target RPO 24h and RTO 4h are **provisional**, not verified SLAs.

Avoid printing tokens, credentials, raw SQL dumps or actual replay payloads in public CI logs.

### MySQL logical restore exercised in GitHub CI

The backend's MySQL matrix now executes `ops/mobile-11/ci_mysql_restore.sh` after the feature suite. This script refuses to run unless it is in GitHub CI, uses the local test MySQL schema `demian_test`, and has testing credentials. It creates a player, verified run, replay and leaderboard entry; performs `mysqldump`; restores those four related records into a **separate disposable** database; runs `arcade:integrity`; verifies row counts; then deletes the restored test player and asserts that foreign-key cascades remove the dependent records. This tests **logical** backup/restore and referential integrity, not encryption/offsite transfer or recovery timing on an actual production host.

## 4. Connecting GitHub Pages after staging proof

The static exporter uses `DEMIAN_ARCADE_API_URL` only if it matches an HTTPS arcade API. Set repository variable `DEMIAN_ARCADE_API_URL=https://api.example.com/api/v1/arcade` **only after** production HTTPS, CORS and DB tests pass. The Pages workflow injects that variable on `main`; PR static builds stay offline-only. If unset, the existing PWA stays in practice mode.

Verify public leaderboard data, explicit recovery codes, authenticated `POST /runs`, idempotent `POST /runs/{id}/complete` and `DELETE /player` for a disposable test account. An unverified mini-game must never appear as ranked.

## 5. Authorized throughput and production gates

- Existing bounded API smoke: `node tools/smoke_arcade_api.mjs --base-url=https://api-staging.example.com/api/v1/arcade --users=50 --p95-ms=1500`. At most 50 GETs, **not** 50 proven concurrent logged-in users.
- Opt-in sustained k6 scenario: `DEMIAN_BASE_URL=https://api-staging.example.com DEMIAN_LOAD_APPROVED=YES k6 run tools/load/mobile11_read_only.js`. It targets 50 simulated public-read sessions/hour for 20 minutes plus a bounded 10-VU burst; threshold p95 <500 ms and request errors <1%. These are targets, not measurements. Do **not** run against a third-party service or on production without explicit owner approval.
- Write-intensive authenticated/replay verification load must use test accounts and a dedicated staging database, never live production users. One-off GET tests do not establish real concurrent score-submit capacity.
- Only after green CI, verified staging/production API, DNS/TLS, validated DB restore, offsite backups, operational alerting and explicit approval can online rankings be enabled. Physical Android/iOS release acceptance remains **Mobile-12**.

## References

- [Laravel 13 deployment and health](https://laravel.com/docs/13.x/deployment)
- [GitHub Environments / protection rules](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [Grafana k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
