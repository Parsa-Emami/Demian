> SUPERSEDED for live redemption: Phase 9 uses an authenticated physical cafe cashier,
> NOT an online merchant API. The online routes below have been removed (404).
> Use IN_CAFE_COUPONS_PHASE_9.md in this directory for current operation.
> The old integration below is retained as a historical design record only.

# Phase 8 — Secure, single-use checkout coupons

## Scope and activation

This code provides an internal voucher ledger, encrypted high-entropy codes, read-only authenticated player wallet, optional operator/scheduler issuance, signed merchant-only checkout adapter, reservation, one-time redemption, cancellation, revocation, audit trail and idempotent replays.

**All financial actions are disabled by default.** No storefront has been connected or tested against a real merchant checkout. The proposed rank tiers (1:30%; 2–3:20%; 4–10:10%) are not proof of business approval. A live launch additionally requires approved currency, minimum order, maximum discount, expiration, fraud/refund rules and an explicit merchant acceptance test. The old Domain\Economy\CouponManagementService is a dummy and MUST NOT be used for real vouchers.

Required, non-secret policy settings in production:
- DEMIAN_COUPONS_POLICY_APPROVED=true
- DEMIAN_COUPONS_POLICY_VERSION=example-v1 (assign only after actual policy approval)
- DEMIAN_COUPONS_CURRENCY=YOUR_ISO_4217_CURRENCY
- DEMIAN_COUPONS_MIN_ORDER_MINOR=positive_integer
- DEMIAN_COUPONS_MAX_DISCOUNT_MINOR=positive_integer
- DEMIAN_COUPONS_VALID_DAYS=1_to_365
- DEMIAN_COUPONS_ISSUE_ENABLED=true (only when backfill and delivery are approved)
- DEMIAN_COUPONS_SHOP_ENABLED=true (only when merchant signing and integration are tested)
- DEMIAN_COUPONS_AUTO_ISSUE_ENABLED=false (leave off until post-launch acceptance)

Keep long, random, **distinct** signing keys secret, outside Git:
- DEMIAN_COUPONS_SHOP_SIGNING_SECRET: >=32 random characters
- DEMIAN_COUPONS_SHOP_PREVIOUS_SIGNING_SECRET: optional >=32 random characters during rotation
- DEMIAN_COUPONS_ORDER_HASH_KEY: >=32 random characters; MUST stay stable for lifetime of orders/reservations, even when rotating webhook keys.
- APP_KEY: stable Laravel encryption key for code ciphertext. Rotating APP_KEY without re-encrypting coupons will make them unreadable. Use separate encrypted backups.

## Immutable issuance

Only the internal Artisan/service may issue. Weekly period must be sealed, complete, checksum-valid and have a matching technical-rank proof for each award. Codes use 128 bits from random_bytes, prefixed DMC-, and only SHA-256 code lookup hashes and Laravel encrypted ciphertext are persisted. Each weekly winner has a unique coupon constraint, and the transaction is all-or-nothing.

- Manual, audited safe gate: php artisan arcade:issue-coupons --week=weekly:tehran:2026-11-07 --apply --json
- Idempotent backfill: php artisan arcade:issue-pending-coupons --apply --limit=26
- Revocation (only pre-redemption): php artisan arcade:revoke-coupon --id=123 --reason=fraud --apply
- When explicitly enabled, the hourly minute-25 scheduler uses shared-cache single-server locking and follows the Phase 7b settlement task at minute 10. Provide a reliable cron job for schedule:run and database/Redis shared cache; never use array cache for distributed locking.
- Issuance CLI emits only counts, not coupon codes.

## Player wallet

GET /api/v1/arcade/player/coupons

Requires the existing 64-character player bearer token, with separate per-player rate limit. Replies use Cache-Control: private, no-store. Returns coupon id, award game/week/rank, percent, immutable currency/minimum/cap, expiration, effective status and **code only when unused and unexpired**. It never contains other players' coupons. Account erasure atomically revokes unused coupons and cancels outstanding reservations; redeemed records remain anonymous audit evidence.

## Shop protocol (server-to-server only)

All merchant calls are POST JSON to /api/v1/arcade/shop/coupons/{quote,reserve,commit,cancel}. Accept only TLS connections from the merchant's backend. Rate/size limits apply; browsers must NEVER have the signing key.

Headers:
- X-Demian-Shop-Timestamp: Unix seconds (±300 seconds)
- X-Demian-Shop-Event-Id: unique 8–80 character [A-Za-z0-9_-] ID for the signed delivery
- X-Demian-Shop-Signature: sha256= followed by lowercase hex HMAC-SHA256

Signed bytes, EXACTLY:
timestamp + "\n" + eventId + "\n" + pathWithoutLeadingSlash + "\n" + rawRequestBody

Example path: api/v1/arcade/shop/coupons/reserve

Quote JSON: {"code":"DMC-<32_HEX>","currency":"IRR","subtotal_minor":10000}
Reserve JSON: same plus {"order_ref":"shop-order-00001"}.
Commit/cancel JSON: {"code":"DMC-<32_HEX>","order_ref":"shop-order-00001"}.

Order references are non-PII unique merchant identifiers. Only HMAC digests of order references are stored. Do not include names, telephone numbers or email addresses. Coupon codes are high entropy; do not log them in request analytics or error reports.

**Quote:** reports computed discount, not a reservation. All amounts are integers in the configured currency's minor units; floor(subtotal*percentage/100), capped at the immutable max. Minimum spend enforced.

**Reserve:** locks the code row, ensures unused/not expired, creates an order-unique hold for 15 minutes (never beyond coupon expiry), responds 201 with reservation ID and reserved amount. Retries on same order+amount return its existing hold; other orders fail 409. An expired hold may be replaced by a *different* order reference. An old order reference is never reused.

**Commit:** merchant confirms order completion, supplies same code+order_ref. Only the matching unexpired hold can transition to redeemed. Separate unique constraints on coupon, order and reservation prevent double spend. Repeated commits for the same order return the same receipt. An already-redeemed code is never applied to another order.

**Cancel:** merchant releases a hold (for abandoned/failed checkout); a cancelled order reference cannot acquire a new voucher. Revocation, expiration and player deletion prevent future purchases. A redeemed checkout cannot be un-committed; handle refunds and compensation explicitly in the merchant system.

**Event replay:** authenticated event_id, action and SHA-256(path + newline + raw body) are stored atomically with a successful operation and its non-secret response. Same event and payload returns cached response; same event with different payload or route fails 409. Stale timestamps, invalid signature, absent secrets or disabled integration fail closed. Previous signing key supports controlled rotation.

## Operational acceptance and limits

The merchant must bind each reservation to its own real order, verify coupon reserve before displaying the final total, and commit only on successful authorized payment. There is no distributed transaction between a merchant's database and Demian's DB: the merchant must implement a **durable retry/outbox and reconciliation loop** for ambiguous network outcomes and refunds. A commit reply cannot replace the payment processor's payment status. Do not enable merchant integration without end-to-end staging tests of partial failures, timeout, retries, duplicate events, order abandonment, chargeback/refund and clock skew.

Operational verification: run full PHPUnit SQLite+MySQL matrix, frontend identity QA, inspect new migrations and query indexes, verify HMAC key handling, run representative load/concurrency on host, confirm backups/restores and monitoring. No production or real-money deployment is asserted by CI alone. Account for privacy retention and regulatory/consumer requirements before release.
