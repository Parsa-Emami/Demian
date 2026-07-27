<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Convenient entry point for installing Ronak while keeping built-in state valid.
 */
class RonakCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
