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
        $this->withoutExceptionHandling(); // اضافه کردن این خط
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
            ->assertJsonPath('data.0.is_active', true)
            ->assertJsonFragment([
                'slug' => 'darya',
                'name' => 'DARYA / دریا',
                'is_builtin' => true,
            ])
            ->assertJsonFragment([
                'slug' => 'iman',
                'name' => 'IMAN / ایمان',
                'is_builtin' => true,
            ]);
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
                'walk' => ['frames' => ['idle_0'], 'fps' => 8, 'loop' => true],
                'run' => ['frames' => ['idle_0'], 'fps' => 12, 'loop' => true],
                'jump' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
                'attack' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
                'win' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
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
            'sprite_sheet_path' => 'characters/test-character/spritesheet.png',
            'atlas_path' => 'characters/test-character/atlas.json',
        ]);

        Storage::disk('public')->assertExists('characters/test-character/spritesheet.png');
        Storage::disk('public')->assertExists('characters/test-character/atlas.json');
    }

    public function test_incomplete_atlas_is_rejected_with_validation_errors(): void
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

        $this->post('/characters', [
            'name' => 'Incomplete Character',
            'slug' => 'incomplete-character',
            'sprite_sheet' => UploadedFile::fake()->image('sheet.png', 256, 256),
            'atlas' => UploadedFile::fake()->createWithContent(
                'atlas.json',
                json_encode($atlas)
            ),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['atlas']);

        $this->assertDatabaseMissing('characters', [
            'slug' => 'incomplete-character',
        ]);
    }

    public function test_builtin_character_cannot_be_deleted(): void
    {
        $this->seed(TiamCharacterSeeder::class);
        $tiam = Character::query()->where('slug', 'tiam')->firstOrFail();

        $this->deleteJson("/characters/{$tiam->id}")
            ->assertUnprocessable();
    }


    public function test_custom_character_can_be_updated_without_replacing_assets(): void
    {
        Storage::fake('public');

        $character = $this->createCustomCharacter('update-character');

        $this->patchJson("/characters/{$character->id}", [
            'name' => 'Updated Character',
            'settings' => json_encode(['scale' => 1.25]),
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Character')
            ->assertJsonPath('data.settings.scale', 1.25);

        Storage::disk('public')->assertExists('characters/update-character/spritesheet.png');
        Storage::disk('public')->assertExists('characters/update-character/atlas.json');
    }

    public function test_custom_character_assets_are_deleted_with_character(): void
    {
        Storage::fake('public');

        $character = $this->createCustomCharacter('delete-character');

        $this->deleteJson("/characters/{$character->id}")
            ->assertOk();

        $this->assertDatabaseMissing('characters', [
            'id' => $character->id,
        ]);

        Storage::disk('public')->assertMissing('characters/delete-character/spritesheet.png');
        Storage::disk('public')->assertMissing('characters/delete-character/atlas.json');
    }

    private function createCustomCharacter(string $slug): Character
    {
        $atlas = [
            'meta' => ['size' => ['w' => 256, 'h' => 256]],
            'frames' => [
                'idle_0' => ['x' => 0, 'y' => 0, 'w' => 256, 'h' => 256],
            ],
            'animations' => [
                'idle' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => true],
                'walk' => ['frames' => ['idle_0'], 'fps' => 8, 'loop' => true],
                'run' => ['frames' => ['idle_0'], 'fps' => 12, 'loop' => true],
                'jump' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
                'attack' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
                'win' => ['frames' => ['idle_0'], 'fps' => 1, 'loop' => false],
            ],
        ];

        $this->post('/characters', [
            'name' => ucfirst(str_replace('-', ' ', $slug)),
            'slug' => $slug,
            'sprite_sheet' => UploadedFile::fake()->image('sheet.png', 256, 256),
            'atlas' => UploadedFile::fake()->createWithContent(
                'atlas.json',
                json_encode($atlas)
            ),
        ])->assertCreated();

        return Character::query()->where('slug', $slug)->firstOrFail();
    }
}
