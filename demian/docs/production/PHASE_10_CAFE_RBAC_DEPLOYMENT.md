# Phase 10 — cPanel Production Readiness, Admin 3/10 and Super Admin 10/10

Demian vouchers are physical cafe promotions: a verified weekly winner shows a code to an authenticated cashier, who checks the actual cafe ticket and confirms one-use redemption. No payment gateway or online-shop integration is required.

## Explicit permissions (deny by default)

The numeric labels represent the number of actionable server-enforced capabilities, NOT trust scores:

| # | Capability | Cashier | Manager | Admin 3/10 | Super Admin 10/10 |
|---|---|---|---|---|---|
| 1 | coupon.lookup — validate without spending | yes | yes | YES | yes |
| 2 | report.branch — branch report | no | yes | YES | yes |
| 3 | staff.directory — staff roster | no | no | YES, same branch only | yes, all branches |
| 4 | coupon.redeem — confirm one-use in-cafe redemption | yes | yes | NO | yes |
| 5 | report.global — all-branch report | no | no | NO | yes |
| 6 | staff.disable — suspend staff | no | no | NO | yes |
| 7 | staff.enable — reactivate staff | no | no | NO | yes |
| 8 | coupon.revoke — permanently cancel an unused voucher | no | no | NO | yes |
| 9 | audit.ledger — inspect voucher integrity | no | no | NO | yes |
| 10 | operations.readiness — inspect production gates | no | no | NO | yes |

The capability map is stored in app/Services/Arcade/CafeAccess.php and checked in route middleware AND controller/service logic. An unknown role has zero permissions. A staff account is blocked when inactive, its session version changes, or its session expires.

The 3/10 admin is explicitly **read-only** and cannot consume a code. Super admin has all ten in-cafe web permissions but cannot deploy servers, change financial policy, issue coupons manually or bootstrap another superadmin via the browser: those sensitive functions remain offline SSH/operator responsibilities.

## Bootstrap without hard-coded credentials

After running migrations on a controlled server and using a trusted terminal, create the very first superadmin with an interactively prompted/hidden password (at least 12 characters, mixed case and number):

    php artisan arcade:cashier:staff create --username=owner01 --display-name=Owner --branch=cafe-main --role=super_admin --ack-super-admin --apply

Create limited admin, cashier and manager separately:

    php artisan arcade:cashier:staff create --username=admin01 --display-name=Admin --branch=cafe-main --role=admin --apply
    php artisan arcade:cashier:staff create --username=cashier01 --display-name=Cashier --branch=cafe-main --role=cashier --apply
    php artisan arcade:cashier:staff create --username=manager01 --display-name=Manager --branch=cafe-main --role=manager --apply

SSH-only role promotion with acknowledgement:

    php artisan arcade:cashier:staff set-role --username=admin01 --role=super_admin --ack-super-admin --apply

Last active superadmin may not be disabled or demoted even via CLI. Browser operations cannot deactivate any superadmin. Staff disabling/enabling and voucher revocation require explicit confirmation, current superadmin password and throttling. Every change writes an append-only audit entry, and session_version increments on account changes.

## Production-safe deployment gates

The existing GitHub Actions cPanel workflow is MANUAL, requires production approval and external encrypted backup/restore receipt, uses separate production/staging secrets, verifies PHP and Composer, packages only backend assets, locks deployment, applies migrations and verifies API health. Phase 10 adds read-only checks BEFORE switching current symlink:

    php artisan arcade:integrity --json
    php artisan arcade:audit-coupons --json
    php artisan arcade:cafe:preflight --target=staging --json

When physical redemption is enabled, the deploy script instead runs:

    php artisan arcade:cafe:preflight --target=staging --require-live --json

Production uses --target=production. Safe disabled rollout checks PHP version, APP_DEBUG=false, HTTPS APP_URL, APP_ENV matching target, API-only isolation, MySQL, persistent database sessions, SESSION_SECURE_COOKIE=true, shared cache, online shop disabled, database connectivity, required migrated tables and recognized roles. Live activation additionally requires the cafe feature flag, approved financial policy, independent stable HMAC receipt hash key, active superadmin, eligible cashier and clean coupon ledger. The script tests the actual HTTPS cashier login endpoint after cutover (200 when enabled, 503 when disabled) and rolls back CODE symlink on smoke failure; migrations/history are NEVER reversed automatically.

The Production feature switches stay false until signed staging approval: DEMIAN_COUPONS_CAFE_ENABLED=false, DEMIAN_COUPONS_POLICY_APPROVED=false, DEMIAN_COUPONS_ISSUE_ENABLED=false, DEMIAN_COUPONS_AUTO_ISSUE_ENABLED=false. Do not put passwords, receipts, HMAC keys or staging/production .env in GitHub.

## Required physical UAT / acceptance checklist

- Inspect permissions as admin (three read-only actions), superadmin (all ten), cashier and manager; explicitly attempt forbidden direct HTTP routes and record 403.
- Verify no default staff account, no shared login, login throttling, password revalidation for critical operations, immediate session invalidation on suspension, and prohibition of last-superadmin deletion.
- Verify winning player receives correct code/percentage/expiry/minimum/cap, and no other player can read it. Verify lookup alone does not spend the code.
- Perform one REAL staging cafe purchase and manually reconcile the cash register bill with the system-discount calculation in integer minor currency units; verify explicit confirmation and one-time redemption.
- Test code already redeemed/expired/revoked, duplicate ticket, two cashiers racing to redeem the same code, lost HTTP acknowledgement and identical request-key retry. Only one ledger receipt must exist; invoice cannot be discounted twice.
- Revoke an unspent test code, ensure it cannot be used, and verify captured orders cannot be revoked or reissued. Confirm manager reports are branch-isolated; superadmin global report excludes customer codes and raw ticket IDs.
- Run read-only coupon audit and check anonymization after account erasure. Verify encrypted code and ticket HMAC keys do not appear in logs, data exports or browser caches.
- Rehearse encrypted offsite backup RESTORE and code rollback separately, TLS/reverse-proxy trust and cookie security, PHP scheduler and alerts, and restart recovery.
- After hosting-provider authorization, run 50 simultaneous READ-ONLY GET requests with:
  node demian/tools/smoke_arcade_api.mjs --base-url=https://YOUR-API-DOMAIN/api/v1/arcade --users=50 --p95-ms=1500
  This is NOT equivalent to 50 real simultaneous gameplay or cashier purchases: separate bounded staged authenticated/write-duration load testing is needed before claiming that capacity.
- Record a private UAT acceptance sheet: release SHA, test operator, date, branch, financial policy/currency, approved discounts, backup receipt, restore result, actual physical bill reconciliation, audit results and incident contact.

## Important limitation

GitHub Actions tests code on SQLite/MySQL and in a browser; GitHub Pages deploys the frontend only. Neither is a live cPanel Backend installation or physical cashier acceptance. Never claim the cafe is live until a real host and signed UAT are verified.