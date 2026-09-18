# Legacy Character Archive (Character Core V4)

This folder is the manifest-level home for every **Legacy Character** —
every builtin character except `darya`, who is the Master Pack's
gold-standard, reference-first production character (see
`../darya/manifests/`).

## Policy (from the Master Pack, non-negotiable)

- All legacy characters are excluded from the active/default production
  flow. None of them are seeded as `is_active = true` and none of them
  should be reintroduced as the default character.
- No legacy character may be rebuilt or "refreshed" from its old sprite
  pack. The **only** way a legacy character re-enters production is a full
  rebuild driven by a new user-supplied reference image package, following
  the same pipeline used for Darya.
- Each legacy character gets a `<slug>_future_manifest.json` here, listing
  the files (`reference_manifest.json`, `identity_contract.yaml`,
  `animation_manifest.json`, `motion_profile.json`, `atlas_manifest.json`,
  `qa_report.md`) that must exist before it can be promoted out of
  `pending_reference_rebuild`.

## Characters covered

| Slug | Had shipped art before this pass? | Status |
|---|---|---|
| tiam | yes (`../tiam/`) | pending_reference_rebuild |
| ronak | yes (`../ronak/`) | pending_reference_rebuild |
| amirreza | no | pending_reference_rebuild |
| parsa | no | pending_reference_rebuild |
| iman | no | pending_reference_rebuild |
| uzudi | no | pending_reference_rebuild |
| setayesh | no | pending_reference_rebuild |
| mojtaba | no | pending_reference_rebuild |
| hossein | no | pending_reference_rebuild |
| arsal | no | pending_reference_rebuild |
| sorkhi | no | pending_reference_rebuild |
| taher-db | no | pending_reference_rebuild |

## Why `tiam`'s and `ronak`'s actual PNG/JSON asset files were **not** moved here

The Master Pack's file-action matrix marks
`public/assets/characters/ronak/*` and `public/assets/characters/tiam/*`
as `ARCHIVE`. In spirit that's exactly what happened: both characters are
now flagged `legacy_pending_reference_rebuild` and neither is active by
default. However, this pass **did not physically relocate the ~56 MB of
binary sprite/atlas files** for two concrete reasons:

1. `BuiltinCharacterSeeder`, `CharacterAssetService::packVersion()`, and
   the frontend's `characterAssetRelativePath()` all derive asset URLs from
   the convention `assets/characters/{slug}/{slug}-...`. Relocating the
   files would require special-casing the path resolver for exactly these
   two slugs (everything else still uses the convention), which is exactly
   the kind of change that is unsafe to make blind in an environment where
   the Laravel app and Vite/Phaser runtime cannot actually be booted to
   verify the result.
2. Anyone who manually reactivates `tiam` or `ronak` via the existing
   `POST /characters/{character}/activate` endpoint should still get a
   working character rather than a 404, until a real rebuilt replacement
   exists.

If/when you do the physical archive move, update
`CharacterAssetService::packVersion()` and
`CharacterVisualContract::characterAssetRelativePath()` together with the
seeder's `sprite_sheet_path`/`atlas_path` in the same commit, and keep this
README's table in sync.
