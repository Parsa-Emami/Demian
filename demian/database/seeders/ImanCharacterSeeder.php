<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class ImanCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(BuiltinCharacterSeeder::class);
    }
}
