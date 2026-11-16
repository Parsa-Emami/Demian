# Demian — Phase 6 / Step 32 — Privacy, Legal and Competition Rules

**Implementation:** source + automated CI controls. **Legal status:** DRAFT, NOT APPROVED. **Production/cPanel acceptance:** NOT CLAIMED.

**Public PWA:** \`https://demiancafe.ir/\` · **API:** \`https://api.demiancafe.ir/api/v1/arcade\` · **policy version:** \`2026-11-16-v1\`.

## 1. Data mapping and accountable handling

| Data | Where | Purpose | Audience / lifecycle |
|---|---|---|---|
| Random player UUID, display name | \`arcade_players\` | Account and public leaderboard name | Public name/score, private UUID where needed. Account erasure removes direct records. |
| SHA-256 bearer and recovery-code hashes | \`arcade_players\` | Player authentication | Never returned except one-time plaintext **at creation/rotation**. 30-day player token, 20-minute recovery link and 180-day backup capability per backend config. |
| Policy version + acceptance timestamp | \`arcade_players\` | Accountable acknowledgement | NULL for legacy accounts; no historic fabrication. New record on affirmative acceptance. |
| Seeded runs, verification, replay inputs | \`arcade_runs\`, \`arcade_replays\`, turn-run tables | Fair score verification / abuse detection | Raw replay pruning default 30 days; verified leaderboard and sealed contest records persist subject to retention and valid erasure. |
| Weekly rankings, sealed winners | Weekly results and finalization tables | Contest audit and finality | Some sealed financial or dispute-related records are anonymised upon erasure and may be retained for accounting/legal reasons. |
| Coupon ciphertext, code digest, redemption | \`arcade_coupons\` and ledger | Physical café discount lifecycle | No code in data export. A private, authenticated wallet is the sole player-facing code view; redemption is cashier-only. |
| Risk counters and case evidence | Anti-cheat observation/report tables | Review suspected abuse | Observations: 30 days, **closed** reports: 365 days, unresolved cases: human-review retention. No raw IP, token or user-agent in observation rows per current design. |
| Settings, practice scores, pending offline proof | Local browser storage / PWA Cache Storage | Play without internet and safe retry | Browser/device controlled. User deletion clears known app keys; browser data clearing also removes local copies and may prevent recovery. |
| Hosting logs and backups | Hosting provider / offsite backups | Security/incident response, resilience | Operator must finalize collection, processors, jurisdiction, backup rotation and RPO/RTO. Not erased synchronously when deleting a live account. |

The product does **not require** phone/email to create a player identity. In-café cashier/staff account data has a separate RBAC/security boundary and is not part of the player export.

## 2. Published draft UI

The static release at \`_site\` includes self-contained RTL Persian pages:

- \`/privacy/\` — information collection, purpose, security, local storage, access/export, retention/deletion and unresolved controller/contact information.
- \`/terms/\` — browser/app rules, account safety, no cheating, practice versus verified rankings, limitations and links to privacy.
- \`/competition-rules/\` — Saturday-to-Saturday Tehran weekly clock, verified scores, provisional weekly leaderboard, independently approved vouchers, anti-cheat/appeal requirements and no prize promise.

All pages have explicit **draft** status and \`noindex,nofollow\` until the café operator, governing jurisdiction, contact point, age eligibility and coupon conditions have been reviewed and approved. A build with \`DEMIAN_LEGAL_PUBLICATION_APPROVED=true\` fails if the reviewed policy source is not marked approved. Do not assert that creating drafts discharges legal obligations.

## 3. Registration, consent and revisions

- A **new online** player sees an accessible, uncapped native modal with three document links, two **unchecked** affirmative acknowledgements and a **practice-only cancel** option. Never treat page visitation, a prechecked checkbox, or a dismissed modal as consent.
- Backend \`POST /api/v1/arcade/players\` validates exact \`policy_version\`, \`accept_terms\` and \`privacy_acknowledged\`, stores version+time only if all are valid. \`DEMIAN_LEGAL_REQUIRE_ACCEPTANCE=true\` makes all three mandatory. Do not enable this with the current unapproved public policy.
- Legacy accounts keep NULL policy fields; no automatic or silent backfill.
- On **revised** rules, existing players can \`POST /player/legal\` with authenticated explicit acknowledgement. With acceptance enforcement enabled, \`POST /runs\` and \`POST /turn-runs\` require the current version. Already-started runs can still submit completion evidence; access/export/deletion remain available regardless of policy status.
- Never overwrite consent history ambiguously: current implementation stores **latest** accepted policy version and timestamp. If a jurisdiction requires immutable acceptance logs for every version, add a dedicated append-only register before legal sign-off.

## 4. User rights & export

- \`GET /api/v1/arcade/legal\`: public policy metadata.
- \`GET /api/v1/arcade/player/data\`: bearer-authenticated private summary, account registration time, accepted-version metadata and aggregate record counts.
- \`GET /api/v1/arcade/player/data/records?type=<allowlist>&limit=1..50&cursor=<token>\`: bearer-authenticated, owner-scoped, cursor-paginated safe record fields for runs, best scores, weekly results, weekly wins, coupon **status** and anti-cheat observation event type. Restrict limits, types and output fields on the server.
- The leaderboard settings panel exposes an explicit one-click **JSON summary** download. Detailed records are available through the authenticated API; no bulk dump of secret material.
- \`PATCH /player\` updates the display name. \`DELETE /player\` erases the account and direct linked data, revoking unconsumed codes in the existing transaction; immutable/sealed or financial records may be depersonalised, and backups/logs must follow reviewed erasure schedules.
- Private endpoints send \`Cache-Control: no-store, private\` (normalised Laravel ordering may be \`no-store, private\`). Never store bearer, coupons or complete private export in PWA Cache Storage or log them.
- This is **NOT** an exhaustive data-subject access export. For complete DSAR including security case evidence, staff decisions, operational logs, archival records and lawful retention exceptions, the operator needs a verified human process.

## 5. Prize rules and fail-closed production

The 6-game architecture is single-player; only server-replay-verified competitive runs qualify for rankings. Weekly live previews are **not** final and issue no financial entitlement. Published prize amounts, rank distribution, expiry, age/eligibility, geographic restrictions, merchant identity, tax, complaint/appeal process and voucher redemption terms require written operator review. Discount codes stay in the in-app wallet and **are not emailed**; only authorised café cashier can redeem.

On a production backend, \`CouponPolicy::approved()\` now blocks financial issuance unless BOTH the reviewed policy flag and backend consent-enforcement flag are true; \`CafeProductionReadiness\` checks both before live activation. Existing financial feature flags remain OFF by default.

### Independent sign-off checklist (owner/counsel required)

- [ ] Legal operator/merchant full name, business/legal address, customer service/privacy contact, contact channel, and escalation for children/guardians.
- [ ] Determine applicable jurisdiction and compliance obligations (Iranian Electronic Commerce Law / consumer-protection and privacy provisions as applicable, platform age requirements and local promo/lottery/prize laws). **Seek specialist legal advice where prize mechanics could be regulated.**
- [ ] Establish minimum age, parental-consent flow or age gate as warranted; do not invent age or silently collect birth dates.
- [ ] Document data retention per table, backup TTL, offsite subprocessors, hosting region, incident response, and legally necessary exceptions.
- [ ] Approve competition eligibility, one-prize-per-player policy, scoring/ties, anti-cheat appeal, exact discount tiers, expiration, eligible purchases and branch/location restrictions.
- [ ] Review assets/fonts/character/visual-art licenses and attribution, including upstream source assets, before public release.
- [ ] Approve effective date/version and communications/reacceptance for any material amendment.
- [ ] Audit site and API over **real** HTTPS hosts, including mobile usability, CORS, logs and backups; test deletion/export and prize denial on staging.

### Sign-off release procedure

1. Via a reviewed, traceable PR, update \`resources/legal/policy.json\` with \`status: "approved"\`, verified \`operator_name\`, valid \`privacy_contact_email\` and finalized document wording; add version history and approval evidence. Current release **MUST remain draft**.
2. Rebuild the static release and update all frontend assets through GitHub Actions. Verify \`/privacy/\`, \`/terms/\`, \`/competition-rules/\` respond 200 with correct TLS on \`demiancafe.ir\`. Do not switch DNS on assumption.
3. After backend migration and staging acceptance, set \`DEMIAN_LEGAL_PUBLICATION_APPROVED=true\` and \`DEMIAN_LEGAL_REQUIRE_ACCEPTANCE=true\` in the **protected server** \`.env\` (never Git); clear Laravel cached config. Confirm \`/legal\` approved & enforcement true and check old/new-player consent.
4. Approve and test financial voucher feature flags **independently**, with database backup, UAT, anti-cheat, physical café redemption, load test, monitoring and rollback plan. Never turn on financial flags merely because legal pages exist.

## 6. Test gates

Backend: \`vendor/bin/phpunit --filter Phase6Step32PrivacyLegalTest\` (SQLite and MySQL CI); \`npm run test:ci\`; full PHP backend suite, static export, offline/PWA, 6-game browser tests and source checks in PR CI. New policy/version tests ensure registration without consent fails when enabled, existing users have NULL consent, private requests are authenticated and owner scoped, pagination excludes secrets and new ranked starts are withheld until explicitly acknowledged.

**No cPanel access, real mobile UAT, legal sign-off or production prize activation is implied by passing source-level CI.**
