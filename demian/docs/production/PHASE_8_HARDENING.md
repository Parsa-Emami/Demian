# Phase 8 supplemental security gates (post-merge hardening)

## Merchant transport

The merchant API rejects cleartext HTTP whenever APP_ENV=production, even for a correctly HMAC-signed request. Route the real merchant through HTTPS and configure Laravel's trusted proxy settings correctly when cPanel terminates TLS before PHP. Do NOT trust arbitrary client-supplied X-Forwarded-Proto. Test with a real HTTPS staging order and the true reverse proxy configuration before setting DEMIAN_COUPONS_SHOP_ENABLED=true.

## Account erasure and secret revocation

Migration 2026_11_14_000006 permits arcade_coupons.code_ciphertext to be NULL. Erasing a player clears ciphertext for every associated code (including redeemed history); unspent codes are revoked, outstanding holds cancelled, and the nonsecret transaction ledger is retained for audit. Operator fraud/policy/incident revocation also clears the encrypted code. Apply the additive migration before deploying the updated erasure service; back up the DB first. The down migration intentionally does not recreate deleted secret material.

## Read-only audit

Run php artisan arcade:audit-coupons --json after any migration, issuance batch, incident, account deletion, export/restore or payment reconciliation. It verifies referenced sealed weekly winners, proposal tiers, encryption/hash integrity, known lifecycle states, unique active holds, committed receipts, and existence of issuance events. It never exposes coupon plaintext, HMAC keys or original order references. A failed audit blocks live merchant release; investigate and reconcile against the protected checkout ledger rather than silently editing captured events.

## Remaining launch prerequisites

Actual business approval of percentage tiers and spending caps, currency precision, real storefront identity/checkout, payment authorization and cancellation/refund mapping, TLS proxy acceptance testing, multi-worker race/load testing, production rollback/backup rehearsal and monitoring. These are not completed by GitHub CI; merchant and auto-issue flags stay false by default.
