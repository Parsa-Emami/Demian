# Cafe Rewards — Phase 11: Superadmin Manual Coupon & Gift Management

This is Phase 11 of the CAFE REWARDS track. Another legacy repository document called PHASE-11-IMPLEMENTATION.fa.md describes Character Core V4, a separate workstream. Do not confuse or overwrite it.

## User story
Super Admin (10/10) may gift a one-time coupon to any existing player. Admin (3/10), manager, cashier and player cannot issue gifts. Permission #8 (coupon management) now includes the manual-gift sub-operation, without expanding the ten top-level permissions. Weekly winner selection and score/rank tables remain untouched.

1. Sign in as an individual superadmin on HTTPS /cashier/login. Open /cashier/admin/gifts.
2. Search a player's display-name prefix or exact UUID. Results only reveal the display name and player ID, not the token or recovery code.
3. Select player, percentage, approved minimum purchase, monetary cap, expiry in days and reason (birthday, compensation, vip, campaign, other). Enter an optional short non-sensitive note.
4. Re-enter superadmin password and check explicit confirmation before POST. The transaction locks the staff and recipient, checks session version, feature flags, quotas and approved monetary policy. A unique request UUID and immutable SHA-256 digest prevent duplicate or modified replays.
5. A unique 128-bit CSPRNG DMC voucher is encrypted at rest. Admin does NOT see its plaintext. The recipient's authenticated game wallet shows it with source=gift, percentage, currency and expiry; no fake leaderboard ranking is attached.
6. A cashier inspects the displayed code (read-only) and redeems it only on explicit confirmation for a real physical cafe ticket. Existing atomic redemption, expiration, revocation and audit apply. Erasure destroys the recoverable code and nulls player identifiers, retaining anonymized evidence.

## Safe defaults and immutable limits
DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED=false independent from DEMIAN_COUPONS_ISSUE_ENABLED, and both DEMIAN_COUPONS_CAFE_ENABLED and DEMIAN_COUPONS_POLICY_APPROVED must be enabled. The approved CouponPolicy still establishes currency and maximum financial limits.
Default manual bounds: 1–30% discount (never above approved weekly maximum); 1–30 valid days (never above base validity); minimum order >= policy minimum; discount cap >0 and <= policy maximum; <=20 gifts per issuer per Tehran day; <=1 gift per recipient per Tehran day.
Financial values are INTEGER minor currency units. For IRR the field is RIALS, never tomans. These are code-level maximums, not a substitute for explicit cafe-owner commercial approval. Do not enable manual issuance before live staging acceptance.

## Database, audit and privacy
Additive migration 2026_11_14_000009 creates arcade_coupon_gifts, with request-key uniqueness, request digest, issuer foreign key and nullable player foreign key, reason and bounded note. arcade_coupons.winner_id becomes nullable without dropping its foreign key/unique index; new source defaults to weekly and gift_id is a nullable UNIQUE foreign key. Weekly coupons remain linked to sealed award evidence; manual gifts have separate provenance.
Atomic DB transaction creates one gift, one encrypted coupon, one nonsecret coupon event and one superadmin audit event. Issuer and recipient row locks enforce daily limits; unique indexes guard multi-worker retries. No plaintext code, secret, player token or raw cash-register ticket in the admin's ledger or responses.
Read-only arcade:audit-coupons --json verifies manual/weekly provenance separately and detects missing events, orphaned gifts, encrypted capability mismatches and redemption conflicts. Original player erasure/revocation behavior is preserved.

## Staging and production acceptance
1. Back up staging MySQL, run migrations, check PHP 8.4, HTTPS, secure DB sessions, trusted proxies, APP_DEBUG=false and original arcade integrity audits.
2. Verify 403 for admin/manager/cashier/anonymous gift routes, expired staff sessions, invalid password/CSRF, quotas, daily limits, duplicate and altered replays, tampered ledger and missing recipient.
3. Verify weekly award issuance still works and gift issuance never changes weekly results. Confirm code privacy and 1-use cashier redemption (including duplicate cashier/receipt races) with test players.
4. Run arcade:cafe:preflight --target=staging --require-live --json and arcade:audit-coupons --json. When manual gifts are enabled, preflight verifies approved bounded gift terms.
5. Complete physical cafe purchase rehearsal, real MySQL multiworker tests, backup/restore rehearsal, staff training, confirmed promotion policy and signed owner approval before enabling on production.

GitHub Actions passing is NOT proof of production hosting, approval, live customer availability or a real in-cafe purchase. All issuance gates default OFF.
