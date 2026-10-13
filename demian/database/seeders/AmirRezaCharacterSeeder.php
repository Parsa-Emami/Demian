<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/** Compatibility entry point for the reference-built, wing-assisted V14 roster. */
class AmirRezaCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
