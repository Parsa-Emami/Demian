# Roadmap 90+ — Phase 02: Dino Run difficulty and competitive balance

Status: implemented, pending GitHub Actions acceptance. This branch is independent of the API deployment change in PR #87; merge Phase 1 first, then revalidate Phase 2 against the updated main. No hosting access or financial activation.

| Mode | Beginner practice | Official competition |
|---|---|---|
| Entry | Default, no network/account handshake | Explicit button; valid server-issued session |
| Level | 2 toward 6, exponential ramp (55 s) | Existing 6 toward 10 (90 s) |
| Speed | 260 toward 470, +2.1/s | Unchanged 450 toward 640, +3.6/s |
| First spawn | 1.4 s | Unchanged 0.22 s |
| First hazard lead | 2 s subject to viewport cap | Unchanged 1.05 s |
| Gap | 1.8 s minimum, gradually reducing to 1.25 s | Existing rules |
| Opening hazards | First two ground props, no attacks before 20 s and four obstacles | Existing rules and weekly catalog |
| Record | Separate local best and bounded practice records | Existing versioned local scores and authoritative server replay |
| Prize | Never | Existing financial approval gates |

Preserve jump physics, collision geometry, original/weekly rules versions, seeds, server replay fixtures, existing scores and source-side reward policy. Do not reinterpret old local scores as verified online scores. The practice profile is not an API-supported rules version. Explicit practice bypasses identity, pending replay retry and run start; finish checks the practice profile even if a local mode field is modified. Server continues to recompute all official scores using server-owned rules. A valid official replay remains valid regardless of where inputs were learned; this is not bot-proofing.

First-run UX: default practice, two-action tutorial remains optional, explicit ranked transition only while ready; failure/offline returns to clearly labelled nonfinancial practice. Restart begins in practice. No changes to sprites, PWA assets or database schema. Existing static export CI produces the frontend; no hand-edit of compiled output.

CI: deterministic novice courses across seeds/widths, difficulty bounds, first encounter timing, storage isolation, no API calls, negative PHP rules-version test, desktop/mobile browser regression and existing official parity fixtures. Physical-device playtesting and real customer win/return rate remain future acceptance; skill guidance applied: platformer and game-feel.

Next phase after acceptance: coupon economics and weekly campaign budget.
