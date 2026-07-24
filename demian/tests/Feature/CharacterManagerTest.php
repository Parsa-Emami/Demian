<?php

namespace Tests\Feature;

use App\Models\Character;
use Database\Seeders\TiamCharacterSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CharacterManagerTest extends TestCase
{
    use RefreshDatabase;

    public function test_studio_page_is_available(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('Character manager');
    }

    public function test_tiam_can_be_seeded_and_listed(): void
    {
        $this->seed(TiamCharacterSeeder::class);

        $this->getJson('/characters')
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'tiam')
            ->assertJsonPath('data.0.is_active', true);
    }

    public function test_character_can_be_uploaded(): void
    {
        Storage::fake('public');

        $atlas = [
            'meta' => ['size' => ['w' => 256, 'h' => 256]],
            'frames' => [
                'idle_0' => ['x' => 0, 'y' => 0, 'w' => 256, 'h' => 256],
            ],
            'animations' => [
                'idle' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => true],
            ],
        ];

        $response = $this->post('/characters', [
            'name' => 'Test Character',
            'slug' => 'test-character',
            'sprite_sheet' => UploadedFile::fake()->image('sheet.png', 256, 256),
            'atlas' => UploadedFile::fake()->createWithContent(
                'atlas.json',
                json_encode($atlas)
            ),
            'settings' => json_encode(['scale' => 1]),
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.slug', 'test-character');

        $this->assertDatabaseHas('characters', [
            'slug' => 'test-character',
        ]);
    }

    public function test_builtin_character_cannot_be_deleted(): void
    {
        $this->seed(TiamCharacterSeeder::class);
        $tiam = Character::query()->where('slug', 'tiam')->firstOrFail();

        $this->deleteJson("/characters/{$tiam->id}")
            ->assertUnprocessable();
    }
}
