<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Throwable;

class CharacterAssetService
{
    public function store(
        string $slug,
        UploadedFile $spriteSheet,
        UploadedFile $atlas
    ): array {
        $directory = $this->customDirectory($slug);
        $disk = Storage::disk('public');

        try {
            $spritePath = $disk->putFileAs($directory, $spriteSheet, 'spritesheet.png');
            $atlasPath = $disk->putFileAs($directory, $atlas, 'atlas.json');

            if ($spritePath === false || $atlasPath === false) {
                throw new \RuntimeException('Character assets could not be stored.');
            }
        } catch (Throwable $exception) {
            $disk->deleteDirectory($directory);
            throw $exception;
        }

        return [
            'sprite_sheet_path' => $spritePath,
            'atlas_path' => $atlasPath,
        ];
    }

    public function replace(
        Character $character,
        ?UploadedFile $spriteSheet = null,
        ?UploadedFile $atlas = null
    ): array {
        if ($spriteSheet === null && $atlas === null) {
            return [];
        }

        $directory = $this->customDirectory((string) $character->slug);
        $disk = Storage::disk('public');
        $updates = [];

        if ($spriteSheet !== null) {
            $path = $disk->putFileAs($directory, $spriteSheet, 'spritesheet.png');

            if ($path === false) {
                throw new \RuntimeException('Sprite sheet could not be replaced.');
            }

            $updates['sprite_sheet_path'] = $path;
        }

        if ($atlas !== null) {
            $path = $disk->putFileAs($directory, $atlas, 'atlas.json');

            if ($path === false) {
                throw new \RuntimeException('Atlas could not be replaced.');
            }

            $updates['atlas_path'] = $path;
        }

        $this->clearCharacterCache((int) $character->getKey());

        return $updates;
    }

    public function getOptimizedManifest(
        int $characterId,
        string $deviceType = 'desktop'
    ): array {
        $deviceType = in_array($deviceType, ['desktop', 'mobile', 'compact'], true)
            ? $deviceType
            : 'mobile';

        return Cache::remember(
            "char_manifest_{$characterId}_{$deviceType}",
            3600,
            function () use ($characterId, $deviceType): array {
                $character = Character::findOrFail($characterId);
                $slug = strtolower((string) ($character->slug ?: $character->name));

                if (!$character->is_builtin) {
                    return [
                        'id' => $character->id,
                        'name' => $slug,
                        'slug' => $character->slug,
                        'atlas' => Storage::disk('public')->url($character->atlas_path),
                        'image' => Storage::disk('public')->url($character->sprite_sheet_path),
                    ];
                }

                $packVersion = $this->packVersion($character);

                return [
                    'id' => $character->id,
                    'name' => $slug,
                    'slug' => $character->slug,
                    'pack_version' => $packVersion,
                    'atlas' => asset(
                        "assets/characters/{$slug}/{$slug}-atlas-v{$packVersion}-{$deviceType}.json"
                    ),
                    'image' => asset(
                        "assets/characters/{$slug}/{$slug}-spritesheet-v{$packVersion}-{$deviceType}.png"
                    ),
                ];
            }
        );
    }

    public function delete(Character $character): void
    {
        $disk = Storage::disk('public');
        $directories = collect([
            $character->sprite_sheet_path,
            $character->atlas_path,
        ])
            ->filter(fn ($path) => is_string($path) && $path !== '')
            ->map(fn (string $path) => trim(dirname($path), '/'))
            ->filter(fn (string $path) => str_starts_with($path, 'characters/'))
            ->unique();

        if ($directories->isEmpty()) {
            $directories = collect([$this->customDirectory((string) $character->slug)]);
        }

        foreach ($directories as $directory) {
            $disk->deleteDirectory($directory);
        }

        $this->clearCharacterCache((int) $character->getKey());
    }

    protected function packVersion(Character $character): int
    {
        $slug = strtolower((string) $character->slug);

        // These bundled characters are pinned to the canonical-reference v9
        // art pack so stale asset_pack_version values cannot keep an older
        // sprite sheet active after this patch is copied into an existing DB.
        $bundledVersion = match ($slug) {
            'amirreza',
            'arsal',
            'darya',
            'hossein',
            'iman',
            'mojtaba',
            'parsa',
            'setayesh',
            'sorkhi',
            'taher-db',
            'uzudi' => 9,
            default => null,
        };

        if ($bundledVersion !== null) {
            return $bundledVersion;
        }

        $settings = is_array($character->settings) ? $character->settings : [];
        $configured = (int) ($settings['asset_pack_version'] ?? 0);

        if ($configured > 0) {
            return $configured;
        }

        return match ($slug) {
            'ronak', 'tiam' => 6,
            default => 5,
        };
    }

    protected function customDirectory(string $slug): string
    {
        return 'characters/' . strtolower(trim($slug));
    }

    protected function clearCharacterCache(int $characterId): void
    {
        foreach (['desktop', 'mobile', 'compact'] as $deviceType) {
            Cache::forget("char_manifest_{$characterId}_{$deviceType}");
            Cache::forget("character_manifest_{$characterId}_{$deviceType}");
        }
    }
}
