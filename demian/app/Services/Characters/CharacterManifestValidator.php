<?php

namespace App\Services\Characters;

use Illuminate\Validation\ValidationException;

/**
 * Character Core V4 — validates the higher-level manifest documents
 * (character_manifest_v4.json and *_animation_manifest.json) against the
 * Master Pack's JSON Schemas:
 *   - schemas/character_manifest.schema.json
 *   - schemas/animation_manifest.schema.json
 *
 * This is deliberately separate from AtlasManifest, which validates the
 * pixel-level atlas (frames/animations/coordinates) that ships per export
 * variant. CharacterManifestValidator validates the manifest *documents*
 * that describe a character's identity, source of truth, and runtime
 * wiring — the Character Runtime Contract V4 fields (identityManifest,
 * assetManifest, animationManifest, motionProfile, abilityProfile,
 * runtimeHooks, qaStatus).
 */
class CharacterManifestValidator
{
    /**
     * Validates a character_manifest_v4.json-shaped array. Required keys
     * per schemas/character_manifest.schema.json: character_key,
     * source_of_truth, identity_contract, animations, runtime.
     *
     * @param array<string, mixed> $manifest
     * @throws ValidationException
     */
    public function validateCharacterManifest(array $manifest): void
    {
        $errors = [];

        if (!isset($manifest['character_key']) || !is_string($manifest['character_key']) || $manifest['character_key'] === '') {
            $errors[] = 'character_key الزامی است و باید رشته‌ای غیرخالی باشد.';
        }

        if (!isset($manifest['source_of_truth']) || !is_array($manifest['source_of_truth'])) {
            $errors[] = 'source_of_truth الزامی است و باید یک object باشد.';
        }

        if (!isset($manifest['identity_contract'])) {
            $errors[] = 'identity_contract الزامی است.';
        }

        if (!isset($manifest['animations']) || !is_array($manifest['animations']) || !array_is_list($manifest['animations'])) {
            $errors[] = 'animations الزامی است و باید یک آرایه باشد.';
        }

        if (!isset($manifest['runtime']) || !is_array($manifest['runtime'])) {
            $errors[] = 'runtime الزامی است و باید یک object باشد.';
        } else {
            foreach (['identity_manifest', 'asset_manifest', 'animation_manifest'] as $requiredRuntimeKey) {
                if (!isset($manifest['runtime'][$requiredRuntimeKey])) {
                    $errors[] = "runtime.{$requiredRuntimeKey} الزامی است (Character Runtime Contract V4).";
                }
            }
        }

        $productionStatus = $manifest['production_status'] ?? null;
        if ($productionStatus !== null && !in_array($productionStatus, [
            CharacterIdentityService::STATUS_GOLD_STANDARD,
            CharacterIdentityService::STATUS_LEGACY_PENDING,
        ], true)) {
            $errors[] = "production_status نامعتبر است: {$productionStatus}";
        }

        if ($errors !== []) {
            throw ValidationException::withMessages(['character_manifest' => $errors]);
        }
    }

    /**
     * Validates an animation-manifest-shaped array (e.g.
     * darya_animation_manifest.json). Required keys per
     * schemas/animation_manifest.schema.json: character_key, states.
     *
     * Each state, if present, is checked for the frame/fps/loop shape this
     * codebase actually relies on (see
     * tests/js/CharacterCoreV4.test.js, which cross-checks these values
     * against the real shipped atlas).
     *
     * @param array<string, mixed> $manifest
     * @throws ValidationException
     */
    public function validateAnimationManifest(array $manifest): void
    {
        $errors = [];

        if (!isset($manifest['character_key']) || !is_string($manifest['character_key']) || $manifest['character_key'] === '') {
            $errors[] = 'character_key الزامی است و باید رشته‌ای غیرخالی باشد.';
        }

        if (!isset($manifest['states']) || !is_array($manifest['states']) || $manifest['states'] === []) {
            $errors[] = 'states الزامی است و باید حداقل یک انیمیشن داشته باشد.';
        } else {
            foreach ($manifest['states'] as $name => $state) {
                if (!is_array($state)) {
                    $errors[] = "states.{$name} باید یک object باشد.";
                    continue;
                }

                if (!isset($state['frames']) || !is_int($state['frames']) || $state['frames'] < 1) {
                    $errors[] = "states.{$name}.frames باید عدد صحیح مثبت باشد.";
                }

                if (!isset($state['fps']) || !is_numeric($state['fps']) || $state['fps'] <= 0) {
                    $errors[] = "states.{$name}.fps باید عدد مثبت باشد.";
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages(['animation_manifest' => $errors]);
        }
    }

    /**
     * Convenience: validates a character's full manifest pair as loaded by
     * CharacterIdentityService (its own character_manifest_v4.json plus the
     * animation_manifest.json it points to), returning a pass/fail summary
     * instead of throwing — used by QA/CLI tooling that wants to check
     * every character in one pass rather than stopping at the first error.
     *
     * @return array{slug: string, valid: bool, errors: array<int, string>}
     */
    public function checkCharacter(CharacterIdentityService $identity, string $slug): array
    {
        $errors = [];
        $manifest = $identity->loadCharacterManifest($slug);

        if ($manifest === null) {
            return ['slug' => $slug, 'valid' => false, 'errors' => ['manifest not found']];
        }

        // Legacy future_manifest.json documents intentionally do not
        // conform to the production character_manifest.schema.json (they
        // have no identity_contract/animations yet — that is the whole
        // point of "pending_reference_rebuild"). Only gold-standard
        // production characters are held to the full schema.
        if (($manifest['production_status'] ?? $manifest['status'] ?? null) !== CharacterIdentityService::STATUS_GOLD_STANDARD) {
            return ['slug' => $slug, 'valid' => true, 'errors' => []];
        }

        try {
            $this->validateCharacterManifest($manifest);
        } catch (ValidationException $exception) {
            array_push($errors, ...($exception->errors()['character_manifest'] ?? [$exception->getMessage()]));
        }

        return ['slug' => $slug, 'valid' => $errors === [], 'errors' => $errors];
    }
}
