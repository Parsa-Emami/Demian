<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Character Core V4 — production entry point.
 *
 * Darya is the game's reference-first, Character Manifest V4 gold-standard
 * character (see public/assets/characters/darya/manifests/ and
 * docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md). This
 * seeder installs Darya + her cat companion Pishi and, via
 * BuiltinCharacterSeeder, seeds her as the single active builtin
 * character. Every other builtin character is seeded as a Legacy
 * Character (production_status = legacy_pending_reference_rebuild) and
 * is not activated by default.
 */
class DaryaCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
