# Demian — Roadmap 90+ / Phase 1

Target: GitHub-only API release readiness before any hosting deployment. This roadmap is distinct from historical Phase 1 game implementation.

## Acceptance and evidence

- Existing full SQLite/MySQL backend suite, backup/restore drill and 50-client HTTP acceptance stay mandatory. PHP CI now matches cPanel PHP 8.4.
- Phase 1 API release readiness builds locked production dependencies, packages only the API runtime, rejects private files, cached config and special archive entries, extracts the artifact into a disposable runner directory, runs the real host preflight, creates isolated persistent storage, optimizes Laravel, runs migrations twice and runs integrity/coupon audits and scheduler inspection.
- Loopback HTTP validates exact commit health, game catalog, rules, leaderboard, public policy, denied unauthenticated reads, disabled cashier, blocked private paths and allowlisted/rejected CORS. No public hosting credentials or live database are used.
- SHA-256 and commit-bound JSON evidence accompany the artifact; the manual cPanel deploy workflow reuses that exact acceptance job and checks its checksum before accessing the host. Existing explicit host approval and backup gates remain.
- Run Actions -> Phase 1 API release readiness (GitHub only). A green run is laboratory release acceptance, not certification of Apache/PHP-FPM, real TLS/DNS, physical devices, cron, production capacity or real customer purchases. Production gates remain pending until separately authorized host UAT.

## Roadmap (ordered, no implicit authorization to enable prizes)

1. API deployment readiness and operational verification (P0; CI evidence required).
2. Dino Run beginner difficulty / separate ranked rules (P0).
3. Coupon economics and approved campaign budget (P0).
4. Dynamic winner allocation (P0).
5. Multi-account prevention and identity verification (P0).
6. Anti-cheat activation readiness (P0).
7. Character visual standard V2 (P1).
8. Sprite provenance and animation unification (P1).
9. Skill leagues (P1).
10. Personal improvement awards (P1).
11. XP and loyalty club (P1).
12. Daily/weekly missions (P1).
13. Gated Café Drift prizes (P1).
14. Other game financial verification (P1).
15. Referral system (P2).
16. Cafe events (P2).
17. Table QR codes (P1).
18. Off-peak discounts (P1).
19. Business intelligence (P0).
20. Controlled business pilot and continuous optimization (P0).

Next after CI acceptance: Phase 2, introduce approachable practice difficulty without weakening verified competition, versioned replay rules, or leaderboard integrity.
