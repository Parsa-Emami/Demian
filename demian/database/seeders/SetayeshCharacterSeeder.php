<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Convenient entry point for installing Setayesh while keeping built-in state valid.
 */
class SetayeshCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
