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
        $this->withoutExceptionHandling();
        $this->get('/')
            ->assertOk()
            ->assertSee('Character manager');
    }

    public function test_all_builtin_characters_can_be_seeded_and_listed(): void
    {
        $this->seed(TiamCharacterSeeder::class);

        $response = $this->getJson('/characters')
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'tiam')
            ->assertJsonPath('data.0.is_active', true);

        foreach ([
            ['tiam', 'TIAM / تیام'],
            ['ronak', 'RONAK / روناک'],
            ['amirreza', 'AMIRREZA / امیررضا'],
            ['parsa', 'PARSA / پارسا'],
            ['darya', 'DARYA / دریا'],
            ['iman', 'IMAN / ایمان'],
            ['uzudi', 'UZUDI / اوزودی'],
            ['setayesh', 'SETAYESH / ستایش'],
            ['mojtaba', 'MOJTABA / مجتبی'],
            ['hossein', 'HOSSEIN / حسین'],
            ['arsal', 'ARSAL / ارسل'],
            ['sorkhi', 'SORKHI / سرخی'],
            ['taher-db', 'TAHER DB / طاهر DB'],
        ] as [$slug, $name]) {
            $response->assertJsonFragment([
                'slug' => $slug,
                'name' => $name,
                'is_builtin' => true,
            ]);
        }

        // Updated asset pack versions
        $packVersions = [
            'tiam' => 6,
            'ronak' => 6,
            'amirreza' => 9,
            'parsa' => 9,
            'darya' => 9,
            'iman' => 9,
            'uzudi' => 9,
            'setayesh' => 9,
            'mojtaba' => 9,
            'hossein' => 9,
            'arsal' => 9,
            'sorkhi' => 9,
            'taher-db' => 9,
        ];

        foreach ($packVersions as $slug => $version) {
            $response->assertJsonFragment([
                'slug' => $slug,
                'sprite_url' => asset("assets/characters/{$slug}/{$slug}-spritesheet-v{$version}-mobile.png"),
                'atlas_url' => asset("assets/characters/{$slug}/{$slug}-atlas-v{$version}-mobile.json"),
            ]);
        }
    }
}
