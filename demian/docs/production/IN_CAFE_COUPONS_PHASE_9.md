# Demian Phase 8 correction + Phase 9 — In-cafe discounts

For Phase 10 admin/superadmin RBAC and production gates see PHASE_10_CAFE_RBAC_DEPLOYMENT.md in this directory.

## Only physical in-cafe redemption is supported

The weekly, sealed leaderboard selects winners and Phase 8 issues a 128-bit encrypted one-time voucher with the approved proposed tiers (1st: 30%, 2nd–3rd: 20%, 4th–10th: 10%). An authenticated winner opens the game leaderboard and sees their own voucher code, percentage, expiry, minimum bill and maximum discount. The customer presents the code **in person** at the café. There is no e-commerce website, payment gateway, online order integration, or self-service redemption.

The previous online merchant API paths under /api/v1/arcade/shop/coupons are REMOVED (404); the legacy shop-related database records remain intact for backward compatibility and audit. Current staff redemption is exclusively via the Laravel web route /cashier after login.

## Cashier workflow

1. Cashier uses https://YOUR-API-DOMAIN/cashier/login and signs into their own account. A player account token cannot access this panel.
2. Cashier enters the customer's DMC voucher. Lookup shows status, discount percentage, currency, minimum purchase, cap and expiry. **No code is consumed when inspected.**
3. Cashier confirms the real physical purchase, enters the cafe cash register receipt reference (a unique non-personal identifier) and the pre-discount bill amount in integer minor currency units (if the voucher currency is IRR, the entered value must be in rials, not tomans).
4. Cashier explicitly checks the confirmation box and submits. A DB transaction locks staff and coupon, revalidates expiry, amount and status, calculates floor(percentage * subtotal / 100) with a capped amount, and records one immutable redemption, one cashier request and one audit event. The cashier sees the finalized discount amount to apply in the physical register. **Do not confirm before the physical transaction is final.**
5. Repeating the exact same request UUID and matching receipt/amount/cashier returns the same receipt without another consumption. A different request, different cashier, new receipt or second voucher on the same physical receipt fails.
6. A branch manager (role manager) can review 50 most recent in-cafe purchases from their branch without viewing customer codes or raw receipt references. Ordinary cashiers cannot view reports.
7. After consumption, the player's private wallet shows status redeemed with no code. Account erasure/revocation removes encrypted secrets and preserves anonymized audit evidence. Redeemed vouchers cannot be reissued automatically as refunds.

## Schema / guarantees

Additive migration 2026_11_14_000007_add_in_cafe_cashier_redemptions.php:
- arcade_cashier_staff: unique normalized username, strong password hash, branch, cashier/manager role, active flag, session_version for immediate account invalidation.
- arcade_coupon_redemptions: existing immutable ledger keeps one-per-coupon and one-per-ticket unique constraints. Add channel, cashier_id and branch_id. reservation_id is nullable only for the in-cafe channel; historical merchant records remain readable.
- arcade_cashier_requests: unique UUID, coupon, ticket HMAC digest, staff and receipt foreign keys; idempotence and race evidence without storing raw ticket strings.

All writes use DB::transaction with deadlock retries, the same staff/coupon row locks, SQL unique indexes and append-only coupon events. A receipt reference is HMAC-SHA256 hashed with branch ID, using a separate stable secret. Same ticket sequences in different branches are supported, while a single physical voucher can never be redeemed twice. Unknown/expired/revoked/reserved vouchers cannot be consumed.

The cashier interface is independent of the player bearer. It uses Laravel web sessions, password hashing, rate-limited login and lookup/redemption, CSRF, session ID regeneration, bounded eight-hour session, forced logout on deactivation/password reset, and HTTPS in production. Sensitive pages use no-store caching, anti-framing headers and a script-disabled CSP. Only the signed-in staff ID is used for consumption; requests cannot supply a trusted staff ID.

The game frontend fetches the reward wallet only from the HTTPS authenticated API and does not cache discount codes in localStorage. The voucher is removed from the DOM when the leaderboard screen closes.

## Staging / cPanel activation checklist

1. Provision a real staging API with PHP 8.4 web/CLI, MySQL 8/InnoDB, HTTPS, cron, backups, secure Laravel public/ document root and distinct APP_KEY. Set SESSION_DRIVER=database, CACHE_STORE=database, SESSION_SECURE_COOKIE=true and SESSION_SAME_SITE=lax. Validate trusted proxy handling and avoid trusting unverified X-Forwarded-Proto.
2. Run php artisan migrate --force. Back up production DB before rollout; the new migration is additive. Run php artisan arcade:integrity --json and php artisan arcade:audit-coupons --json.
3. Approve the promotion policy **explicitly**: exact 30/20/10 tiers, selected currency and scale, minimum purchase, maximum discount, expiry, refund rules and staff register process. Configure the existing Phase 8 issuance policy and set DEMIAN_COUPONS_POLICY_APPROVED=true only after approval. DEMIAN_COUPONS_ISSUE_ENABLED must stay false until sealed periods are reviewed.
4. Generate a separate random receipt digest key using PHP random_bytes(32) and provision DEMIAN_COUPONS_CAFE_RECEIPT_HASH_KEY exclusively in server secrets. It MUST be stable for the lifetime of all receipts. Never put it in repository, logs or conversation.
5. Create staff with the protected server terminal (the password is prompted invisibly, NEVER a command-line flag):
   php artisan arcade:cashier:staff create --username=cashier01 --display-name=Cashier --branch=cafe-main --role=cashier --apply
   php artisan arcade:cashier:staff create --username=manager01 --display-name=Manager --branch=cafe-main --role=manager --apply
   To suspend: php artisan arcade:cashier:staff disable --username=cashier01 --apply
   To enable: php artisan arcade:cashier:staff enable --username=cashier01 --apply
   To reset password: php artisan arcade:cashier:staff reset-password --username=cashier01 --apply
6. In staging set DEMIAN_COUPONS_CAFE_ENABLED=true and test the full customer-to-register flow. Verify that API-only mode does not accidentally expose unrelated /characters routes and that the cashier login works. Avoid any shared account.
7. Perform provider-authorized realistic multi-worker tests with simultaneous cashier submissions and 50 active players, failed/duplicated requests, lost acknowledgement retries, staff deactivation, expiration, account erasure and backup/restore. For refunds, require a documented, audited manual process rather than returning an already redeemed voucher to issued.
8. Only after acceptance, provision separate production accounts and keys, enable physical in-cafe redemption and monitor failed lookups, anomalous coupon audits, DB locks, errors and backup age.

## Important production limitation

The GitHub Actions matrix tests code in SQLite/MySQL and frontend browser simulation, NOT real cPanel capacity, physically present cashiers or owner approval of financial terms. Default is DEMIAN_COUPONS_CAFE_ENABLED=false and the removed online merchant API cannot spend vouchers. Do not advertise code redemption as live until the physical end-to-end trial is signed off.
