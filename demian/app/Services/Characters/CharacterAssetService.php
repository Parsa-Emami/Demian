<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

class CharacterAssetService
{
    /**
     * Store uploaded character files.
     */
    public function store(string $slug, mixed $fileOrFiles = null): void
    {
        $charFolder = strtolower($slug);

        if ($fileOrFiles instanceof UploadedFile) {
            $fileOrFiles->storeAs(
                "public/assets/characters/{$charFolder}",
                $fileOrFiles->getClientOriginalName()
            );
        } elseif (is_array($fileOrFiles)) {
            foreach ($fileOrFiles as $file) {
                if ($file instanceof UploadedFile) {
                    $file->storeAs(
                        "public/assets/characters/{$charFolder}",
                        $file->getClientOriginalName()
                    );
                }
            }
        }

        $character = Character::where('slug', $slug)->orWhere('name', $slug)->first();
        if ($character) {
            $this->clearCharacterCache($character->id);
        }
    }

    /**
     * Return the same asset-pack version used by the browser runtime.
     */
    protected function packVersion(Character $character): int
    {
        $settings = is_array($character->settings) ? $character->settings : [];
        $configured = (int) ($settings['asset_pack_version'] ?? 0);

        if ($configured > 0) {
            return $configured;
        }

        return match (strtolower((string) $character->slug)) {
            'uzudi' => 6,
            default => 5,
        };
    }

    /**
     * Build the optimized startup manifest without mixing atlas/sheet versions.
     */
    public function getOptimizedManifest(int $characterId, string $deviceType = 'desktop'): array
    {
        $deviceType = in_array($deviceType, ['desktop', 'mobile', 'compact'], true)
            ? $deviceType
            : 'mobile';

        return Cache::remember(
            "char_manifest_{$characterId}_{$deviceType}",
            3600,
            function () use ($characterId, $deviceType) {
                $character = Character::findOrFail($characterId);
                $charFolder = strtolower($character->slug ?? $character->name);
                $packVersion = $this->packVersion($character);

                return [
                    'id' => $character->id,
                    'name' => $charFolder,
                    'slug' => $character->slug,
                    'pack_version' => $packVersion,
                    'atlas' => asset(
                        "assets/characters/{$charFolder}/{$charFolder}-atlas-v{$packVersion}-{$deviceType}.json"
                    ),
                    'image' => asset(
                        "assets/characters/{$charFolder}/{$charFolder}-spritesheet-v{$packVersion}-{$deviceType}.png"
                    ),
                ];
            }
        );
    }

    public function delete(string $slug): void
    {
        $charFolder = strtolower($slug);
        Storage::deleteDirectory("public/assets/characters/{$charFolder}");

        $character = Character::where('slug', $slug)->orWhere('name', $slug)->first();
        if ($character) {
            $this->clearCharacterCache($character->id);
        }
    }

    protected function clearCharacterCache(int $characterId): void
    {
        Cache::forget("char_manifest_{$characterId}_desktop");
        Cache::forget("char_manifest_{$characterId}_mobile");
        Cache::forget("char_manifest_{$characterId}_compact");
    }
}
