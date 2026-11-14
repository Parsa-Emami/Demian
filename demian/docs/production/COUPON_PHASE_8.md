# Demian Phase 8 — Secure weekly discount coupons

## Trust, policy and activation

**Implemented:** encrypted 128-bit random coupon creation after Phase 7b sealing; 30/20/10 percentage tiers, separate prize rank; cap/minimum and ISO currency in smallest currency unit; expiring one-use vouchers; owner-only retrieval; HMAC-authenticated merchant quote/reserve/capture/release; persistent anti-replay nonces; audited idempotent order lifecycle and account erasure.

**Disabled by default:** no real code issuance, checkout or automatic issuance until the operator explicitly approves all commercial values and the store integration. The code never uses the old `Domain/Economy/Services/CouponManagementService.php` placeholder (which unconditionally returned true). Other games remain ineligible until a server-side verifier is added.

Configuration keys: `DEMIAN_COUPON_ISSUANCE_ENABLED=false`, `DEMIAN_COUPON_STORE_ENABLED=false`, `DEMIAN_COUPON_POLICY_APPROVED=false`, `DEMIAN_COUPON_CURRENCY` (exactly three uppercase letters), `DEMIAN_COUPON_VALID_DAYS` (1..365), `DEMIAN_COUPON_MINIMUM_MINOR` (0..1,000,000,000), `DEMIAN_COUPON_CAP_MINOR` (1..1,000,000,000), `DEMIAN_COUPON_STORE_ID`, `DEMIAN_COUPON_STORE_HMAC_KEY` (independent 32-byte key as 64 hex characters). All monetary amounts are integer minor units, never floating point. The 30/20/10 tier mapping must be explicitly approved; it is not an externally confirmed marketing policy. Currency scales must match the store's official order accounting.

Policy is snapshotted and SHA-256 hashed with the immutable period seal for each batch. Re-running issuance with the same policy is a no-op. Re-running with a modified policy fails closed; it never silently rewrites old entitlements. Account deletion revokes unspent vouchers, erases encrypted code payloads and keeps anonymized audit data.

## Operations

1. Run `php artisan migrate --force` against an isolated staging database. Back up production before the production migration. Check PHP/OpenSSL, APP_KEY/APP_PREVIOUS_KEYS key rotation, clock sync, TLS termination and a persistent shared scheduler lock cache.
2. Verify `php artisan arcade:integrity --json` and `php artisan arcade:coupons:audit --json`. Require every target week to be sealed by Phase 7b and its scoring rules to remain verifiable. Test the store HMAC contract against a staging purchase, cancellation, retry and captured order.
3. Explicitly approve percentage tiers, minimum spend, cap, expiry, target currency and actual merchant integration. Configure the environment and restart PHP workers/config cache as applicable. HMAC signing key: `php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'` (store only in secret manager or environment, never commit).
4. With policy approval/issuance enabled, manually run `php artisan arcade:coupons:issue --week=2026-11-14 --apply --json` (or `--pending --apply` for chronological catch-up). Both `--apply` and exactly one scope are mandatory. No plaintext code is written to CLI logs. Then re-run audit.
5. When `DEMIAN_COUPON_POLICY_APPROVED=true` and `DEMIAN_COUPON_ISSUANCE_ENABLED=true`, a guarded hourly minute-20 schedule can catch up sealed but unissued weeks; do not enable in a production system with unresolved historic settlement. A separate daily nonce cleanup task runs only with store integration enabled.
6. **Manual/store controls remain essential:** do not capture a voucher until the actual merchant has authoritative payment/order completion. On timeout retry capture with the same order ID and a NEW signed nonce. A release is allowed only before capture. Post-payment refunds need a separate documented compensating business process (not silently re-crediting the same code).

## Customer and store HTTP contract

- Owner with existing arcade bearer: `GET /api/v1/arcade/player/coupons` (private no-store). The code is decrypted only for its original authenticated owner while still unexpired and unspent. Codes are not present in public leaderboards or audit output.
- Signed store endpoints: `POST /api/v1/arcade/store/coupons/quote`, `/reserve`, `/capture`, `/release`. JSON for quote/reserve/capture: `{"code":"DMN-<32 uppercase hex>","player_id":"<arcade-player-uuid>","order_id":"order-123","order_total_minor":10000,"currency":"USD"}`. Quote does not require order_id. Release needs only code, player_id and order_id. All responses provide only calculated nonsecret amounts/statuses.
- **Merchant must verify the player's true authenticated identity** (e.g. a completed account-linking handshake) before submitting `player_id`; never trust a user-submitted player UUID. The storefront must verify authoritative payment and persist the exact order total/currency before capture. Checkout must ensure a coupon cannot be stacked or used to exceed the allowed discount.
- Each store request sends `X-Demian-Timestamp` (Unix seconds), `X-Demian-Nonce` (32 lower-hex chars, new on each HTTP attempt), and `X-Demian-Signature` (lowercase hex SHA-256 HMAC). Canonical bytes are timestamp + newline + nonce + newline + uppercase HTTP method + newline + literal request path with leading slash + newline + the raw JSON request body. Secret is hex-decoded. Sign the exact bytes sent; retries use a new nonce even with the same order ID. 300s clock skew; a nonce is globally single use and stored in the database; HTTPS is required in production.
- Order IDs are merchant-unique across all Demian coupons, including canceled/expired reservations. The DB unique constraint guarantees no order is used twice under racing requests. Reservation lasts 15 minutes. Expired reservations cannot be captured; an eligible new reservation lazily expires the old one. Captured coupons cannot be released or reissued. A different total/currency/order ID on a retry fails closed.
- Explicit fail-closed errors: 401 unauthenticated signatures, 409 replay/order collision/occupied reservation, 422 invalid coupon/owner/amount/currency, 503 gates or missing merchant credentials. Both code and HMAC key remain absent from committed source, order logs and audit details.

## Persistence and integrity

`arcade_reward_batches` freezes policy+settlement hash; `arcade_coupons` uniquely associates a sealed winner to one encrypted coupon and a digest-only lookup; `arcade_coupon_reservations` has a unique merchant/order key, locked transaction state and captured discount; `arcade_coupon_events` records nonsecret, append-only changes; `arcade_coupon_request_nonces` blocks replay. SQL transactions, deterministic lock order (player then coupon then reservation), unique indexes and retry-after-deadlock behavior guard real multi-worker MySQL. SQLite and MySQL integration tests validate logic; production load tests and real merchant settlement remain separate launch gates.

## Unresolved external dependencies

The actual shop platform, checkout/payment APIs, confirmed monetary policy, customer identity binding, promotion disclosure, and legal tax/currency behavior are not provided. Consequently no real merchant API keys are installed, no live purchase has been attempted and all feature gates stay disabled. This code is a complete internal lifecycle/adapter contract, not proof of production merchant integration.
