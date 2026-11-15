# Phase 3 · Step 16 — In-app reward delivery, redemption and support

## Trusted boundaries
- Owner-only GET /api/v1/arcade/player/coupons remains the authoritative private in-app wallet. Codes are never emailed, stored in localStorage or included in admin views. Backend still hides expired/redeemed/revoked codes. The existing staff-only in-cafe redemption transaction remains authoritative; customers cannot redeem through a browser or claim an online checkout.
- A new disabled-by-default switch DEMIAN_COUPONS_DELIVERY_SUPPORT_ENABLED=false independently gates POST /api/v1/arcade/player/coupons/{couponId}/acknowledge and POST /api/v1/arcade/player/coupons/{couponId}/disputes. Both use the existing player-bearer auth and a dedicated token/IP rate limiter; neither endpoint creates or spends a coupon.
- Acknowledgement is an **explicit player action**. GET wallet is side-effect-free. One row per coupon and one audit event are inserted under player/coupon locks. Retrying returns the original timestamp, never a duplicate event.
- Disputes use UUID request idempotency, an immutable digest of original inputs, unique nullable open_coupon_id, a maximum 3 cases per player per rolling 24 hours, and bounded category/description. The server rejects pasted coupon codes, 64-character secrets, URLs and obvious contact details. A player may see only the id/state of their own latest case; the full admin note never enters the player API. The staff queue contains no bearer capabilities or actual coupon code.
- Existing super_admin coupon-management ability is reused (no extra permission added). The protected cashier page /cashier/admin/coupon-support requires HTTPS in production, CSRF, short-lived session, fresh password on each mutation, a confirmation checkbox, validated written reasons, and a locked session version. Only super_admin may close cases.
- Four decisions: explained (no financial change), rejected (no financial change), revoked (issued, not redeemed/reserved; irreversible), replaced (issued, not redeemed/reserved; same amount/percent/currency within **current** approved compensation policy). Replacement uses existing ManualCouponGiftService; the original is revoked **before** the new gift is issued inside the SAME transaction. If gift policy/quotas fail, the entire operation rolls back and the original coupon remains valid. Neither campaign stock nor redeemed records are recycled. The old code is never reissued.
- Case results and linked replacement coupon id are immutable, with append-only events and operator audit; repeated same decision is idempotent, different decisions fail 409. The new compensation code appears only in its owner's existing wallet as a gift; a customer can then present it to the cashier. All financial actions stay default-off until separate approval.
- Player erasure scrubs all case free text, nulls owner references and revokes active coupons; hash-only accounting and financial audit survive without identity data.

## Operator rollout
1. Apply the additive migration 2026_11_15_000005 on staging and verify backup/rollback.
2. Leave DEMIAN_COUPONS_DELIVERY_SUPPORT_ENABLED=false in production until private-wallet Android/iOS/desktop UAT and authorized staff training.
3. Confirm cafe HTTPS, sessions, policy, receipt-HMAC setup, and MySQL InnoDB. The dispute dashboard requires DEMIAN_COUPONS_CAFE_ENABLED=true.
4. For *replacement* decisions alone, separately approve DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED=true plus currency, maximum percent/amount and gift quotas. Any mismatch or insufficient original validity fails closed.
5. Verify receipt status after one owner acknowledgement, dispute ID after one submission, two-staff concurrency rejection, old coupon unusability and new compensation visible only to the original account.
6. Check CouponLedgerAudit and the cashier admin event log; keep original campaign-ledger provenance and historical snapshots immutable.

## Validation gates
Feature tests cover isolated default-off feature flag, owner authorization, no GET side effects, once-only receipt, support UUID retry, duplicate/open-case isolation, staff permissions/password/session, no-code admin view, atomic compensation, rollback, original redemption, erasure and email/notification non-delivery. New JS service tests cover bearer auth, no-store requests, strict input validation and no client code persistence. Existing SQLite/MySQL PHPUnit, real MySQL fork stress, frontend and browser/mobile CI must be green before main merge.

Out of scope: modifying a redeemed transaction or automatic refunds; real point-of-sale voids/refunds require a separate audited financial integration and commercial approval.
