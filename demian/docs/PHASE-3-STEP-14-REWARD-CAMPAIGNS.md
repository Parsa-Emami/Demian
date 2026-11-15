# Demian — Phase 3, Step 14: Weekly reward campaigns and inventory

## Architecture and safety
- Default-off configuration switch: DEMIAN_COUPONS_CAMPAIGNS_ENABLED=false. Requires separately approved coupon policy and enabled cafe for the superadministrator panel. Weekly code issuance additionally requires DEMIAN_COUPONS_ISSUE_ENABLED=true. Never change production switches without business, red-team, and in-cafe UAT approval.
- Exactly one campaign per prepared future Tehran weekly period. A campaign freezes its policy version, percent tiers (never above approved 30/20/20/10), minimum spend, maximum monetary discount, validity days, and maximum prize count. Terms can be revised only in draft; after activation they are immutable.
- Import only valid in-cafe DMC codes (prefix DMC- followed by 32 uppercase hex digits). Batch accepts 1–200 unique codes and a UUID idempotency key. Global SHA-256 hashes prevent reuse against imported stock and all existing coupons. Plaintext is encrypted at rest, never written to audit records, and never returned to administrative views.
- Inventory transitions: available -> assigned, or available -> void. Assigned stock destroys its redundant encrypted copy; the encrypted capability lives in the owner coupon row. Coupon redemption remains controlled by the independent in-cafe issued/reserved/redeemed/revoked ledger. Assigned codes are never recycled on revocation, redemption, or account deletion.
- Activation requires enough stock to honor max_awards. The weekly issuer verifies the sealed snapshot and frozen campaign, then checks full stock coverage and assigns each imported code within one DB transaction. Any failure rolls back **all** coupon/stock/event changes. Lock order: period -> campaign -> winners -> inventory -> coupons. The pre-existing secure randomly generated voucher path stays available only when campaigns feature flag is off.
- UI is limited to active, authenticated super_admin via existing cafe permission #8, session middleware, CSRF, fresh password and explicit human confirmation. The 3/10 admin role is unchanged.
- Users receive codes ONLY inside their authenticated no-store in-app wallet; there is no email sending or e-commerce checkout integration.

## Operator acceptance and deployment
1. Run migrations, prepare upcoming periods using the existing weekly scheduler, verify persistent database backups.
2. Review coupon policy: currency, financial thresholds, validity and permissible rank tiers.
3. Enable staging campaign UI; create one future-week draft; enter and inspect the conditions, and import bank-issued unused codes.
4. Activate only after required stock is present; never issue more awards than capacity. Pause or close campaigns to prevent further issuance.
5. After weekly sealing, use the existing explicit coupon issuance command, or its independently authorized scheduler. Check the read-only coupon ledger and stock report.
6. Check security boundaries, idempotent imports, duplicate rejection, full-rollback shortage handling, pause/close, immutable terms, privacy erasure and exact-once redemption in real MySQL concurrent traffic tests.
7. Confirm mobile wallet and cafe cashier in staging with real devices before enabling payouts in production.

## CI gates
- GitHub Actions backend verification on SQLite/MySQL, Blade compilation, full PHPUnit and all existing frontend checks.
- Financial activation is an operator/business decision and is not implied by a successful code commit.
