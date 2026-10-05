<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/** Installs the same reference-driven V14 roster as the static release. */
class DaryaCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
