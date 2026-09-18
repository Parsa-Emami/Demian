// Character Core V4 — manifest-driven texture atlas loader.
//
// Fetches a character's `character_manifest_v4.json` (see
// public/assets/characters/darya/manifests/character_manifest_v4.json for
// the shipping example) and, on request, the atlas JSON for a given export
// variant (desktop/mobile/compact), registering both into an AtlasRegistry.
//
// This was previously an empty "Phase 3 architecture module placeholder"
// with zero consumers anywhere in the codebase (verified: no import of
// TextureAtlasLoader exists outside this file), so implementing it fully
// carries no risk of regressing existing behaviour.

import { AtlasRegistry, type CharacterManifestV4 } from './AtlasRegistry.ts';

export interface TextureAtlasLoaderOptions {
    /** Base URL every manifest/atlas path is resolved against. Defaults to '/'. */
    baseUrl?: string;
    /** Injectable fetch implementation, primarily for tests. Defaults to the global fetch. */
    fetchImpl?: typeof fetch;
}

function manifestPathFor(characterKey: string): string {
    return `assets/characters/${characterKey}/manifests/character_manifest_v4.json`;
}

export class TextureAtlasLoader {
    private registry: AtlasRegistry;
    private baseUrl: string;
    private fetchImpl: typeof fetch;

    constructor(registry: AtlasRegistry, options: TextureAtlasLoaderOptions = {}) {
        this.registry = registry;
        this.baseUrl = options.baseUrl ?? (globalThis.document?.baseURI ?? '/');
        const injected = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
        if (!injected) {
            throw new Error('TextureAtlasLoader: no fetch implementation available; pass { fetchImpl } explicitly.');
        }
        this.fetchImpl = injected;
    }

    private resolve(path: string): string {
        return new URL(path, this.baseUrl).toString();
    }

    /**
     * Loads and registers a character's top-level Character Manifest V4
     * document. Returns null (never throws) on any failure so callers can
     * treat "manifest not ready yet" as a normal, recoverable state.
     */
    async loadManifest(characterKey: string, manifestPath?: string): Promise<CharacterManifestV4 | null> {
        const cached = this.registry.getManifest(characterKey);
        if (cached) return cached;

        const path = manifestPath ?? manifestPathFor(characterKey);
        try {
            const response = await this.fetchImpl(this.resolve(path));
            if (!response.ok) {
                throw new Error(`manifest request failed with status ${response.status}`);
            }
            const json = (await response.json()) as CharacterManifestV4;
            if (json.character_key !== characterKey) {
                throw new Error(
                    `manifest character_key mismatch: expected "${characterKey}", got "${json.character_key}"`
                );
            }
            this.registry.registerManifest(json);
            return json;
        } catch (error) {
            console.warn(`[TextureAtlasLoader] Failed to load manifest for "${characterKey}":`, error);
            return null;
        }
    }

    /**
     * Loads and registers the atlas JSON for one export variant
     * (desktop/mobile/compact) of a character, fetching the character
     * manifest first if it is not already registered. Returns null (never
     * throws) on any failure.
     */
    async loadAtlasVariant(characterKey: string, variant: string): Promise<unknown | null> {
        if (this.registry.hasAtlas(characterKey, variant)) {
            return this.registry.getAtlas(characterKey, variant);
        }

        const manifest = this.registry.getManifest(characterKey) ?? (await this.loadManifest(characterKey));
        const target = manifest?.runtime?.atlas_targets?.[variant];
        if (!target) {
            console.warn(`[TextureAtlasLoader] No atlas target "${variant}" declared for "${characterKey}".`);
            return null;
        }

        const manifestDirUrl = this.resolve(`assets/characters/${characterKey}/manifests/`);
        try {
            const response = await this.fetchImpl(new URL(target.atlas, manifestDirUrl).toString());
            if (!response.ok) {
                throw new Error(`atlas request failed with status ${response.status}`);
            }
            const atlasJson = await response.json();
            this.registry.registerAtlas(characterKey, variant, atlasJson);
            return atlasJson;
        } catch (error) {
            console.warn(`[TextureAtlasLoader] Failed to load "${variant}" atlas for "${characterKey}":`, error);
            return null;
        }
    }

    /** Resolves the (unfetched) image URL for a variant, given an already-registered manifest. */
    imageUrlFor(characterKey: string, variant: string): string | null {
        const manifest = this.registry.getManifest(characterKey);
        const target = manifest?.runtime?.atlas_targets?.[variant];
        if (!target) return null;
        const manifestDirUrl = this.resolve(`assets/characters/${characterKey}/manifests/`);
        return new URL(target.image, manifestDirUrl).toString();
    }
}
