<?php

namespace App\Services\Characters;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use JsonException;

class AtlasManifest
{
    public function parseUploadedFile(UploadedFile $file): array
    {
        try {
            $manifest = json_decode(
                file_get_contents($file->getRealPath()),
                true,
                512,
                JSON_THROW_ON_ERROR
            );
        } catch (JsonException) {
            throw ValidationException::withMessages([
                'atlas' => 'فایل Atlas یک JSON معتبر نیست.',
            ]);
        }

        $this->validate($manifest);

        return $manifest;
    }

    public function validate(array $manifest): void
    {
        $errors = [];

        if (!isset($manifest['meta']['size']['w'], $manifest['meta']['size']['h'])) {
            $errors[] = 'meta.size.w و meta.size.h الزامی هستند.';
        }

        if (!isset($manifest['frames']) || !is_array($manifest['frames']) || $manifest['frames'] === []) {
            $errors[] = 'حداقل یک Frame باید در frames تعریف شود.';
        }

        if (!isset($manifest['animations']) || !is_array($manifest['animations']) || $manifest['animations'] === []) {
            $errors[] = 'حداقل یک Animation باید در animations تعریف شود.';
        }

        foreach (($manifest['frames'] ?? []) as $name => $frame) {
            foreach (['x', 'y', 'w', 'h'] as $key) {
                if (!isset($frame[$key]) || !is_numeric($frame[$key])) {
                    $errors[] = "Frame {$name} مقدار معتبر {$key} ندارد.";
                }
            }
        }

        // Character Core V4 fix: this list previously required 'attack',
        // but the shipped production character (Darya, v12 atlas) ships
        // with combatAnimationsRemoved = true and has no attack animation
        // at all — nor does StoreCharacterRequest.php (the validator that
        // actually runs on character upload) require one; see its comment
        // "Combat animations such as \"attack\" are intentionally not
        // required." This class had zero consumers anywhere in the app, so
        // it had silently drifted out of sync with that real contract.
        // Aligning the two removes a validator that would otherwise reject
        // the game's own gold-standard production character.
        foreach (['idle', 'walk', 'run', 'jump', 'win'] as $requiredAnimation) {
            if (!array_key_exists($requiredAnimation, $manifest['animations'] ?? [])) {
                $errors[] = "Animation الزامی {$requiredAnimation} تعریف نشده است.";
            }
        }

        foreach (($manifest['animations'] ?? []) as $name => $animation) {
            $collections = [];

            foreach (['frames', 'framesRight', 'framesLeft'] as $collectionName) {
                if (isset($animation[$collectionName])) {
                    if (!is_array($animation[$collectionName])) {
                        $errors[] = "Animation {$name} مقدار معتبر {$collectionName} ندارد.";
                    } elseif ($animation[$collectionName] !== []) {
                        $collections[$collectionName] = $animation[$collectionName];
                    }
                }
            }

            if (isset($animation['framesByDirection'])) {
                if (!is_array($animation['framesByDirection'])) {
                    $errors[] = "Animation {$name} مقدار معتبر framesByDirection ندارد.";
                } else {
                    foreach ($animation['framesByDirection'] as $direction => $directionFrames) {
                        if (!is_array($directionFrames) || $directionFrames === []) {
                            $errors[] = "Animation {$name} برای جهت {$direction} فریم معتبر ندارد.";
                            continue;
                        }

                        $collections['framesByDirection.'.$direction] = $directionFrames;
                    }
                }
            }

            if ($collections === []) {
                $errors[] = "Animation {$name} فریم ندارد.";
                continue;
            }

            foreach ($collections as $collectionName => $frameNames) {
                foreach ($frameNames as $frameName) {
                    if (!is_string($frameName) || !array_key_exists($frameName, $manifest['frames'] ?? [])) {
                        $errors[] = "Animation {$name} در {$collectionName} به Frame ناموجود {$frameName} اشاره می‌کند.";
                    }
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages([
                'atlas' => $errors,
            ]);
        }
    }
}
