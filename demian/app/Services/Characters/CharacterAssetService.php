<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CharacterAssetService
{
    public function __construct(
        private readonly AtlasManifest $atlasManifest
    ) {
    }

    public function store(
        string $slug,
        UploadedFile $spriteSheet,
        UploadedFile $atlasFile
    ): array {
        $manifest = $this->atlasManifest->parseUploadedFile($atlasFile);
        $directory = 'characters/'.Str::slug($slug);

        $spriteExtension = strtolower($spriteSheet->getClientOriginalExtension() ?: 'png');
        $spritePath = $spriteSheet->storeAs(
            $directory,
            'spritesheet.'.$spriteExtension,
            'public'
        );

        $atlasPath = $directory.'/atlas.json';

        Storage::disk('public')->put(
            $atlasPath,
            json_encode(
                $manifest,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
            )
        );

        return [
            'sprite_sheet_path' => $spritePath,
            'atlas_path' => $atlasPath,
        ];
    }

    public function replace(
        Character $character,
        ?UploadedFile $spriteSheet,
        ?UploadedFile $atlasFile
    ): array {
        $updates = [];
        $directory = 'characters/'.$character->slug;

        if ($spriteSheet !== null) {
            if (!$character->is_builtin) {
                Storage::disk('public')->delete($character->sprite_sheet_path);
            }

            $extension = strtolower($spriteSheet->getClientOriginalExtension() ?: 'png');

            $updates['sprite_sheet_path'] = $spriteSheet->storeAs(
                $directory,
                'spritesheet.'.$extension,
                'public'
            );
        }

        if ($atlasFile !== null) {
            $manifest = $this->atlasManifest->parseUploadedFile($atlasFile);
            $atlasPath = $directory.'/atlas.json';

            Storage::disk('public')->put(
                $atlasPath,
                json_encode(
                    $manifest,
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
                )
            );

            $updates['atlas_path'] = $atlasPath;
        }

        return $updates;
    }

    public function delete(Character $character): void
    {
        if ($character->is_builtin) {
            return;
        }

        Storage::disk('public')->deleteDirectory('characters/'.$character->slug);
    }
}
