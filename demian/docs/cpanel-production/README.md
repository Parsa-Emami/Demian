# Demian: cPanel production architecture and 50-concurrent-player gate

**Status:** cPanel deployment source and automated tests exist in GitHub. **No paid host, DNS, PHP account, MySQL production database, SSH secret or genuine 50-user load result has been verified**. The production leaderboard is off by default.

## Decision

**50 active players are not the same as 50 simultaneous requests.** All six minigames run locally on the browser; the host receives leaderboard polling, identity requests and verified Dino Run replay submissions. If 50 players poll one endpoint every 60 seconds, that averages 0.83 requests/sec. A synchronized page load can create 150 requests across rules/games/leaderboard; 50 **simultaneous CPU-heavy replay completions** is an entirely different and more demanding workload.

**Candidate host for a staging experiment:** 4 allotted vCPU, 4 GiB memory, >=10 GiB NVMe/SSD, PHP 8.4, Composer-capable or prebuilt vendor artifact, MySQL 8+, SSH/Terminal, cron, separate subdomain root, SSL. This is **not** a capacity guarantee. An advertised CPU/RAM count does not identify the account's Entry Processes, I/O throughput, inode count, PHP worker, CPU seconds or MySQL connection quotas. Ask the provider for actual CloudLinux LVE limits (EP/NPROC/PMEM/SPEED/IO/IOPS), real PHP concurrency, query/connection quota and suspension policy. If genuinely **50 dynamic PHP requests at the same instant** must be served rather than queued, an EP allowance >=50 (preferably headroom) plus enough fast PHP workers is a prerequisite; even that alone does not guarantee p95 latency.

**Do not buy a six-month plan** before a one-month staging trial and permission to run an authorized bounded 50-VU load test. If SSH is unavailable or the domain cannot serve Laravel's `public/` safely, reject that shared plan and choose a compatible alternative.

## Document-root and PHP details

- Use a **dedicated API subdomain**, not a main domain already serving a site. cPanel cannot always change the primary domain's document root. Confirm that your provider allows a document root equivalent to `/home/ACCOUNT/demian-api/current/public` and follows the `current` symlink to a user-owned release path. The webserver must not expose any parent directory or `.env`.
- Only `api.example.com` serves Laravel. The PWA stays on GitHub Pages. API-only mode `DEMIAN_ARCADE_API_ONLY=true` disables the unrelated `/` and `/characters` Laravel web routes; the release also probes `/characters` for HTTP 404.
- **Check both PHP runtimes:** web PHP **and CLI PHP** must be >=8.3. cPanel EasyApache commonly exposes `/usr/local/bin/ea-php84` for PHP 8.4 CLI (provider-dependent). Select that path in `CPANEL_PHP_BIN` and check `php -v` / `php -m`. Required extensions: ctype, curl, dom, fileinfo, filter, hash, mbstring, openssl, PCRE, PDO/MySQL, session, tokenizer, xml; Composer-compatible platform required.
- Check `memory_limit`, `max_execution_time`, PHP-FPM/LSAPI process limits, MySQL 8/InnoDB, 64-bit PHP and persistent database-backed Laravel cache/locks. Test a 256 KB JSON POST and confirm webserver body limits are compatible with the existing app-side payload limiter; do not increase limits arbitrarily.
- Use dedicated **staging** and **production** subdomains/databases/APP_KEY. A shared cPanel plan must allow both subdomains and separate docroots. Backend code and vendor dependencies live **outside** public_html; only `current/public` is exposed.

## Repository deployment artifacts

The manual GitHub Actions workflow `.github/workflows/cpanel-api-deploy.yml`:
1. Calls the existing backend SQLite/MySQL CI verification.
2. Builds a **locked Composer --no-dev** runtime artifact on a GitHub runner using PHP 8.4. It does not include `.env`, `.git`, the full game art or Node modules. **No Composer or Node build on the limited hosting account is required.**
3. Downloads to GitHub runner; uploads by **pinned-host-key SSH/SCP** to `$HOME/demian-api/incoming/<full SHA>.tar.gz`, not to any public document root.
4. Executes `demian/ops/cpanel/deploy.sh` as the ordinary cPanel user, under `flock`; verifies expected shared `.env`, PHP 8.3+, dedicated MySQL, API-only routes, schema migrations, arcade data-integrity audit, exact-SHA health and public route checks.
5. Switches `current` atomically and **restores prior code** if readiness fails. **Database migration rollback is NOT automatic**; schema releases must be backward-compatible.
6. Production additionally requires a separate acknowledgement and a recorded, externally verified backup/restore receipt; it is a *human attestation*, not automated proof.

Create GitHub Environments **`cpanel-staging`** and **`cpanel-production`**. Restrict production to `main`, require independent reviewers where supported, and protect secrets. Environment variables:
- `CPANEL_SSH_HOST`: host/IP for SSH (not a URL)
- `CPANEL_SSH_USER`: cPanel account username
- `CPANEL_API_ROOT`: `/home/ACCOUNT/demian-api-staging` or `/home/ACCOUNT/demian-api`
- `CPANEL_PHP_BIN`: tested PHP CLI, e.g. `/usr/local/bin/ea-php84`
- `CPANEL_API_ORIGIN`: `https://api-staging.example.com` or `https://api.example.com`

Environment secrets:
- `CPANEL_DEPLOY_SSH_KEY`: dedicated **non-root** deploy private key (never paste into chat or Git).
- `CPANEL_SSH_KNOWN_HOSTS`: SSH host key verified from the hosting provider via an **independent channel** (no blind ssh-keyscan).

Required per-environment server files: `$ROOT/shared/.env` and writable `$ROOT/shared/storage`; use `ops/cpanel/.env.*.example`. Generate distinct app keys with `php artisan key:generate --show` locally and store only in protected `.env`. Create database/users with cPanel's MySQL Databases interface; grant app user necessary CRUD and migration privileges, not global MySQL root. Make `shared/.env` unreadable by other system users. Use host Cron Jobs to run:
```cron
* * * * * cd /home/ACCOUNT/demian-api/current && /usr/local/bin/ea-php84 artisan schedule:run >/dev/null 2>&1
```
`artisan arcade:prune` retains ranking results but prunes old replay evidence by retention policy. Enable actual offsite, encrypted backups and monitor their age.

### No SSH or symlink-capable document root?

**Do not enable automated deployment.** cPanel Git Version Control / `.cpanel.yml` support depends on provider features, but cloning the complete source repository is inefficient for this large game. A manual artifact upload is possible only if the provider also supplies a safe PHP Artisan execution path, independently controllable document root, backup/restore, and secure file permissions. Otherwise this specific shared host is not a fit.

## Staging and Production release checklist

- [ ] Provider confirms PHP CLI/web 8.4, Composer compatibility, MySQL 8/InnoDB, SSH/SCP, Cron (every minute), TLS and document root symlink behavior.
- [ ] Provider gives **EP/NPROC/PMEM/SPEED/IO/IOPS, PHP worker/DB connection quotas** in writing and authorizes staging load tests.
- [ ] Provision isolated staging origin, public cert, app key, MySQL schema, shared storage, locked-down access and environment secrets.
- [ ] Run manual **staging** Action; assert `/up` and `/api/v1/arcade/health` 200 with exact release SHA, `/characters` 404, CORS only allows the existing PWA origin.
- [ ] Execute transactional player registration, account backup/recovery, verified Dino Run completion, idempotent repeated submission, weekly ranking retrieval, ownership isolation and deletion/cascades using disposable accounts.
- [ ] Run `php artisan arcade:integrity --json`; run MySQL `EXPLAIN` on actual ranking query and check whether mixed-direction `arcade_rank_order_v2` index removes filesorts on realistic data.
- [ ] Perform encrypted off-host database backup and restore to a separate disposable DB, compare counts/checksums, audit FK cascades and record real RPO/RTO.
- [ ] Run read-only **50 active VUs** on authorized staging:
  `DEMIAN_BASE_URL=https://api-staging.example.com DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES k6 run demian/tools/load/cpanel_50_active.js`
  This polls 3 endpoints every ~60 seconds per VU over 3 minutes; p95 <1,000 ms and error ratio <1% are *acceptance targets*, not claimed results. Monitor 429, 500/503/508, CPU throttling, EP/IO hits, MySQL threads and PHP process queueing.
- [ ] Run the opt-in **50 parallel staging database-write** profile:
  `DEMIAN_BASE_URL=https://api-staging.example.com DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES DEMIAN_WRITE_LOAD_APPROVED=YES k6 run demian/tools/load/cpanel_50_writes_staging.js`
  It creates 50 temporary players in parallel, starts and idempotently retries one run per player, and deletes those accounts. It needs explicit owner authorization and a disposable staging schema; audit and clean up leftover test accounts after network failure. It does **not** submit verified scoring replays.
- [ ] Independently run a bounded **50 simultaneous verified replay completion** staging-only test using pre-created disposable identities and known-good server-seeded play traces. This remains a separate required host test; the preceding read-only and account-write scenarios do not certify it. Never target real production player data.
- [ ] Configure production backups/alerts and repeat staging checks. Only then manually approve production deploy and set **both** `DEMIAN_ARCADE_API_URL=https://api.example.com/api/v1/arcade` and `DEMIAN_ARCADE_ENABLE_RANKED=true` repository variables for the static Pages build.
- [ ] Physical Android/iOS QA (Mobile-12) before public release.

## Database design review

| Component | Current design | Assessment |
|---|---|---|
| `arcade_players` | UUID PK; display name; SHA-256 bearer/recovery/backup hashes with expiry | Good privacy separation, but UUID textual indexes are larger than compact binary IDs. |
| `arcade_runs` | UUID PK; FK to player; unique `(player_id, request_id)`; server seed/time/status and verified score | Strong idempotency; per-player `SELECT ... FOR UPDATE` correctly serializes score writes but can become a hotspot if one player submits multiple runs in parallel. |
| `arcade_replays` | FK run_id primary; JSON transitions; retained for finite period | Correct 1:1 evidence model; JSON size/retention and peak replay verification CPU must be observed. |
| `arcade_leaderboard_entries` | One best per `(game, rules_version, period, player)`; FK run/player and ranking index | Good for 50 users; stores some intentional denormalized columns. New mixed-direction `score DESC, achieved_at ASC, id ASC` index is **additive** and must be evaluated using production-shaped `EXPLAIN`. |
| `cache` and queue/session tables | Laravel database-backed cache, locks and optional queues | Supported in shared hosting; consider Redis only if available and measurements justify, not as a prerequisite. |
| Season model | `daily:UTC`, `weekly:Asia/Tehran`, `all`, immutable run start time | Sound for weekly rollovers. Retained history and cumulative index sizes need lifecycle policies. |

**Not the provably optimal database schema.** Further evidence-based improvements may include compact binary/ordered UUIDs or ULIDs for new deployments, removal of redundant indexes **after** `EXPLAIN`, leaderboards caching (short TTL plus transactional invalidation), per-season archiving, repeated adversarial concurrency testing and more efficient replay encoding. These are not justified or proven at 50 users without realistic workload metrics. Avoid blind schema rewriting, partitioning and Redis deployment on a small shared host.

Current safeguards to preserve: InnoDB foreign keys and deletion cascades, unique idempotency keys, explicit transaction row locks, authoritative replay simulation, hashed account secrets, expiry and per-player best materialization. The new per-bearer limiter correctly distinguishes 50 accounts behind one NAT IP even when request-throttling middleware executes before custom authentication. IP-level global limits and anonymous registration controls still protect against large bursts, but an upstream WAF/bot control and operational limits remain recommended.

## Sources

- cPanel Git deployment, SSH/Terminal and domain root documentation
- Laravel 13 deployment, PHP requirements and scheduler
- CloudLinux LVE/EP resource-limit documentation
- MySQL 8.4 descending index and ORDER BY optimization guidance
