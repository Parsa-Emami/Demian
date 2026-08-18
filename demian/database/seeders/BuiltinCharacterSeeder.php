<?php

namespace Database\Seeders;

use App\Models\Character;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BuiltinCharacterSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            Character::query()->update(['is_active' => false]);

            Character::query()->updateOrCreate(
                ['slug' => 'tiam'],
                [
                    'name' => 'TIAM / تیام',
                    'sprite_sheet_path' => 'assets/characters/tiam/tiam-spritesheet-v5-mobile.png',
                    'atlas_path' => 'assets/characters/tiam/tiam-atlas-v5-mobile.json',
                    'is_builtin' => true,
                    'is_active' => true,
                    'settings' => [
                        'walk_speed' => 3.2,
                        'run_speed' => 6.2,
                        'sprint_speed' => 6.85,
                        'jump_force' => 6.5,
                        'scale' => 1,
                    ],
                ]
            );

            Character::query()->updateOrCreate(
                ['slug' => 'ronak'],
                [
                    'name' => 'RONAK / روناک',
                    'sprite_sheet_path' => 'assets/characters/ronak/ronak-spritesheet-v5-mobile.png',
                    'atlas_path' => 'assets/characters/ronak/ronak-atlas-v5-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.25,
                        'run_speed' => 6.35,
                        'sprint_speed' => 7.0,
                        'jump_force' => 6.6,
                        'scale' => 1,
                    ],
                ]
            );

            Character::query()->updateOrCreate(
                ['slug' => 'amirreza'],
                [
                    'name' => 'AMIRREZA / امیررضا',
                    'sprite_sheet_path' => 'assets/characters/amirreza/amirreza-spritesheet-v5-mobile.png',
                    'atlas_path' => 'assets/characters/amirreza/amirreza-atlas-v5-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 4.15,
                        'run_speed' => 8.4,
                        'sprint_speed' => 9.35,
                        'jump_force' => 6.85,
                        'scale' => 1,
                    ],
                ]
            );

            Character::query()->updateOrCreate(
                ['slug' => 'parsa'],
                [
                    'name' => 'PARSA / پارسا',
                    'sprite_sheet_path' => 'assets/characters/parsa/parsa-spritesheet-v5-mobile.png',
                    'atlas_path' => 'assets/characters/parsa/parsa-atlas-v5-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 4.5,
                        'run_speed' => 9.1,
                        'sprint_speed' => 10.15,
                        'jump_force' => 7.35,
                        'air_control' => 0.68,
                        'scale' => 1,
                        'role_title' => 'FASTEST / STRONGEST',
                        'tagline' => 'Black-shadow runner',
                        'speed_rating' => 'S+',
                        'power_rating' => 'S+',
                    ],
                ]
            );


            Character::query()->updateOrCreate(
                ['slug' => 'mojtaba'],
                [
                    'name' => 'MOJTABA / مجتبی',
                    'sprite_sheet_path' => 'assets/characters/mojtaba/mojtaba-spritesheet-v5-mobile.png',
                    'atlas_path' => 'assets/characters/mojtaba/mojtaba-atlas-v5-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.5,
                        'run_speed' => 6.8,
                        'sprint_speed' => 7.45,
                        'jump_force' => 6.7,
                        'air_control' => 0.57,
                        'scale' => 1,
                    ],
                ]
            );
        });
    }
}
