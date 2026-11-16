# Phase 6 / Step 33 — Observability & Incident Response

**Code and CI scope:** lightweight structured telemetry, private SLO dashboard, heartbeat, deduplicated alerts and independent health probe. **Production status:** source implementation is not evidence of an actual cPanel installation, SMTP alert delivery, DNS/TLS setup, 50-player capacity or physical mobile QA.

Canonical hosts: https://demiancafe.ir/ (static PWA) and https://api.demiancafe.ir (Laravel/MySQL). Never stream large Open World images through PHP.

## Data, privacy and architecture

| Signal | Mechanism | Privacy / cost control |
|---|---|---|
| HTTP latency, failures and static route groups | ObserveArcadeRequest middleware | 20% sample of ordinary successes; all 4xx/5xx/slow. No query, IP, user-agent, bearer, player id, path parameters, request body or exception message. |
| Correlation | Random server-generated 24-hex X-Request-Id | In response header and private structured log only. Caller-supplied ids are ignored. |
| Menu/game loading, failures and FPS | Opt-in AnonymousGameTelemetry → POST /api/v1/arcade/telemetry | Strict allowlist, 40 events/session, no identifier or free-text error, no offline retry. Separate IP rate limit 30/minute and 600/hour. |
| DB, cache, disk, scheduler | OpsReport read-only checks + 5-minute Cron heartbeat | Cache expiry and private local disk checks, no per-request SQL metric writes or new DB tables. |
| SLO / alerting | Rolling 15-minute private JSON log aggregation + OpsAlertDispatcher | Reads at most 2 MiB/day and 5000 lines. 30-minute deduplication via persistent cache. Optional mail contains only fixed alert code. |
| Protected dashboard | GET /cashier/admin/observability | Existing cashier HTTPS session; super-admin-only operations.readiness capability, no new role/permission. |
| Independent uptime | GitHub Actions every 30m after opt-in | Only public /api/v1/arcade/health; no private metrics/token data. GitHub schedule is best-effort. |

Private logs: storage/logs/demian-ops-YYYY-MM-DD.log, daily JSON lines retained seven days by Monolog. Host backups may retain copies longer; set legal/operational backup retention separately. Never expose storage or .env under public_html. Backend application exception logging is a **separate** system and should also be access-controlled and scrubbed.

Metrics are **sampled and biased toward slow requests and failures**. Percentiles calculated from them are approximate diagnostics, **not** true population-wide SLA proof. Missing samples are marked no-data; read truncation is explicit. No live host has been benchmarked by code CI.

## Production cPanel configuration

Verify actual PHP web + CLI 8.4, a dedicated API subdomain document root pointing to Laravel public/, MySQL/InnoDB, working persistent Laravel database cache, protected writable logs, backups, TLS and one-minute Cron. Use protected .env variables:

    DEMIAN_OPS_ENABLED=true
    DEMIAN_OPS_CLIENT_TELEMETRY=false
    DEMIAN_OPS_SUCCESS_SAMPLE_RATE=0.2
    DEMIAN_OPS_SLOW_REQUEST_MS=1500
    DEMIAN_OPS_HTTP_P95_MS=1000
    DEMIAN_OPS_GAME_LOAD_P95_MS=7000
    DEMIAN_OPS_ERROR_RATE=0.01
    DEMIAN_OPS_ALERT_EMAIL=

Optional alert email needs SMTP configured, tested and independently owned by the cafe operator. A green CI never certifies SMTP delivery. Client metrics should remain off until the actual privacy notice mentions the anonymized collection. For frontend, enable GitHub build variable DEMIAN_OPS_CLIENT_TELEMETRY=true only after the backend and privacy notice are ready. Backend requires both DEMIAN_OPS_ENABLED and DEMIAN_OPS_CLIENT_TELEMETRY=true.

Existing production scheduler Cron, every minute:

    * * * * * cd /home/ACCOUNT/demian-api/current && /usr/local/bin/ea-php84 artisan schedule:run >/dev/null 2>&1

Ops commands (only with private server access):

    php artisan arcade:ops:heartbeat --json
    php artisan arcade:ops:check --json
    php artisan schedule:list

The heartbeat and check run every five minutes with overlapping suppression and shared locking. Cron outage can stop its own alerts. **Independently**, after the host is reachable, set GitHub repository variable DEMIAN_MONITOR_API_ORIGIN=https://api.demiancafe.ir to activate .github/workflows/step33-external-health.yml. It runs every 30 minutes and checks only HTTPS 200 + status=ok + a release field. The Actions failure can be used for GitHub notifications but does not substitute 24/7 external commercial alerting or a physical uptime test.

## Alerts / incident playbook

| Code | Meaning | Safe initial response |
|---|---|---|
| database_unavailable | MySQL unreachable or essential table unavailable | Inspect DB quota/locks/connections and schema; hold financial rollout. |
| cache_unavailable | Persistent cache read error | Investigate DB cache table and lock store before any weekly settlement. |
| cron_stale | No heartbeat in 10 minutes | Inspect cPanel Cron, PHP CLI binary and scheduler locks; a dead scheduler cannot notify itself. |
| storage_unavailable | Cannot write private log folder | Correct folder ownership/permissions, never relocate logs to the webroot. |
| disk_low | Less than 512 MiB free | Audit backups/logs, IOPS and inode quota. Preserve financial evidence. |
| api_latency_high | Sample p95 over 1000ms, at least 20 events | Check PHP worker queue, EP/LVE limits, indexes and DB slow queries. |
| api_error_rate_high | Approximate 5xx/estimated requests over 1% with at least 20 events | Investigate private Laravel exception log correlated by request id. |
| game_load_high | Client load p95 over 7000ms with at least 10 samples | Check Open World tiles/CDN/cold mobile/network, do not assume PHP bottleneck. |

Only fixed alert codes are sent by the optional email transport. Cache-backed suppression prevents alert storms; if dedup cache fails, no mail is emitted (safe fail-closed; log code locally).

For an incident: capture current API release/health and current dashboard; preserve private log and DB backup; diagnose the relevant window; pause prize issuance with existing protected switches before changing ranks or financial ledgers; use immutable cPanel artifact rollback only for code, not automatic schema rollback; document causes and staging regression. Monitoring never changes scores, winners or vouchers.

## Acceptance gates

- [x] Code structure for HTTP/JS events, private dashboard, opt-in limits, health, alert codes and external probe exists.
- [ ] PHP SQLite and MySQL test suites including RBAC, data privacy, alert dedup and health.
- [ ] Node unit suite, PWA, all six browser games and Release QA gates.
- [ ] cPanel production installation, Cron, hostname/TLS, email delivery and alert recipient.
- [ ] 50 read/write/verified-replay concurrent user tests on authorized staging; p95/CPU/IOPS/EP validated.
- [ ] Real Android/iOS FPS and Open World asset load verification.
- [ ] Approved privacy notice and separate legal/prize clearance (Step 32 sign-off).

The last four require actual operator access and cannot be certified by GitHub Actions.
