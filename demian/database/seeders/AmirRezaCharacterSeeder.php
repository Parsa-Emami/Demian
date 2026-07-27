<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Convenient entry point for installing AmirReza while keeping built-in state valid.
 */
class AmirRezaCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
