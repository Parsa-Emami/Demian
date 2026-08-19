<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Convenient entry point for installing Uzudi while keeping built-in state valid.
 */
class UzudiCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
