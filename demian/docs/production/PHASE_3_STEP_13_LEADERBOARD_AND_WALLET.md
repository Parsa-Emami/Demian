# Phase 3 / Step 13 — Weekly leaderboard and in-app discount wallet

Scope: Demian 34-step single-player asynchronous weekly roadmap. Implements
player-facing leaderboards and a **separate in-app discount-code page** without
email delivery. Does NOT introduce new prize selection, create codes without
approved issuance, or launch an unverified backend.

## Architecture: trust boundaries

- All weekly times are computed with Asia/Tehran (Saturday 00:00 local) and
  persisted as UTC. The browser uses server_time / next_reset_at plus a
  monotonic timer instead of trusting mobile wall clock.
- Verified per-game leaderboards remain supported (daily, all, weekly, device).
  The shared **all-games** view reads only runs that completed server replay
  verification, match their own stored score/version/player, and started
  inside the selected Tehran week.
- A capped query (5,000 personal-best rows per current week) prevents a
  request from silently streaming an unbounded dataset. Over-cap or
  inconsistent proof fails CLOSED. The browser polls at most once per 60
  seconds while visible, plus one immediate weekly-rollover refresh.
- Active week: an explicitly **live_preview**, provisional comparison using
  the versioned Step 12 relative-cohort scoring algorithm (0–1000).
  A game needs >=20 independent account identities for qualified standings;
  these do not prove human identity or equal game difficulty. NO live score
  is a financial award or a guaranteed future ranking.
- Sealed week: **finalized** standings read ONLY the frozen SHA-256-verified
  Step 12 snapshots. If a historical week lacks an approved snapshot it is
  **archive_pending**, never silently recalculated using current rules.
- Weekly history is an operator-bound list of at most 12 existing seasons,
  with a hard 52-week historical bound. Invalid Saturday, future weeks,
  invalid/oversized limit and arbitrary date scans are rejected (HTTP 422).
- Public top 20 does not disclose the current player's private account rank.
  The exact owner rank, including a participant outside top 20, is accessible
  ONLY with the authenticated bearer identity in middleware; client-supplied
  player_id is not accepted. Private response uses Cache-Control: private,
  no-store. Public read uses a small bounded cache interval.
- Equal normalized points share a competition rank; stable earlier verified
  run timestamp and stable identifier order display positions, not rewards.
  The frontend uses textContent to render untrusted player display names.

## Dedicated page: «تخفیف‌های من»

The previously embedded wallet section is moved to a separate modal screen
[data-screen="coupon-wallet"] accessible from the cafe menu, leaderboard, and
results screen. It has responsive RTL layout, keyboard/mobile and screen-reader
status announcements. The page shows **only the authenticated player's**:
- discount percentage (from existing approved code policy)
- prize position or gift source, eligible game/week
- coupon state (issued, reserved, redeemed, expired, revoked)
- expiration date in Tehran and monetary cap/minimum order in policy currency
- complete coupon code only while issued or reserved
- copy-code control with safe manual selection fallback.

GET /api/v1/arcade/player/coupons already exists and enforces bearer identity
from AuthenticateArcadePlayer middleware; there is **no player_id URL parameter**.
It is read-only and returns Cache-Control: private, no-store.
No outbound email, mail queue, notification or automatic voucher delivery is
added. The browser NEVER persists plaintext coupon codes in localStorage,
sessionStorage, attributes, URLs or analytics. The modal clears its entire
code list on close and ignores an in-flight response after account change.
The backend does not return redeemable plaintext for spent/expired/revoked
coupons; the UI additionally refuses to show an unexpected code for those
statuses.

Accounts restored on a different device use the existing authenticated
recovery-link/one-time backup-code workflow, NOT email or an unauthenticated
coupon lookup. The in-app rewards page links to the account recovery controls
in the leaderboard. A disconnected/static-only game shows a clear explanation
rather than fake or locally issued coupons.

## Endpoints

Public (only server-verified scores; not prize entitlements):
    GET /api/v1/arcade/competition/leaderboard
    GET /api/v1/arcade/competition/leaderboard?week=2026-11-07
    GET /api/v1/arcade/competition/leaderboard/weeks

Bearer authenticated owner exact rank:
    GET /api/v1/arcade/player/competition/leaderboard
    GET /api/v1/arcade/player/competition/leaderboard?week=2026-11-07

Bearer authenticated private wallet (unchanged server contract):
    GET /api/v1/arcade/player/coupons

These endpoints never POST a score or issue a coupon.

## Acceptance criteria and tests

1. PHP/SQLite and MySQL: public current/archived source validation, 20+
   qualifying cohort, 0–1000 points, equal-rank ties, no phantom prize,
   expired and invalid week validation, no unbounded reads.
2. Exact owner personal rank when outside the top 20, private Cache-Control,
   no sender-supplied identity, expired/incorrect bearer rejected.
3. A malformed/forged score or replay cannot inflate a public leaderboard;
   verified technical settlement, fair snapshots and coupon allocation
   remain unchanged. Historical account erasure is respected.
4. Mailing and notification fakes confirm that wallet lookup and issuance
   don't generate email or direct notifications. No customer mail endpoint.
5. Node client tests assert public requests send no auth, private ranks and
   wallet require bearer, codes aren't cached/persisted and failed sessions
   clear tokens.
6. Chromium on the actual static release with mocked trusted API:
   dedicated wallet code/percent/cap, retired coupon codes hidden, closing
   removes secrets, untrusted names cannot inject HTML, shared live and
   finalized history, owner rank, CSS at 320px and no email request.
7. Entire existing CI (PHP SQLite/MySQL, JavaScript, browser QA, responsive
   mobile profile emulation and static build) remains green.

Browser QA uses **emulated dimensions**, not physical-device evidence.
No coupon issuance flags or automatic email features have been enabled.

## Production operator gate

Deploy latest PHP migration/contracts to a staging copy, verify auth/session
and API URL over HTTPS, configure reverse proxy to avoid caching any private
wallet response, run actual 50-player session/load and bot/cross-account
acceptance, and only then separately approve the discount policy and code
issuance. Outstanding #44, #28 and #49 remain OPEN until verified. Static
GitHub Pages success is not equivalent to PHP/MySQL backend go-live.
