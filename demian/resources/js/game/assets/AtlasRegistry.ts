// Character Core V4 — manifest-driven atlas registry.
//
// Storage for parsed atlas JSON, keyed by character + export variant
// (desktop/mobile/compact). This class does no network I/O itself — see
// TextureAtlasLoader.ts for fetching — it is purely an in-memory cache with
// a small amount of bookkeeping so a caller can ask "do I already have
// darya's mobile atlas?" before deciding to fetch it.
//
// Backward compatibility: `register(key, data)` / `get(key)` are the
// original Phase 3 placeholder API and are kept unchanged (same signatures,
// same behaviour) since nothing about the new character/variant API removes
// them — a caller can still use a single flat string key if it wants to.

export interface AtlasVariantTarget {
    atlas: string;
    image: string;
}

export interface CharacterManifestRuntime {
    identity_manifest?: string;
    asset_manifest?: string;
    animation_manifest?: string;
    motion_profile?: string;
    ability_profile?: string;
    qa_status?: string;
    atlas_targets?: Record<string, AtlasVariantTarget>;
    pack_version?: number;
}

export interface CharacterManifestV4 {
    character_key: string;
    production_status?: string;
    runtime?: CharacterManifestRuntime;
}

function compositeKey(characterKey: string, variant: string): string {
    return `${characterKey}:${variant}`;
}

export class AtlasRegistry {
    private atlases: Record<string, unknown> = {};
    private manifests: Record<string, CharacterManifestV4> = {};

    /** @deprecated kept for backward compatibility — prefer registerAtlas(). */
    register(key: string, data: unknown): void {
        this.atlases[key] = data;
    }

    /** @deprecated kept for backward compatibility — prefer getAtlas(). */
    get(key: string): unknown {
        return this.atlases[key];
    }

    /** Registers a parsed atlas JSON document for a given character + export variant. */
    registerAtlas(characterKey: string, variant: string, atlasData: unknown): void {
        this.atlases[compositeKey(characterKey, variant)] = atlasData;
    }

    /** Retrieves a previously-registered atlas for a character + export variant, or undefined. */
    getAtlas(characterKey: string, variant: string): unknown {
        return this.atlases[compositeKey(characterKey, variant)];
    }

    /** True if an atlas has already been registered for this character + variant. */
    hasAtlas(characterKey: string, variant: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.atlases, compositeKey(characterKey, variant));
    }

    /** Registers a character's top-level Character Manifest V4 document (character_manifest_v4.json). */
    registerManifest(manifest: CharacterManifestV4): void {
        if (!manifest?.character_key) {
            throw new Error('registerManifest: manifest is missing character_key.');
        }
        this.manifests[manifest.character_key] = manifest;
    }

    /** Retrieves a previously-registered character manifest, or undefined. */
    getManifest(characterKey: string): CharacterManifestV4 | undefined {
        return this.manifests[characterKey];
    }

    /** Every character key with at least one registered atlas. */
    characterKeys(): string[] {
        const keys = new Set<string>();
        for (const key of Object.keys(this.atlases)) {
            const [characterKey] = key.split(':');
            keys.add(characterKey);
        }
        return Array.from(keys);
    }

    /** All registered atlas/manifest keys — mostly useful for debugging/tests. */
    keys(): string[] {
        return Object.keys(this.atlases);
    }

    clear(): void {
        this.atlases = {};
        this.manifests = {};
    }
}
