<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Backward-compatible alias used by existing install and GitHub Pages workflows.
 * It now seeds every built-in Demian character, including TIAM and RONAK.
 */
class TiamCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
