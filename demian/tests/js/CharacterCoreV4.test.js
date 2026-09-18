import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    PRODUCTION_STATUS,
    PRODUCTION_CHARACTER_SLUGS,
    LEGACY_CHARACTER_SLUGS,
    ALL_MANIFEST_SLUGS,
    DEFAULT_ACTIVE_SLUG,
    characterManifestEntry,
    characterProductionStatus,
    isProductionReady,
    loadRosterManifest,
} from '../../resources/js/game/characters/manifests/CharacterManifestRegistry.js';
import { AtlasRegistry } from '../../resources/js/game/assets/AtlasRegistry.ts';
import { TextureAtlasLoader } from '../../resources/js/game/assets/TextureAtlasLoader.ts';
import { CharacterSystem } from '../../resources/js/game/characters/CharacterSystem.ts';
import { PhaserGameCore } from '../../resources/js/game/core/PhaserGameCore.ts';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';

const projectRoot = resolve(import.meta.dirname, '../..');

function readJson(relativePath) {
    return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));
}

test('darya is the sole gold-standard production character', () => {
    assert.deepEqual(PRODUCTION_CHARACTER_SLUGS, ['darya']);
    assert.equal(DEFAULT_ACTIVE_SLUG, 'darya');
    assert.equal(isProductionReady('darya'), true);
    assert.equal(characterProductionStatus('darya'), PRODUCTION_STATUS.GOLD_STANDARD);
});

test('every other builtin slug is legacy_pending_reference_rebuild and excluded from production', () => {
    for (const slug of LEGACY_CHARACTER_SLUGS) {
        assert.equal(isProductionReady(slug), false, `${slug} must not be production-ready`);
        assert.equal(characterProductionStatus(slug), PRODUCTION_STATUS.LEGACY_PENDING);
    }
    assert.ok(LEGACY_CHARACTER_SLUGS.includes('tiam'));
    assert.ok(LEGACY_CHARACTER_SLUGS.includes('ronak'));
    assert.equal(LEGACY_CHARACTER_SLUGS.includes('darya'), false);
});

test('the manifest registry roster and the legacy BUILTIN_CHARACTER_SLUGS contract cover the same 13 characters', () => {
    const manifestSlugs = [...ALL_MANIFEST_SLUGS].sort();
    const contractSlugs = [...BUILTIN_CHARACTER_SLUGS].sort();
    assert.deepEqual(manifestSlugs, contractSlugs);
});

test('an unknown slug defaults defensively to legacy_pending_reference_rebuild, not production', () => {
    assert.equal(characterManifestEntry('totally-unknown-slug'), null);
    assert.equal(characterProductionStatus('totally-unknown-slug'), PRODUCTION_STATUS.LEGACY_PENDING);
    assert.equal(isProductionReady('totally-unknown-slug'), false);
});

test('loadRosterManifest() falls back to the embedded snapshot when fetch is unavailable/fails', async () => {
    const manifest = await loadRosterManifest('http://example.test/');
    assert.equal(manifest.productionCharacter ?? manifest.production_character, 'darya');
    assert.ok(Array.isArray(manifest.characters));
    assert.ok(manifest.characters.length >= 13);
});

test('AtlasRegistry stores and retrieves atlases per character+variant independently', () => {
    const registry = new AtlasRegistry();
    assert.equal(registry.hasAtlas('darya', 'mobile'), false);

    registry.registerAtlas('darya', 'mobile', { meta: { key: 'darya-mobile' } });
    registry.registerAtlas('darya', 'desktop', { meta: { key: 'darya-desktop' } });

    assert.equal(registry.hasAtlas('darya', 'mobile'), true);
    assert.equal(registry.getAtlas('darya', 'mobile').meta.key, 'darya-mobile');
    assert.equal(registry.getAtlas('darya', 'desktop').meta.key, 'darya-desktop');
    assert.equal(registry.getAtlas('darya', 'compact'), undefined);
    assert.deepEqual(registry.characterKeys(), ['darya']);
});

test('AtlasRegistry keeps the legacy flat register()/get() API working unchanged', () => {
    const registry = new AtlasRegistry();
    registry.register('flat-key', { hello: 'world' });
    assert.deepEqual(registry.get('flat-key'), { hello: 'world' });
});

test('AtlasRegistry.registerManifest requires a character_key', () => {
    const registry = new AtlasRegistry();
    assert.throws(() => registry.registerManifest({}));
});

function makeMockFetch(routes) {
    return async (url) => {
        const match = routes[url];
        if (!match) {
            return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => match };
    };
}

test('TextureAtlasLoader loads a manifest, then an atlas variant declared inside it', async () => {
    const registry = new AtlasRegistry();
    const manifestUrl = 'http://example.test/assets/characters/darya/manifests/character_manifest_v4.json';
    const atlasUrl = 'http://example.test/assets/characters/darya/darya-atlas-v12-mobile.json';

    const fetchImpl = makeMockFetch({
        [manifestUrl]: {
            character_key: 'darya',
            runtime: {
                atlas_targets: {
                    mobile: { atlas: '../darya-atlas-v12-mobile.json', image: '../darya-spritesheet-v12-mobile.png' },
                },
            },
        },
        [atlasUrl]: { meta: { key: 'darya-atlas-v12-mobile' } },
    });

    const loader = new TextureAtlasLoader(registry, { baseUrl: 'http://example.test/', fetchImpl });

    const manifest = await loader.loadManifest('darya');
    assert.equal(manifest.character_key, 'darya');

    const atlas = await loader.loadAtlasVariant('darya', 'mobile');
    assert.equal(atlas.meta.key, 'darya-atlas-v12-mobile');
    assert.equal(registry.hasAtlas('darya', 'mobile'), true);

    // Second call must be served from the registry cache, not fetched again.
    let fetchCount = 0;
    const countingFetch = async (...args) => {
        fetchCount += 1;
        return fetchImpl(...args);
    };
    const loader2 = new TextureAtlasLoader(registry, { baseUrl: 'http://example.test/', fetchImpl: countingFetch });
    await loader2.loadAtlasVariant('darya', 'mobile');
    assert.equal(fetchCount, 0, 'already-registered atlas must not trigger a new fetch');
});

test('TextureAtlasLoader resolves relative "../" atlas/image paths against the manifest directory, not the site root', async () => {
    const registry = new AtlasRegistry();
    registry.registerManifest({
        character_key: 'darya',
        runtime: {
            atlas_targets: {
                mobile: { atlas: '../darya-atlas-v12-mobile.json', image: '../darya-spritesheet-v12-mobile.png' },
            },
        },
    });
    const loader = new TextureAtlasLoader(registry, {
        baseUrl: 'http://example.test/',
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    assert.equal(
        loader.imageUrlFor('darya', 'mobile'),
        'http://example.test/assets/characters/darya/darya-spritesheet-v12-mobile.png'
    );
});

test('TextureAtlasLoader.loadManifest returns null (never throws) on a 404', async () => {
    const registry = new AtlasRegistry();
    const loader = new TextureAtlasLoader(registry, {
        baseUrl: 'http://example.test/',
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    });
    const result = await loader.loadManifest('nonexistent-character');
    assert.equal(result, null);
});

test('shipped character-manifest-v4.json matches the embedded registry snapshot', () => {
    const doc = readJson('public/assets/characters/character-manifest-v4.json');
    assert.equal(doc.production_character, 'darya');
    const slugs = doc.characters.map((c) => c.slug).sort();
    assert.deepEqual(slugs, [...ALL_MANIFEST_SLUGS].sort());
    const darya = doc.characters.find((c) => c.slug === 'darya');
    assert.equal(darya.production_status, 'gold_standard_production');
    assert.equal(darya.is_default_active, true);
});

test("shipped darya animation manifest's frame counts match the real v12 mobile atlas", () => {
    const animAtlas = readJson('public/assets/characters/darya/darya-atlas-v12-mobile.json');
    const animManifest = readJson('public/assets/characters/darya/manifests/darya_animation_manifest.json');

    for (const [name, animation] of Object.entries(animAtlas.animations)) {
        const declared = animManifest.states[name];
        assert.ok(declared, `animation "${name}" from the shipped atlas is missing from darya_animation_manifest.json`);

        const directional = Boolean(animation.framesByDirection);
        let frameCount;
        if (directional) {
            frameCount = Object.values(animation.framesByDirection)[0]?.length ?? 0;
        } else if (animation.framesRight) {
            frameCount = animation.framesRight.length;
        } else {
            frameCount = animation.frames?.length ?? 0;
        }

        assert.equal(declared.frames, frameCount, `frame count mismatch for "${name}"`);
        assert.equal(declared.fps, animation.fps, `fps mismatch for "${name}"`);
    }
});

test('darya character_manifest_v4.json lists every state present in the animation manifest', () => {
    const characterManifest = readJson('public/assets/characters/darya/manifests/character_manifest_v4.json');
    const animationManifest = readJson('public/assets/characters/darya/manifests/darya_animation_manifest.json');
    const declaredStates = Object.keys(animationManifest.states).sort();
    const listedAnimations = [...characterManifest.animations].sort();
    assert.deepEqual(listedAnimations, declaredStates);
});

test('CharacterSystem.registerFromManifest() builds a spawnable definition from a Character Manifest V4 document', () => {
    const system = new CharacterSystem();
    const manifest = {
        character_key: 'darya',
        runtime: {
            atlas_targets: {
                mobile: { atlas: '../darya-atlas-v12-mobile.json', image: '../darya-spritesheet-v12-mobile.png' },
            },
        },
    };
    const animationManifest = {
        character_key: 'darya',
        states: {
            idle: { frames: 16, fps: 10, loop: true },
            win: { frames: 16, fps: 17, loop: false },
        },
    };

    system.registerFromManifest(manifest, animationManifest, { variant: 'mobile' });

    let spawnedTexture = null;
    const scene = { add: { sprite: (x, y, texture) => { spawnedTexture = texture; return { x, y, texture }; } } };
    const sprite = system.spawn(scene, 'darya', 5, 7);

    assert.equal(spawnedTexture, '../darya-spritesheet-v12-mobile.png');
    assert.equal(sprite.x, 5);
    assert.equal(system.count, 1);
    assert.equal(system.animationRegistry.has('darya:idle'), true);
    assert.equal(system.animationRegistry.get('darya:win').repeat, 0);
    assert.equal(system.animationRegistry.get('darya:idle').repeat, -1);
});

test('CharacterSystem.registerFromManifest() rejects a manifest missing the requested atlas variant', () => {
    const system = new CharacterSystem();
    assert.throws(() => system.registerFromManifest({ character_key: 'darya', runtime: { atlas_targets: {} } }));
});

test('CharacterSystem.register()/spawn() (the original API PhaserGameCore depends on) is unaffected by the new manifest bridge', () => {
    const system = new CharacterSystem();
    system.register({ id: 'legacy-sprite', texture: 'legacy.png', animations: [] });
    const scene = { add: { sprite: (x, y, texture) => ({ x, y, texture }) } };
    const sprite = system.spawn(scene, 'legacy-sprite');
    assert.equal(sprite.texture, 'legacy.png');
    assert.equal(system.count, 1);
    system.despawn(sprite);
    assert.equal(system.count, 0);
});

test('PhaserGameCore composes SceneManager/AssetLoader/AnimationRegistry/CharacterSystem/GameRuntimeManager without error', () => {
    const core = new PhaserGameCore();
    assert.ok(core.characters instanceof CharacterSystem);
    core.registerCharacters([{ id: 'npc', texture: 'npc.png', animations: [] }]);
    assert.equal(core.characters.count, 0); // registering != spawning
    core.shutdown();
});

test('CharacterRepository.listRankedByProductionStatus() annotates and sorts DB records using the manifest registry', async (t) => {
    const { default: CharacterRepository } = await import('../../resources/js/game/data/CharacterRepository.js');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
            data: [
                { id: 1, slug: 'tiam', name: 'TIAM', is_active: false },
                { id: 2, slug: 'darya', name: 'DARYA', is_active: true },
                { id: 3, slug: 'ronak', name: 'RONAK', is_active: false },
            ],
        }),
    });
    t.after(() => { globalThis.fetch = originalFetch; });

    const repo = new CharacterRepository({ baseUrl: 'http://example.test/characters' });
    const ranked = await repo.listRankedByProductionStatus();

    assert.equal(ranked[0].slug, 'darya');
    assert.equal(ranked[0].is_production_ready, true);
    assert.equal(ranked[0].production_status, 'gold_standard_production');
    assert.equal(ranked[1].is_production_ready, false);
    assert.equal(ranked[2].is_production_ready, false);

    assert.deepEqual(CharacterRepository.productionSlugs(), ['darya']);
    assert.ok(CharacterRepository.legacySlugs().includes('tiam'));
});
