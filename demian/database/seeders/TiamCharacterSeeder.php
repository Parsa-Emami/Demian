<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * @deprecated Character Core V4 — LEGACY, ARCHIVED (see
 * docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md and
 * public/assets/characters/tiam/manifests/tiam_future_manifest.json).
 *
 * Backward-compatible alias used by existing install and GitHub Pages
 * workflows. It still seeds every built-in Demian character (via
 * BuiltinCharacterSeeder), but TIAM itself is a Legacy Character
 * (production_status = legacy_pending_reference_rebuild) and is no longer
 * the default active character — Darya is. Keep this class for install
 * script compatibility; do not reactivate TIAM from this seeder.
 */
class TiamCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
