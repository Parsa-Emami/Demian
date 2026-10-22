<?php

namespace Tests\Feature;

use App\Models\Character;
use App\Services\Characters\CharacterAssetService;
use Database\Seeders\AmirRezaCharacterSeeder;
use Database\Seeders\BuiltinCharacterSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CharacterManagerTest extends TestCase
{
    use RefreshDatabase;

    public function test_studio_page_is_available(): void
    {
        $this->withoutExceptionHandling();
        $this->get('/')
            ->assertOk()
            ->assertSee('Character manager');
    }

    public function test_all_builtin_characters_can_be_seeded_and_listed(): void
    {
        $this->seed(BuiltinCharacterSeeder::class);

        $response = $this->getJson('/characters')
            ->assertOk()
            // Character Core V4: darya is the seeded gold-standard
            // production / default-active character (see
            // database/seeders/BuiltinCharacterSeeder.php and
            // docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md).
            // CharacterController::index() orders by is_active desc first,
            // so the active character — Darya — is data.0.
            ->assertJsonPath('data.0.slug', 'darya')
            ->assertJsonPath('data.0.is_active', true);

        foreach ([
            ['darya', 'DARYA / دریا'],
            ['setayesh', 'SETAYESH / ستایش'],
            ['uzudi', 'UZUDI / اوزودی'],
            ['negar', 'NEGAR / نگار'],
            ['tiam', 'TIAM / تیام'],
            ['amirreza', 'AMIRREZA / امیررضا'],
            ['hanna', 'HANNA / حنا'],
            ['ainaz', 'AINAZ / آیناز'],
            ['arsal', 'ARSAL / ارسل'],
        ] as [$slug, $name]) {
            $response->assertJsonFragment([
                'slug' => $slug,
                'name' => $name,
                'is_builtin' => true,
            ]);
        }

        // Updated asset pack versions
        $packVersions = ['darya' => 14, 'setayesh' => 14, 'uzudi' => 14, 'negar' => 14, 'tiam' => 14, 'amirreza' => 14, 'hanna' => 14, 'ainaz' => 14, 'arsal' => 14];

        foreach ($packVersions as $slug => $version) {
            $response->assertJsonFragment([
                'slug' => $slug,
                'sprite_url' => asset("assets/characters/{$slug}/{$slug}-spritesheet-v{$version}-mobile.png"),
                'atlas_url' => asset("assets/characters/{$slug}/{$slug}-atlas-v{$version}-mobile.json"),
            ]);
        }
    }

    public function test_tiam_survives_reseeding_and_can_be_activated_with_homayoun(): void
    {
        $this->seed(BuiltinCharacterSeeder::class);
        $tiam = Character::query()->where('slug', 'tiam')->firstOrFail();
        $id = $tiam->id;

        $this->seed(BuiltinCharacterSeeder::class);
        $this->assertSame($id, Character::query()->where('slug', 'tiam')->firstOrFail()->id);
        $this->assertSame('homayoun', $tiam->fresh()->settings['companion']);

        $this->postJson("/characters/{$id}/activate")
            ->assertOk()
            ->assertJsonPath('data.slug', 'tiam')
            ->assertJsonPath('data.is_active', true);
        $this->getJson('/characters')->assertOk()->assertJsonPath('data.0.slug', 'tiam');
        $this->assertSame(1, Character::query()->where('is_active', true)->count());
    }

    public function test_hanna_is_installed_idempotently_and_can_be_selected_with_all_full_asset_variants(): void
    {
        $this->seed(BuiltinCharacterSeeder::class);
        $hanna = Character::query()->where('slug', 'hanna')->firstOrFail();
        $id = $hanna->id;
        $this->seed(BuiltinCharacterSeeder::class);
        $this->assertSame($id, $hanna->fresh()->id);
        $this->assertSame('ground-runner', $hanna->fresh()->settings['locomotion_style']);
        $this->assertSame(14, $hanna->fresh()->settings['asset_pack_version']);
        $this->assertNull($hanna->fresh()->settings['companion']);

        foreach (['desktop', 'mobile', 'compact'] as $variant) {
            $manifest = app(CharacterAssetService::class)->getOptimizedManifest($id, $variant);
            $this->assertTrue($manifest['is_production_ready']);
            $this->assertStringEndsWith("hanna-atlas-v14-{$variant}.json", $manifest['atlas']);
            $this->assertStringEndsWith("hanna-spritesheet-v14-{$variant}.png", $manifest['image']);
        }
        $this->postJson("/characters/{$id}/activate")
            ->assertOk()->assertJsonPath('data.slug', 'hanna')->assertJsonPath('data.is_active', true);
        $this->getJson('/characters')->assertOk()->assertJsonPath('data.0.slug', 'hanna');
        $this->assertSame(1, Character::query()->where('is_active', true)->count());
    }

    public function test_ainaz_is_installed_idempotently_and_can_be_selected_with_all_full_asset_variants(): void
    {
        $this->seed(BuiltinCharacterSeeder::class);
        $ainaz = Character::query()->where('slug', 'ainaz')->firstOrFail();
        $id = $ainaz->id;
        $this->seed(BuiltinCharacterSeeder::class);
        $this->assertSame($id, $ainaz->fresh()->id);
        $this->assertSame('ground-runner', $ainaz->fresh()->settings['locomotion_style']);
        $this->assertSame(14, $ainaz->fresh()->settings['asset_pack_version']);
        $this->assertNull($ainaz->fresh()->settings['companion']);

        foreach (['desktop', 'mobile', 'compact'] as $variant) {
            $manifest = app(CharacterAssetService::class)->getOptimizedManifest($id, $variant);
            $this->assertTrue($manifest['is_production_ready']);
            $this->assertStringEndsWith("ainaz-atlas-v14-{$variant}.json", $manifest['atlas']);
            $this->assertStringEndsWith("ainaz-spritesheet-v14-{$variant}.png", $manifest['image']);
        }
        $this->postJson("/characters/{$id}/activate")
            ->assertOk()->assertJsonPath('data.slug', 'ainaz')->assertJsonPath('data.is_active', true);
        $this->getJson('/characters')->assertOk()->assertJsonPath('data.0.slug', 'ainaz');
        $this->assertSame(1, Character::query()->where('is_active', true)->count());
    }

    public function test_arsal_is_installed_idempotently_and_can_be_selected_with_all_full_asset_variants(): void
    {
        $legacy = Character::query()->create([
            'name' => 'Legacy Arsal', 'slug' => 'arsal', 'is_builtin' => true, 'is_active' => false,
            'sprite_sheet_path' => 'assets/characters/arsal/arsal-spritesheet-v9-mobile.png',
            'atlas_path' => 'assets/characters/arsal/arsal-atlas-v9-mobile.json',
            'settings' => ['asset_pack_version' => 9],
        ]);
        Cache::put("char_manifest_v14_{$legacy->id}_mobile_pack9", ['pack_version' => 9], 3600);
        $upgraded = app(CharacterAssetService::class)->getOptimizedManifest($legacy->id, 'mobile');
        $this->assertSame(14, $upgraded['pack_version']);
        $this->assertTrue($upgraded['is_production_ready']);
        $this->seed(BuiltinCharacterSeeder::class);
        $arsal = Character::query()->where('slug', 'arsal')->firstOrFail();
        $id = $arsal->id;
        $this->assertSame($legacy->id, $id);
        $this->seed(BuiltinCharacterSeeder::class);
        $this->assertSame($id, $arsal->fresh()->id);
        $this->assertSame('ground-runner', $arsal->fresh()->settings['locomotion_style']);
        $this->assertSame(14, $arsal->fresh()->settings['asset_pack_version']);
        $this->assertNull($arsal->fresh()->settings['companion']);

        foreach (['desktop', 'mobile', 'compact'] as $variant) {
            $manifest = app(CharacterAssetService::class)->getOptimizedManifest($id, $variant);
            $this->assertTrue($manifest['is_production_ready']);
            $this->assertStringEndsWith("arsal-atlas-v14-{$variant}.json", $manifest['atlas']);
            $this->assertStringEndsWith("arsal-spritesheet-v14-{$variant}.png", $manifest['image']);
        }
        $this->postJson("/characters/{$id}/activate")
            ->assertOk()->assertJsonPath('data.slug', 'arsal')->assertJsonPath('data.is_active', true);
        $this->getJson('/characters')->assertOk()->assertJsonPath('data.0.slug', 'arsal');
        $this->assertSame(1, Character::query()->where('is_active', true)->count());
    }

    public function test_legacy_amirreza_upgrades_in_place_and_can_be_selected_with_the_wing_assisted_pack(): void
    {
        $amirreza = Character::query()->create([
            'name' => 'Legacy AmirReza', 'slug' => 'amirreza', 'is_builtin' => true, 'is_active' => false,
            'sprite_sheet_path' => 'assets/characters/amirreza/amirreza-spritesheet-v9-mobile.png',
            'atlas_path' => 'assets/characters/amirreza/amirreza-atlas-v9-mobile.json',
            'settings' => ['asset_pack_version' => 9, 'locomotion_style' => 'ground-runner'],
        ]);
        $id = $amirreza->id;
        Cache::put("char_manifest_v14_{$id}_mobile", ['pack_version' => 9], 3600);
        $manifest = app(CharacterAssetService::class)->getOptimizedManifest($id, 'mobile');
        $this->assertSame(14, $manifest['pack_version']);
        $this->assertTrue($manifest['is_production_ready']);
        $this->assertStringEndsWith('amirreza-atlas-v14-mobile.json', $manifest['atlas']);

        $this->seed(AmirRezaCharacterSeeder::class);
        $this->seed(AmirRezaCharacterSeeder::class);
        $amirreza = Character::query()->where('slug', 'amirreza')->firstOrFail();
        $this->assertSame($id, $amirreza->id);
        $this->assertSame(14, $amirreza->settings['asset_pack_version']);
        $this->assertSame('wing-assisted', $amirreza->settings['locomotion_style']);
        $this->assertSame('wing-assisted', Character::query()->where('slug', 'uzudi')->firstOrFail()->settings['locomotion_style']);
        $this->assertSame('darya', Character::query()->where('is_active', true)->firstOrFail()->slug);

        $this->postJson("/characters/{$id}/activate")
            ->assertOk()->assertJsonPath('data.slug', 'amirreza')->assertJsonPath('data.is_active', true);
        $this->getJson('/characters')->assertOk()->assertJsonPath('data.0.slug', 'amirreza');
        $this->assertSame(1, Character::query()->where('is_active', true)->count());
    }
}
