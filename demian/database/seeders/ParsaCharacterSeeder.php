<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Convenient entry point for installing Parsa while keeping built-in state valid.
 */
class ParsaCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
