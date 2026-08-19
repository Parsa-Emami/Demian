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
                    'sprite_sheet_path' => 'assets/characters/tiam/tiam-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/tiam/tiam-atlas-v6-mobile.json',
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
                    'sprite_sheet_path' => 'assets/characters/ronak/ronak-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/ronak/ronak-atlas-v6-mobile.json',
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
                    'sprite_sheet_path' => 'assets/characters/amirreza/amirreza-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/amirreza/amirreza-atlas-v6-mobile.json',
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
                ['slug' => 'darya'],
                [
                    'name' => 'DARYA / دریا',
                    'sprite_sheet_path' => 'assets/characters/darya/darya-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/darya/darya-atlas-v6-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.55,
                        'run_speed' => 6.9,
                        'sprint_speed' => 7.6,
                        'jump_force' => 6.8,
                        'air_control' => 0.58,
                        'scale' => 1,
                        'role_title' => 'CAT COMPANION',
                        'tagline' => 'Darya + Pishi · always together',
                        'signature_action' => 'companion',
                        'companion' => 'pishi',
                        'companion_always_visible' => true,
                    ],
                ]
            );


            Character::query()->updateOrCreate(
                ['slug' => 'iman'],
                [
                    'name' => 'IMAN / ایمان',
                    'sprite_sheet_path' => 'assets/characters/iman/iman-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/iman/iman-atlas-v6-mobile.json',
                    'is_builtin' => true,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.75,
                        'run_speed' => 7.15,
                        'sprint_speed' => 7.9,
                        'jump_force' => 6.95,
                        'air_control' => 0.6,
                        'scale' => 1,
                        'role_title' => 'ANCHOR / CORE',
                        'tagline' => 'Reliable, strong, and team-first',
                        'signature_action' => 'guard',
                    ],
                ]
            );

            Character::query()->updateOrCreate(
                ['slug' => 'parsa'],
                [
                    'name' => 'PARSA / پارسا',
                    'sprite_sheet_path' => 'assets/characters/parsa/parsa-spritesheet-v6-mobile.png',
                    'atlas_path' => 'assets/characters/parsa/parsa-atlas-v6-mobile.json',
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
        });
    }
}
