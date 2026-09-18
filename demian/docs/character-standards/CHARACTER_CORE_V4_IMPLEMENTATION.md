# Character Core V4 — Implementation Report

Source directive: `Demian_FullGame_Rebuild_MasterPack_V4` (docs, matrices,
manifests, schemas, checklists). This document records exactly what that
Master Pack asked for, what was actually implemented against this
repository, what was deliberately *not* done and why, and how it was
verified.

## 0. What the Master Pack actually is

The uploaded `Demian_FullGame_Rebuild_MasterPack_V4.zip` is a **planning /
specification bundle** — Markdown directives, a file-action CSV matrix,
JSON Schemas, YAML/JSON templates, and checklists. It contains **no code
and no art**. Its non-negotiable directive (`docs/00_MASTER_DIRECTIVE.fa.md`):

- Every current character must be removed/disabled from the main
  production flow, or archived as legacy.
- No character may be rebuilt from old assets alone from this point on.
- Every new character is built strictly from its own reference photo,
  identity traits, and visual contract.
- **Darya is character #1 and the golden production-quality reference**
  for the whole new system.

## 1. Reality check against the actual repository

Before writing any code, the actual Demian repository was inventoried:

- `darya` **already ships real, substantial v12 art**: a 21×12 grid atlas
  (252 frames), 31 animation states, 8-direction locomotion, and a cat
  companion ("Pishi"), with `combatAnimationsRemoved: true`. This is a far
  richer starting point than the Master Pack's own template assumed.
- `tiam` and `ronak` ship real (older, v6) art.
- `amirreza`, `parsa`, `iman`, `uzudi`, `setayesh`, `mojtaba`, `hossein`,
  `arsal`, `sorkhi`, `taher-db` are seeded in the database with gameplay
  settings but **have no art on disk at all** — `BuiltinCharacterSeeder`
  points `sprite_sheet_path`/`atlas_path` at files that don't exist.
- `tiam` was the seeded `is_active = true` (default) character.

**No new reference photo was supplied in this session**, so this pass could
not perform an actual reference-driven art rebuild for any character. What
it *could* do — and did — is implement the full Character Core V4
architecture the Master Pack specifies, and wire it around Darya's real,
existing v12 art as the interim source of truth, while formally demoting
every other builtin character to `legacy_pending_reference_rebuild` without
deleting anything that currently works.

## 2. What was implemented

### 2.1 Database / seeders
- `database/seeders/BuiltinCharacterSeeder.php`: `darya` is now the only
  character seeded `is_active = true`; every character's `settings` gets a
  `production_status` key (`gold_standard_production` for darya,
  `legacy_pending_reference_rebuild` for the other 12).
- `DaryaCharacterSeeder.php` and all seven legacy seeders
  (AmirReza/Iman/Parsa/Ronak/Setayesh/Uzudi/Tiam) got explicit `@deprecated`
  / production-entry-point docblocks. Behaviour is unchanged (they still
  delegate to `BuiltinCharacterSeeder`) — nothing was deleted, per the
  Master Pack's `ARCHIVE`, not `DELETE`, instruction.

### 2.2 Manifests (new)
- `public/assets/characters/character-manifest-v4.json` — the single
  roster document (schema: `schemas/character_manifest.schema.json`
  family) listing all 13 builtin characters with `production_status`.
- `public/assets/characters/darya/manifests/`:
  `character_manifest_v4.json`, `darya_reference_manifest.json`,
  `darya_animation_manifest.json`, `darya_motion_profile.json`,
  `darya_ability_profile.json`, `darya_identity_contract.yaml`,
  `darya_qa_status.json`. The animation manifest's frame/fps/loop values
  were **extracted programmatically from the real shipped
  `darya-atlas-v12-mobile.json`**, not invented — and a test
  (`tests/js/CharacterCoreV4.test.js`) cross-checks them against the atlas
  on every run so they cannot silently drift.
- `public/assets/characters/_legacy_archive/`: a `<slug>_future_manifest.json`
  for each of the 12 non-Darya characters, plus a `README.md` explaining
  the archive policy — including the explicit decision **not** to
  physically relocate `tiam`'s/`ronak`'s existing binary asset files (see
  that README for the full reasoning: doing so blind, in an environment
  where the Vite/Phaser runtime cannot be booted to verify the result,
  was judged unsafe).
- `schemas/` — copied from the Master Pack so `$schema` references in the
  new manifests resolve inside this repository.

### 2.3 Backend (PHP)
- `app/Services/Characters/CharacterIdentityService.php` (new) — the PHP
  counterpart of the frontend registry; reads
  `character-manifest-v4.json` via `public_path()` (matching how builtin
  assets are actually served in this codebase — **not**
  `Storage::disk('public')`, which resolves to `storage/app/public` and
  would silently fail to find these files. This mismatch was caught and
  fixed during implementation; see §4).
- `app/Services/Characters/CharacterManifestValidator.php` (new) —
  validates manifest *documents* against the Master Pack's JSON Schemas,
  separate from atlas frame-level validation.
- `app/Services/Characters/AtlasManifest.php` — **fixed a real,
  pre-existing bug**: it required an `attack` animation that Darya's
  shipped atlas (and the app's actual live validator,
  `StoreCharacterRequest.php`) does not have. This class has zero
  consumers anywhere in the app, so the fix is risk-free. See §4.
- `app/Services/Characters/CharacterAssetService.php` — constructor-injects
  `CharacterIdentityService`; `getOptimizedManifest()` now includes
  `production_status`/`is_production_ready`; the response cache key was
  versioned (`char_manifest_v4_...`) so this change can't serve stale
  pre-V4 cache entries after deploy.

### 2.4 Frontend (JS/TS)
- `resources/js/game/characters/manifests/CharacterManifestRegistry.js`
  (new) — single source of truth for `PRODUCTION_CHARACTER_SLUGS`
  (`['darya']`), `LEGACY_CHARACTER_SLUGS` (the other 12),
  `DEFAULT_ACTIVE_SLUG` (`'darya'`), with an embedded snapshot for
  synchronous call sites and an async `loadRosterManifest()` for callers
  that want the live JSON.
- `CharacterVisualContract.js` — re-exports the registry's helpers.
  `BUILTIN_CHARACTER_SLUGS` itself (and its order) was **deliberately left
  untouched**: `tests/js/CharacterVisualContract.test.js` locks its exact
  value down, and four other modules (`SpriteCharacter.js`,
  `FrameAnimator.js`, `ArcadeCharacterRoster.js`, `CharacterManager.js`,
  `CharacterVisualService.js`, `PixelActorRenderer.js`) depend on it.
- `CharacterVisualService.js` — default `activeSlug` changed from
  `'tiam'` to `DEFAULT_ACTIVE_SLUG` (`'darya'`).
- `CharacterManager.js` — the offline/local fallback roster
  (`BUILTIN_DEFINITIONS`) had **its own separate copy** of `is_active`
  flags (used when the live Character API is unreachable at boot); this
  was found and flipped to match (`darya: true`, everyone else `false`),
  plus `production_status` was added to every entry's `settings`.
- `resources/js/game/assets/AtlasRegistry.ts` and `TextureAtlasLoader.ts`
  — fully implemented (character+variant-keyed atlas storage, manifest
  fetch/cache with graceful fallback). These were previously an empty
  "Phase 3 architecture placeholder" with **zero consumers anywhere in the
  codebase**, confirmed by repo-wide grep, so this was a safe, from-scratch
  build rather than a risky rewrite of live code.
- `resources/js/game/characters/CharacterSystem.ts` — additive
  `registerFromManifest()` bridges a Character Manifest V4 document into
  this class's existing `CharacterDefinition`/`register()` API without
  touching the method signatures `PhaserGameCore.ts` depends on.
- `resources/js/game/characters/CharacterMotionProfile.js` — additive,
  opt-in `motionScale` parameter on `characterPresentationPose()`.
  Default (`null`) behaviour is byte-identical to before — verified by the
  existing `CharacterMotionProfile.test.js`, which uses exact
  `assert.deepEqual` and was not modified.
- `resources/js/game/characters/FrameAnimator.js` — clamped incoming
  `deltaTime` to 250ms to prevent an animation catch-up burst after a
  stalled tab/long GC pause. Normal frame deltas (~16-33ms) are unaffected;
  verified by the existing `CharacterFrameBlend.test.js`.
- `resources/js/game/data/CharacterRepository.js` — additive
  `listRankedByProductionStatus()` and static `productionSlugs()`/
  `legacySlugs()` helpers; the existing `list()`/`create()`/`activate()`/
  `remove()` API is unchanged.

## 3. What was intentionally NOT done, and why

1. **No new character art was generated.** No reference photo was
   supplied in this session, and this environment has no image-generation
   tool. Darya's existing v12 art is used as an *interim* source of truth
   (documented explicitly in `darya_reference_manifest.json`). The 12
   legacy characters remain exactly as they were on disk.
2. **`SpriteCharacter.js` was reviewed but not restructured.** At 950+
   lines of carefully hand-tuned gameplay/animation code with no way to
   boot the actual Three.js/Vite runtime in this environment to visually
   verify a change, a "rewrite" (as the Master Pack's file-action matrix
   suggests) was judged too risky for the reward. Its two dependencies
   (`CharacterMotionProfile.js`, `FrameAnimator.js`) were upgraded
   additively instead — see §2.4.
3. **`tiam`'s and `ronak`'s binary asset files were not physically moved**
   into `_legacy_archive/`. See
   `public/assets/characters/_legacy_archive/README.md` for the full
   reasoning (path-convention coupling in three different files; no way to
   verify a 56MB relocation end-to-end here).
4. **No human/pixel-level visual QA.** `darya_qa_status.json` is explicit
   about this: everything reported here is data/wiring correctness,
   checked programmatically (see §5), not a visual review of the actual
   rendered game.

## 4. Bugs found and fixed along the way

These weren't asked for explicitly, but came directly out of following the
Master Pack's instruction to make character status "manifest-driven and
traceable":

- **`AtlasManifest::validate()` required a non-existent `attack`
  animation.** Darya's real, shipped atlas has no combat animations
  (`combatAnimationsRemoved: true`), and the codebase's own *live* upload
  validator (`StoreCharacterRequest.php`) already correctly excludes
  `attack` with an explanatory comment. `AtlasManifest.php` had drifted out
  of sync (it has zero consumers, so nothing ever caught this). Fixed to
  match the real contract; verified against the real Darya atlas (§5).
- **`Storage::disk('public')` vs `public_path()` mismatch.** An early draft
  of `CharacterIdentityService` read manifest files via
  `Storage::disk('public')`, whose root is `storage/app/public`. Builtin
  character assets in this codebase are actually served straight from the
  `public/` webroot via the `asset()` helper. Caught before this document
  was written and corrected to use `public_path()`.
- **`CharacterManager.js`'s offline fallback roster had a separate,
  un-synced `is_active`/default-character copy** from
  `BuiltinCharacterSeeder.php`. If the Character API were unreachable at
  boot, the game would have silently defaulted back to `tiam` even after
  the seeder was fixed to default to `darya`. Found by tracing
  `ensureBuiltinCharacters()` → `characters.find(is_active)` and fixed.

## 5. Verification performed

No composer/npm registry beyond a temporary local `esbuild` install was
reachable in this environment (`packagist.org` is not on the sandbox's
allowed-domains list), so a full Laravel boot / real browser run was not
possible. What *was* actually run:

- **The project's existing JS test suite** (`node tools/run_js_tests.mjs`,
  native `node:test`, PHP-CLI 8.3 installed separately for `php -l`):
  started at 217 passing tests, ended at **236 passing, 0 failing**, after
  every change in this pass (18 new tests added in
  `tests/js/CharacterCoreV4.test.js` covering the manifest registry, the
  new `AtlasRegistry`/`TextureAtlasLoader`, `CharacterSystem.registerFromManifest()`,
  `PhaserGameCore` composition, and `CharacterRepository`'s new methods —
  plus cross-checks of the shipped manifest JSON against the real atlas).
- **Every touched/created PHP file** passed `php -l` (PHP 8.3.6).
- **`CharacterIdentityService`, `CharacterManifestValidator`, and the fixed
  `AtlasManifest`** were each exercised with standalone PHP scripts (a
  minimal stub of `Illuminate\Validation\ValidationException` and
  `public_path()`) against the real shipped manifest/atlas files in this
  repo — not mocked data — and all checks passed, including validating
  every one of the 13 builtin characters' manifests.
- **Every new/modified `.ts` file** was type-stripped/compiled with
  `esbuild` to confirm it's syntactically valid TypeScript.

## 6. What a human team should still do

1. Supply a real reference-photo package for Darya if the goal is to move
   from "interim source of truth" (existing v12 art) to the Master Pack's
   strict `reference_fidelity` policy, and/or for any of the 12 legacy
   characters if/when they're promoted out of
   `legacy_pending_reference_rebuild`.
2. Run this against a real Laravel + Vite/Phaser environment
   (`composer install`, `npm install`, `php artisan migrate --seed`,
   `npm run dev`) and do an actual visual/gameplay QA pass — this
   environment could not boot the app to verify rendering.
3. Decide whether to physically relocate `tiam`'s/`ronak`'s asset files
   into `_legacy_archive/` (see that folder's `README.md` for exactly what
   three call sites would need to change together if so).
