# Phase 6 / Step 29 — Production hosting readiness

**Scope:** Demian 34-step Deep Research roadmap, Phase 6 / Step 29 (P0). Hosting profile considered: cPanel shared 4 vCPU, 4 GiB RAM, 10 GiB SSD, PHP 8.4, approximately 50 **active** players. **Do not conflate this profile with a validated 50 simultaneous PHP requests/s or a production capacity guarantee.**

**Evidence status:** GitHub contains deployment scripts, static frontend build, API release bundles, protected release workflow and preflight/HTTP regression tests. This is **source and CI readiness**, not live-staging or live-production certification. No real cPanel account, domain/DNS, certificate, MySQL schema, production secrets, remote cron, external backup/restore receipt or physical 50-user load result has been independently inspected in this task.

## Hosting architecture

1. **Frontend:** static six-game PWA hosted separately on GitHub Pages. Default runtime can be practice-only; do not embed service credentials into the Pages bundle.
2. **Backend:** Laravel 13 API-only deployment to a dedicated cPanel subdomain with a separate production/staging database and isolated APP_KEY. `public/` must be the only accessible document root. Sources, vendor, `storage/`, shared `.env`, build artifacts and database files remain outside public webroot.
3. **Release:** pinned-host-key SSH/SCP from a manually approved GitHub environment; Composer dependencies built under PHP 8.4 in CI, then unpacked into an immutable per-SHA release. A symlink atomically selects `current`; the prior **code** can be restored if smoke fails, but **database migrations are not automatically rolled back**.
4. **State:** persistent MySQL/InnoDB with database cache and locks, encrypted offsite backup/restore, secure database sessions, database queue and cron scheduler. No server requirement to run Node, Vite or a resident Node worker.

## Step 29 P0 added gates

### A. Preflight on the actual hosting account (before every migration)

`demian/ops/cpanel/host_preflight.php`, bundled with the release and invoked by `ops/cpanel/deploy.sh`, fails closed for:

- Wrong environment target/HTTPS origin, missing or group/world-readable `shared/.env`, duplicate keys and missing writable shared storage framework/log folders.
- PHP CLI below **64-bit 8.4**, absent Laravel extensions, or memory limit below **256 MiB**. PHP **web runtime** must still be checked independently in cPanel; a CLI pass cannot certify the web PHP handler.
- Debug mode, missing API-only routing, mismatched `APP_URL`, invalid or placeholder 32-byte `APP_KEY`, default/root or empty database credentials.
- Volatile cache or sessions, insecure staff cookies, wildcard/non-HTTPS CORS origins or verbose logs.
- Production Cron Jobs absent for this exact deployment root (`artisan schedule:run`).

The preflight **does not** transmit secret values, create database records, install the cron or claim that the database is healthy. Later Laravel integrity/health checks verify persistent dependencies.

### B. Artifact chain of custody and rollback

- Backend packaging includes locked `vendor` and only `ops/cpanel/host_preflight.php` from the ops tree.
- Entries with traversal/absolute paths, private metadata and *archive-supplied symlinks* are refused before extraction. Only the deploy script itself creates private links to shared storage and `.env`.
- Production still requires a human-issued `DEPLOY_PRODUCTION_WITH_BACKUP` acknowledgement plus independently verified encrypted offsite backup/restore receipt.
- The existing migration, integrity, coupon preflight and exact-SHA checks remain mandatory; migration changes must be backwards compatible.

### C. HTTPS and information-exposure acceptance

The new read-only `tools/verify_cpanel_host.mjs` runs after an authorized cPanel deploy with normal TLS validation. It checks:

- `GET /api/v1/arcade/health` = HTTP 200, `status: ok`, `release` equal to the deployed 40-character SHA and `Cache-Control: no-store`;
- `GET /up` succeeds;
- `/.env`, `/artisan`, `/composer.json`, `/composer.lock`, `/vendor/autoload.php`, `/bootstrap/cache/config.php`, `/storage/logs/laravel.log`, `/.git/config`, `/database/database.sqlite` and `/characters` are **not public**;
- an unrelated HTTPS Origin is denied CORS and `/api/v1/arcade/rules` works;
- no POST, account creation, coupon issuance, score submission or destructive request.

This check runs *after* the release script's own rollback-aware smoke test; see the next limitations. If the extra check fails after a successful cutover, the workflow fails and an operator must perform a reviewed code rollback — it is not an automatically tested database rollback.

### D. Testable evidence in GitHub Actions

```bash
# Contract static/runtime checks in the Mobile-11 ops workflow:
bash -n demian/ops/cpanel/deploy.sh
php -l demian/ops/cpanel/host_preflight.php
cd demian
node --test tests/js/mobile/Mobile11Ops.test.js tests/js/mobile/CpanelHostSmoke.test.js
# PHP 8.4 cPanel-runtime job (no real host accessed):
php tests/ops/CpanelHostPreflightTest.php

# Full project JavaScript and backend parity:
npm run test:ci
# PHP SQLite/MySQL workflow exercises the authoritative replay/API.
```

The standalone host-contract test uses a temporary dummy environment file, never production credentials. It exercises valid staging and production, insecure permissions, incorrect secrets, HTTP origins, volatile caches/sessions, permissive CORS and other negative scenarios.

## Required human provisioning on a real cPanel host

| Gate | How to verify | Do not claim green until |
| --- | --- | --- |
| Account limits | Provider confirms CPU share/SPEED, RAM/PMEM, EP, NPROC, IO, IOPS, PHP workers, database connections, inode/disk quotas, backup and allowed stress tests | Written limits are obtained, not just a marketed 4-core/4-GB name |
| Web + CLI runtime | Check PHP version and extensions in MultiPHP Manager and SSH; verify CLI memory >=256 MiB | Both handlers can execute supported Laravel code |
| Domain, DNS & TLS | Create isolated `api-staging` and `api` subdomains, verify live DNS, trusted certificate, redirect HTTP to HTTPS and only `current/public` exposed | Exact HTTPS and private path smoke passes |
| Database | Create two physically separated schemas/users, use MySQL/InnoDB, strong unique password and successful migration/integrity checks | Staging and production data cannot overlap |
| Secrets | Owner provisions `shared/.env` per environment (mode 0600), independently generated `APP_KEY`, strict CORS, privacy-safe settings | New preflight passes **on the host** |
| State + Cron | Persistent storage/DB cache, cPanel Cron Jobs every minute, live scheduler/prune logs and alerts | Scheduled commands are observed running |
| Backup | Independently encrypted offsite copy plus a verified restore to a disposable separate database | Restore evidence and retention/RPO/RTO are documented |
| Deployment | Configure and protect `cpanel-staging`/`cpanel-production` environments; pin SSH host keys externally; run manual staging deploy before production | Exact SHA, negative routing, TLS and PHP/DB checks pass |
| Concurrency | Authorized 50-active and 50-write/replay staging load tests, inspect p95/p99, 429/500/503/508, MySQL saturation | Real measured results meet SLO, not inferred from CPU/RAM |
| Real devices | Real Android/iOS sessions and accessibility tests | Mobile UAT passes |

**Cron example, after configuring actual account paths in cPanel → Cron Jobs:**

```cron
* * * * * cd /home/ACCOUNT/demian-api/current && /usr/local/bin/ea-php84 artisan schedule:run >/dev/null 2>&1
```

For an account that needs queued background jobs, additionally configure a bounded, locked queue drain or a managed worker and monitor failed jobs. Do not assume a running worker merely because `QUEUE_CONNECTION=database` is configured.

**Deploy:** Open [Demian cPanel Laravel API (manual and gated)](../../.github/workflows/cpanel-api-deploy.yml) from GitHub Actions on `main`, select `staging`, verify, then request explicitly reviewed `production` with real backup receipt. A GitHub workflow's successful source-level CI result does not prove the user has granted live host access.

**Rollback:** Restore prior immutable release code through the controlled script/reviewed procedure. Never automatically revert live DB migrations or restore a backup over current player data; require an incident plan and validated restore.

**Following roadmap gates:** Step 30 host load testing, 31 final QA, 32 privacy/legal, 33 observability, 34 public launch. None is pre-approved by green Step 29 CI.
