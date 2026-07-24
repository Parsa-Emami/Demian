<?php

namespace Database\Seeders;

use App\Models\Character;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TiamCharacterSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            Character::query()->update(['is_active' => false]);

            Character::query()->updateOrCreate(
                ['slug' => 'tiam'],
                [
                    'name' => 'TIAM / تیام',
                    'sprite_sheet_path' => 'assets/characters/tiam/tiam-spritesheet.png',
                    'atlas_path' => 'assets/characters/tiam/tiam-atlas.json',
                    'is_builtin' => true,
                    'is_active' => true,
                    'settings' => [
                        'walk_speed' => 3.2,
                        'run_speed' => 6.2,
                        'jump_force' => 6.5,
                        'scale' => 1,
                    ],
                ]
            );
        });
    }
}
