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

        foreach (['idle', 'walk', 'run', 'jump', 'attack', 'win'] as $requiredAnimation) {
            if (!array_key_exists($requiredAnimation, $manifest['animations'] ?? [])) {
                $errors[] = "Animation الزامی {$requiredAnimation} تعریف نشده است.";
            }
        }

        foreach (($manifest['animations'] ?? []) as $name => $animation) {
            if (
                !isset($animation['frames']) ||
                !is_array($animation['frames']) ||
                $animation['frames'] === []
            ) {
                $errors[] = "Animation {$name} فریم ندارد.";
                continue;
            }

            foreach ($animation['frames'] as $frameName) {
                if (!array_key_exists($frameName, $manifest['frames'] ?? [])) {
                    $errors[] = "Animation {$name} به Frame ناموجود {$frameName} اشاره می‌کند.";
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
