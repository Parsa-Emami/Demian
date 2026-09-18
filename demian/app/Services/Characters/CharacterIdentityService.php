<?php

namespace App\Services\Characters;

/**
 * Character Core V4 — manifest-driven character identity service.
 *
 * Single source of truth: public/assets/characters/character-manifest-v4.json
 * (mirrored on the frontend by
 * resources/js/game/characters/manifests/CharacterManifestRegistry.js).
 *
 * Per the Demian Full Game Rebuild Master Pack's non-negotiable directive,
 * every builtin character has a production_status of either:
 *   - gold_standard_production (currently just "darya"), or
 *   - legacy_pending_reference_rebuild (every other builtin character).
 *
 * Builtin character assets (see CharacterAssetService::packVersion() and
 * BuiltinCharacterSeeder) live directly under the public/ webroot and are
 * served via the asset() helper — NOT through Storage::disk('public'),
 * whose root is storage/app/public. This service reads the roster/manifest
 * files the same way, via public_path(), to match that existing convention.
 *
 * This service intentionally never throws on a missing/corrupt manifest —
 * character selection and rendering must keep working even if the manifest
 * file is temporarily absent, so every read falls back to treating the
 * character as legacy/pending, which is the conservative, safe default.
 */
class CharacterIdentityService
{
    public const STATUS_GOLD_STANDARD = 'gold_standard_production';
    public const STATUS_LEGACY_PENDING = 'legacy_pending_reference_rebuild';

    private const ROSTER_RELATIVE_PATH = 'assets/characters/character-manifest-v4.json';

    /** @var array<string, mixed>|null Process-level memoization so repeated calls don't re-read/decode the file. */
    private static ?array $cachedRoster = null;

    /**
     * Loads and decodes character-manifest-v4.json from public/. Returns an
     * empty roster shape (never null, never throws) on any failure so
     * callers can treat "manifest missing" as just "everything is
     * legacy_pending_reference_rebuild" rather than a hard error.
     *
     * @return array{manifest_version: string, production_character: string|null, characters: array<int, array<string, mixed>>}
     */
    public function roster(): array
    {
        if (self::$cachedRoster !== null) {
            return self::$cachedRoster;
        }

        $fallback = [
            'manifest_version' => 'v4',
            'production_character' => null,
            'characters' => [],
        ];

        $path = public_path(self::ROSTER_RELATIVE_PATH);

        try {
            if (!is_file($path)) {
                return self::$cachedRoster = $fallback;
            }

            $contents = file_get_contents($path);

            if ($contents === false) {
                return self::$cachedRoster = $fallback;
            }

            $decoded = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);

            if (!is_array($decoded) || !isset($decoded['characters']) || !is_array($decoded['characters'])) {
                return self::$cachedRoster = $fallback;
            }

            return self::$cachedRoster = $decoded;
        } catch (\Throwable) {
            return self::$cachedRoster = $fallback;
        }
    }

    /** Clears the in-process roster cache; call after modifying character-manifest-v4.json (e.g. in tests). */
    public static function flushCache(): void
    {
        self::$cachedRoster = null;
    }

    /** @return array<string, mixed>|null */
    public function characterEntry(string $slug): ?array
    {
        $slug = strtolower(trim($slug));

        foreach ($this->roster()['characters'] ?? [] as $entry) {
            if (is_array($entry) && strtolower((string) ($entry['slug'] ?? '')) === $slug) {
                return $entry;
            }
        }

        return null;
    }

    public function productionStatus(string $slug): string
    {
        return (string) ($this->characterEntry($slug)['production_status'] ?? self::STATUS_LEGACY_PENDING);
    }

    public function isProductionReady(string $slug): bool
    {
        return $this->productionStatus($slug) === self::STATUS_GOLD_STANDARD;
    }

    /** The slug the manifest marks as the default active character (falls back to "darya"). */
    public function defaultActiveSlug(): string
    {
        foreach ($this->roster()['characters'] ?? [] as $entry) {
            if (is_array($entry) && ($entry['is_default_active'] ?? false) === true) {
                return (string) $entry['slug'];
            }
        }

        return (string) ($this->roster()['production_character'] ?? 'darya');
    }

    /**
     * Path (relative to the character's manifests/ folder location declared
     * in character-manifest-v4.json) to that character's own manifest file
     * — either its production character_manifest_v4.json, or its legacy
     * _future_manifest.json under _legacy_archive/.
     */
    public function manifestRelativePath(string $slug): ?string
    {
        $entry = $this->characterEntry($slug);

        if ($entry === null || !isset($entry['manifest'])) {
            return null;
        }

        return 'assets/characters/' . ltrim((string) $entry['manifest'], '/');
    }

    /**
     * Loads and decodes a character's own manifest JSON file. Returns null
     * (never throws) if the manifest is missing, unreadable, or invalid.
     *
     * @return array<string, mixed>|null
     */
    public function loadCharacterManifest(string $slug): ?array
    {
        $relativePath = $this->manifestRelativePath($slug);

        if ($relativePath === null) {
            return null;
        }

        $path = public_path($relativePath);

        try {
            if (!is_file($path)) {
                return null;
            }

            $contents = file_get_contents($path);

            if ($contents === false) {
                return null;
            }

            $decoded = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
