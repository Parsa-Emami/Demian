<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * @deprecated Character Core V4 — LEGACY, ARCHIVED (see
 * docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md and
 * public/assets/characters/setayesh/manifests/setayesh_future_manifest.json).
 *
 * Setayesh is a Legacy Character: production_status =
 * legacy_pending_reference_rebuild. This seeder is kept only for
 * backward compatibility with existing install scripts/CI jobs that
 * still call it by name; it intentionally does not activate Setayesh and
 * must not be reintroduced as the active/default character. Setayesh
 * re-enters production only after a new reference image package is
 * supplied and rebuilt per the reference-first pipeline.
 */
class SetayeshCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
