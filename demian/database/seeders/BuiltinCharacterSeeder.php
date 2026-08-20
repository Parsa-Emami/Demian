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

            $characters = [
                [
                    'slug' => 'tiam',
                    'name' => 'TIAM / تیام',
                    'pack_version' => 5,
                    'is_active' => true,
                    'settings' => [
                        'walk_speed' => 3.2,
                        'run_speed' => 6.2,
                        'sprint_speed' => 6.85,
                        'jump_force' => 6.5,
                        'scale' => 1,
                    ],
                ],
                [
                    'slug' => 'ronak',
                    'name' => 'RONAK / روناک',
                    'pack_version' => 5,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.25,
                        'run_speed' => 6.35,
                        'sprint_speed' => 7.0,
                        'jump_force' => 6.6,
                        'scale' => 1,
                    ],
                ],
                [
                    'slug' => 'amirreza',
                    'name' => 'AMIRREZA / امیررضا',
                    'pack_version' => 5,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 4.15,
                        'run_speed' => 8.4,
                        'sprint_speed' => 9.35,
                        'jump_force' => 6.85,
                        'scale' => 1,
                    ],
                ],
                [
                    'slug' => 'parsa',
                    'name' => 'PARSA / پارسا',
                    'pack_version' => 5,
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
                ],
                [
                    'slug' => 'darya',
                    'name' => 'DARYA / دریا',
                    // Darya V6 was the pack visible in the broken deployment.
                    // Use the stable V5 pack already committed with Darya.
                    'pack_version' => 5,
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
                ],
                [
                    'slug' => 'iman',
                    'name' => 'IMAN / ایمان',
                    // Keep Iman on the stable V5 pack for production rendering.
                    'pack_version' => 5,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.75,
                        'run_speed' => 7.15,
                        'sprint_speed' => 7.9,
                        'jump_force' => 6.95,
                        'air_control' => 0.60,
                        'scale' => 1,
                        'role_title' => 'ANCHOR / CORE',
                        'tagline' => 'Reliable, strong, and team-first',
                        'signature_action' => 'guard',
                    ],
                ],
                [
                    'slug' => 'uzudi',
                    'name' => 'UZUDI / اوزودی',
                    'pack_version' => 6,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.75,
                        'run_speed' => 7.1,
                        'sprint_speed' => 7.85,
                        'jump_force' => 7.15,
                        'air_control' => 0.66,
                        'scale' => 1,
                        'role_title' => 'DARK ANGEL',
                        'tagline' => 'Black feathered wings · Night fighter',
                        'speed_rating' => 'A',
                        'power_rating' => 'A+',
                        'signature_action' => 'dark_angel',
                    ],
                ],
                [
                    'slug' => 'setayesh',
                    'name' => 'SETAYESH / ستایش',
                    'pack_version' => 5,
                    'is_active' => false,
                    'settings' => [
                        'walk_speed' => 3.4,
                        'run_speed' => 6.6,
                        'sprint_speed' => 7.25,
                        'jump_force' => 6.7,
                        'air_control' => 0.55,
                        'scale' => 1,
                        'role_title' => 'CURL SPARK',
                        'tagline' => 'Style · Speed · Spark',
                        'speed_rating' => 'A-',
                        'power_rating' => 'B+',
                    ],
                ],
            ];

            foreach ($characters as $definition) {
                $slug = $definition['slug'];
                $packVersion = $definition['pack_version'];
                $settings = $definition['settings'];
                $settings['asset_pack_version'] = $packVersion;

                Character::query()->updateOrCreate(
                    ['slug' => $slug],
                    [
                        'name' => $definition['name'],
                        'sprite_sheet_path' => "assets/characters/{$slug}/{$slug}-spritesheet-v{$packVersion}-mobile.png",
                        'atlas_path' => "assets/characters/{$slug}/{$slug}-atlas-v{$packVersion}-mobile.json",
                        'is_builtin' => true,
                        'is_active' => $definition['is_active'],
                        'settings' => $settings,
                    ]
                );
            }
        });
    }
}
