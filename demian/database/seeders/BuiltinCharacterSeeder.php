<?php

namespace Database\Seeders;

use App\Models\Character;
use App\Services\Characters\CharacterIdentityService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Installs the shipped roster without changing the database schema. */
class BuiltinCharacterSeeder extends Seeder
{
    public function run(): void
    {
        $entries = (new CharacterIdentityService())->roster()['characters'] ?? [];
        if ($entries === []) {
            throw new \RuntimeException('The shipped character roster is missing.');
        }
        DB::transaction(function () use ($entries): void {
            Character::query()->where('is_builtin', true)->whereIn('slug', ['tiam', 'ronak'])->delete();
            Character::query()->update(['is_active' => false]);
            foreach ($entries as $entry) {
                $slug = $entry['slug'];
                $version = (int) $entry['pack_version'];
                Character::query()->updateOrCreate(['slug' => $slug], [
                    'name' => $entry['display_name'],
                    'sprite_sheet_path' => "assets/characters/{$slug}/{$slug}-spritesheet-v{$version}-mobile.png",
                    'atlas_path' => "assets/characters/{$slug}/{$slug}-atlas-v{$version}-mobile.json",
                    'is_builtin' => true,
                    'is_active' => (bool) ($entry['is_default_active'] ?? false),
                    'settings' => [
                        'walk_speed' => 3.55, 'run_speed' => 6.9, 'sprint_speed' => 7.6,
                        'jump_force' => 6.8, 'air_control' => .58, 'scale' => 1,
                        'asset_pack_version' => $version,
                        'production_status' => $entry['production_status'],
                        'locomotion_style' => $slug === 'uzudi' ? 'wing-assisted' : 'ground-runner',
                        'companion' => $slug === 'darya' ? 'pishi' : null,
                    ],
                ]);
            }
        });
    }
}
