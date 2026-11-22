# Phase 0 / F0-02 — Open PR triage (2026-11-21)

Baseline: `main@780773d`. The 24 PRs below are **reviewed and classified**, not automatically merged, closed, or certified.
A stacked PR marked `mergeable=false` against `main` must not be force-merged. Rebase and re-test the dependency chain before an individual feature is accepted.

| PR | Scope | Disposition | Rationale / dependency |
| --- | --- | --- | --- |
| #9 | Weekly leaderboard contract (draft) | Defer / reconcile | Early draft touches scoring and leaderboard; check for replacement by current weekly-season implementation before closing. |
| #76 | Startup/deferred chunks | Defer / rebase | 19 files including deployment workflow and Blade; overlaps later loader work and current main. |
| #84 | Loader motion | Defer / compare | Five files; reconcile against current loader and reduced-motion behavior before merging. |
| #87 | API release gate (roadmap 90 phase 1) | Defer / rebase | First feature branch of the earlier 20-phase chain; build/hosting acceptance, not Phase-0 CI repair. |
| #88 | Dino Run practice (phase 2) | Defer / rebase | Gameplay and leaderboard changes require phase 1 and replay/version compatibility. |
| #89 | Coupon economics (phase 3) | Defer / rebase | Financial changes require security review and human authorization. |
| #90 | Dynamic winner allocation (phase 4) | Defer / rebase | Depends on #89; prize policy requires independent acceptance. |
| #91 | OTP/multi-account (phase 5) | Defer / rebase | Depends on prior phases; external SMS credentials and abuse testing are missing. |
| #92 | Replay/fraud policy (phase 6) | Defer / rebase | Depends on #91; preserve fail-closed competition gates. |
| #93 | Character V2 standard (phase 7) | Defer / rebase | Depends on earlier phases; art approval and PNG rebuilding are still open. |
| #94 | Sprite/animation V2 (phase 8 alternate) | Hold / choose | Conflicts conceptually with #95; do not merge both independently. |
| #95 | Sprite/full-frame audit (phase 8 alternate) | Hold / choose | Later alternative to #94; select one canonical phase-8 branch after comparing diffs and art acceptance. |
| #96 | Skill leagues (phase 9) | Defer / rebase | Stacked on #95; financial/gameplay acceptance separate from CI stabilization. |
| #97 | Personal progression (phase 10) | Defer / rebase | Depends on #96. |
| #98 | Loyalty XP (phase 11) | Defer / rebase | Depends on #97. |
| #99 | Verified missions (phase 12) | Defer / rebase | Depends on #98. |
| #100 | Café Drift rewards (phase 13) | Defer / rebase | Depends on #99; risk/physical-device acceptance outstanding. |
| #101 | Multi-game prizes (phase 14) | Defer / rebase | Depends on #100; prize and replay gate. |
| #102 | Referrals (phase 15) | Defer / stacked | Base is #101 branch, not `main`; requires acceptance of upstream chain. |
| #103 | Analytics (phase 16) | Defer / stacked | Base is #102 branch. |
| #104 | Table QR (phase 17) | Defer / stacked | Base is #103 branch. |
| #105 | Quiet-hour offers (phase 18) | Defer / stacked | Base is #104 branch; real commercial policy remains disabled by default. |
| #106 | Commercial analytics (phase 19) | Defer / stacked | Base is #105 branch. |
| #107 | Pilot operations (phase 20) | Defer / stacked | Base is #106 branch; external acceptance required. |

## Merge safety notes
- #87–#101 target `main`, but the chain is cumulative; the current GitHub mergeability snapshot is false for those PRs. This is **not** authorization to close or force merge.
- #102–#107 target their predecessor feature branch, and the snapshot reports them mergeable against those bases. That does **not** mean they are independently mergeable into `main`.
- #93–#101 repeatedly touch `.github/workflows/deploy-demian-pages.yml` and `demian/package.json`; #76 also touches the workflow and UI markup. Prior to integrating any one of these, review semantic overlap with this Phase-0 fix, rebase on the then-current main, and rerun all CI checks.
- #94 and #95 are competing phase-8 implementations; avoid duplicated animation semantics and generated assets.
- #9 remains a draft and must be deduplicated against the implemented weekly leaderboard before any merge.
- None of these 24 feature PRs is required to repair the single failing `Step 20 UX` test on current main. Their classification is a **deferred integration decision**, not a claim of implementation completion.

## Next integration wave
Start from the earliest independent prerequisite (#87) and advance in dependency order only after successful CI and explicit financial/art acceptance when relevant. Never enable ranked/prizes based solely on a successful unit test.
