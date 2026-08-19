<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class CharacterAssetService
{
    public function __construct(
        private readonly AtlasManifest $atlasManifest
    ) {
    }

    /**
     * Validate and persist both assets required by a custom character.
     *
     * @return array{sprite_sheet_path: string, atlas_path: string}
     */
    public function store(
        string $slug,
        UploadedFile $spriteSheet,
        UploadedFile $atlasFile
    ): array {
        // Validate the atlas before writing anything so a rejected upload does
        // not leave an orphaned sprite sheet behind.
        $manifest = $this->atlasManifest->parseUploadedFile($atlasFile);
        $directory = $this->directoryForSlug($slug);

        $spritePath = $this->storeSpriteSheet($directory, $spriteSheet);
        $atlasPath = $directory.'/atlas.json';

        if (!Storage::disk('public')->put($atlasPath, $this->encodeManifest($manifest))) {
            Storage::disk('public')->delete($spritePath);

            throw new RuntimeException('Unable to store the character atlas.');
        }

        return [
            'sprite_sheet_path' => $spritePath,
            'atlas_path' => $atlasPath,
        ];
    }

    /**
     * Replace only the uploaded assets and return the model fields that changed.
     *
     * @return array<string, string>
     */
    public function replace(
        Character $character,
        ?UploadedFile $spriteSheet,
        ?UploadedFile $atlasFile
    ): array {
        // Parse first. If the new atlas is invalid, no existing file is touched.
        $manifest = $atlasFile !== null
            ? $this->atlasManifest->parseUploadedFile($atlasFile)
            : null;

        $updates = [];
        $directory = $this->directoryForSlug($character->slug);

        if ($spriteSheet !== null) {
            $oldPath = $character->sprite_sheet_path;
            $newPath = $this->storeSpriteSheet($directory, $spriteSheet);

            if (!$character->is_builtin && $oldPath !== $newPath) {
                Storage::disk('public')->delete($oldPath);
            }

            $updates['sprite_sheet_path'] = $newPath;
        }

        if ($atlasFile !== null && $manifest !== null) {
            $oldPath = $character->atlas_path;
            $newPath = $directory.'/atlas.json';

            if (!Storage::disk('public')->put($newPath, $this->encodeManifest($manifest))) {
                throw new RuntimeException('Unable to store the character atlas.');
            }

            if (!$character->is_builtin && $oldPath !== $newPath) {
                Storage::disk('public')->delete($oldPath);
            }

            $updates['atlas_path'] = $newPath;
        }

        if ($updates !== []) {
            $this->clearCharacterCache((int) $character->getKey());
        }

        return $updates;
    }

    /**
     * Generate the optimized runtime manifest used by the open-world loader.
     */
    public function getOptimizedManifest(int $characterId, string $deviceType = 'desktop'): array
    {
        return Cache::remember(
            "char_manifest_{$characterId}_{$deviceType}",
            3600,
            function () use ($characterId, $deviceType): array {
                $character = Character::findOrFail($characterId);

                // Uploaded characters have one canonical asset pair. Built-in
                // characters keep their device-specific V6 asset variants.
                if (!$character->is_builtin) {
                    return [
                        'id' => $character->id,
                        'name' => strtolower($character->slug),
                        'slug' => $character->slug,
                        'atlas' => $character->atlasUrl(),
                        'image' => $character->spriteUrl(),
                    ];
                }

                $charFolder = strtolower($character->slug ?? $character->name);

                return [
                    'id' => $character->id,
                    'name' => $charFolder,
                    'slug' => $character->slug,
                    'atlas' => asset("assets/characters/{$charFolder}/{$charFolder}-atlas-v6-{$deviceType}.json"),
                    'image' => asset("assets/characters/{$charFolder}/{$charFolder}-spritesheet-v6-{$deviceType}.png"),
                ];
            }
        );
    }

    /**
     * Delete persisted assets for a custom character.
     */
    public function delete(Character $character): void
    {
        if ($character->is_builtin) {
            return;
        }

        $disk = Storage::disk('public');
        $paths = array_values(array_unique(array_filter([
            $character->sprite_sheet_path,
            $character->atlas_path,
        ])));

        if ($paths !== []) {
            $disk->delete($paths);
        }

        foreach (array_unique(array_map('dirname', $paths)) as $directory) {
            if ($directory !== '.' && $directory !== '') {
                $disk->deleteDirectory($directory);
            }
        }

        $this->clearCharacterCache((int) $character->getKey());
    }

    private function storeSpriteSheet(string $directory, UploadedFile $spriteSheet): string
    {
        $extension = strtolower($spriteSheet->getClientOriginalExtension() ?: 'png');
        $path = $spriteSheet->storeAs(
            $directory,
            'spritesheet.'.$extension,
            'public'
        );

        if (!is_string($path) || $path === '') {
            throw new RuntimeException('Unable to store the character sprite sheet.');
        }

        return $path;
    }

    private function directoryForSlug(string $slug): string
    {
        return 'characters/'.strtolower($slug);
    }

    private function encodeManifest(array $manifest): string
    {
        $encoded = json_encode(
            $manifest,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
        );

        if (!is_string($encoded)) {
            throw new RuntimeException('Unable to encode the character atlas.');
        }

        return $encoded;
    }

    private function clearCharacterCache(int $characterId): void
    {
        Cache::forget("char_manifest_{$characterId}_desktop");
        Cache::forget("char_manifest_{$characterId}_mobile");
        Cache::forget("char_manifest_{$characterId}_compact");
    }
}
