<?php

namespace Tests\Feature;

use App\Models\Character;
use Database\Seeders\BuiltinCharacterSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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
        ] as [$slug, $name]) {
            $response->assertJsonFragment([
                'slug' => $slug,
                'name' => $name,
                'is_builtin' => true,
            ]);
        }

        // Updated asset pack versions
        $packVersions = ['darya' => 14, 'setayesh' => 14, 'uzudi' => 14, 'negar' => 14, 'tiam' => 14];

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
}
