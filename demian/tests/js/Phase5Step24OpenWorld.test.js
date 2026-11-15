import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import manifest from '../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import WorldPartition from '../../resources/js/game/games/open-world/world/WorldPartition.js';
import ChunkLoader from '../../resources/js/game/games/open-world/streaming/ChunkLoader.js';
import ChunkUnloader from '../../resources/js/game/games/open-world/streaming/ChunkUnloader.js';
import ChunkManager from '../../resources/js/game/games/open-world/streaming/ChunkManager.js';
import OpenWorldChunkRenderer from '../../resources/js/game/games/open-world/render/OpenWorldChunkRenderer.js';
import WorldFindCollection, { generateWorldFind } from '../../resources/js/game/games/open-world/world/WorldFindCollection.js';
import { cafeRoomAt } from '../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import OpenWorldSaveStore from '../../resources/js/game/games/open-world/persistence/OpenWorldSaveStore.js';

function memory() {
    const entries = new Map();
    return { getItem: key => entries.get(key) ?? null, setItem: (key, val) => entries.set(key, val), removeItem: key => entries.delete(key) };
}

test('Step 24 procedural items are seed-stable, walkable, collidable with nothing and bounded', () => {
    const generated = manifest.chunks.map(chunk => [chunk, generateWorldFind(chunk, manifest)]);
    assert.ok(generated.filter(([, item]) => item).length >= 8);
    for (const [chunk, item] of generated) {
        assert.deepEqual(generateWorldFind(chunk, manifest), item);
        if (!item) continue;
        assert.equal(item.id, chunk.id + ':find');
        assert.ok(Object.isFrozen(item) && Object.isFrozen(item.position));
        assert.ok(['coffee-bean', 'postcard'].includes(item.kind));
        assert.ok(cafeRoomAt(item.position));
        assert.ok(item.position.x >= manifest.bounds.minX && item.position.x <= manifest.bounds.maxX);
        assert.ok(item.position.z >= manifest.bounds.minZ && item.position.z <= manifest.bounds.maxZ);
        assert.ok(chunk.obstacles.every(({ position, halfExtents }) =>
            Math.abs(item.position.x - position.x) > halfExtents.x + 1.2
            || Math.abs(item.position.z - position.z) > halfExtents.z + 1.2));
    }
    const sample = manifest.chunks.find(chunk => generateWorldFind(chunk, manifest));
    assert.ok(sample);
    const a = generateWorldFind({ ...sample, seed: 1234 }, manifest);
    const b = generateWorldFind({ ...sample, seed: 2345 }, manifest);
    assert.notDeepEqual(a, b);
    assert.equal(generateWorldFind({ ...sample, bounds: { minX: 5, maxX: 5, minZ: 0, maxZ: 0 } }, manifest), null);
});

test('Step 24 finds collect once in active local practice, never during ranked runs or unloaded chunks', () => {
    const chunk = manifest.chunks.find(candidate => generateWorldFind(candidate, manifest));
    const find = generateWorldFind(chunk, manifest);
    const finds = new WorldFindCollection(manifest);
    const loaded = new Map([[chunk.id, { tier: 'active', handle: { find } }]]);
    assert.deepEqual(finds.collect(find.position, loaded, { active: false }), []);
    assert.equal(finds.count(), 0);
    loaded.get(chunk.id).tier = 'dormant';
    assert.deepEqual(finds.collect(find.position, loaded), []);
    loaded.get(chunk.id).tier = 'active';
    assert.deepEqual(finds.collect(find.position, loaded), [find]);
    assert.equal(finds.count(), 1);
    assert.deepEqual(finds.collect(find.position, loaded), []);
    const saved = finds.snapshot();
    const restored = new WorldFindCollection(manifest, [...saved, ...saved, 'evil:find', 1, false]);
    assert.deepEqual(restored.snapshot(), saved);
    restored.restore(null);
    assert.equal(restored.count(), 0);
});

test('Step 24 local collections survive the existing checksummed save format without ranked proof fields', () => {
    const storage = memory();
    const store = new OpenWorldSaveStore({ storage });
    const find = manifest.chunks.map(c => generateWorldFind(c, manifest)).find(Boolean);
    const finds = new WorldFindCollection(manifest);
    finds.collect(find.position, new Map([[find.chunkId, { tier: 'active', handle: { find } }]]));
    store.save({ worldId: manifest.id, worldVersion: manifest.version,
        position: manifest.spawn, finds: finds.snapshot(), discovery: { discoveredChunks: [], unlockedSavePoints: [] } });
    const restored = store.load({ worldId: manifest.id, maxWorldVersion: manifest.version });
    const instance = new WorldFindCollection(manifest, restored.finds);
    assert.equal(instance.has(find.id), true);
    assert.equal('score' in restored, false);
    assert.equal('replay' in restored, false);
    assert.equal('run_id' in restored, false);
    const raw = JSON.parse(storage.getItem('demian.open-world.save.v1'));
    raw.state.finds.push('forged:find');
    storage.setItem('demian.open-world.save.v1', JSON.stringify(raw));
    assert.equal(store.load({ worldId: manifest.id }), null);
});

test('Step 24 multi-hour streaming simulation retains a strict chunk and find memory budget', async () => {
    const factory = new OpenWorldChunkRenderer({ manifest });
    const manager = new ChunkManager({
        manifest, partition: new WorldPartition(manifest),
        loader: new ChunkLoader({ factory }), unloader: new ChunkUnloader(),
        activeRadius: 0, preloadRadius: 1, maxLoadedChunks: 8, concurrency: 2,
    });
    const locations = [
        manifest.spawn, ...manifest.savePoints.map(point => point.position),
        ...manifest.chunks.filter((_, i) => i % 7 === 0).map(chunk => chunk.center),
    ];
    for (let i = 0; i < 300; i++) {
        const position = locations[i % locations.length];
        manager.update(position);
        await manager.whenIdle();
        assert.ok(manager.stats().loaded <= 8);
        assert.ok(factory.handles.size <= 8);
        assert.equal(manager.stats().loading, 0);
        const active = manager.partition.chunkAt(position);
        assert.ok(manager.loaded.has(active.id), 'Current chunk must always be retained');
        assert.equal(manager.loaded.get(active.id).tier, 'active');
        assert.ok([...manager.loaded.values()].every(record =>
            record.handle.find === null || record.handle.find?.chunkId === record.definition.id));
    }
    await manager.dispose();
    assert.equal(factory.handles.size, 0);
    assert.equal(manager.stats().loaded, 0);
    assert.equal(manager.stats().queued, 0);
    factory.dispose();
});

test('Step 24 ranked proofs and world collision remain isolated from exploration state', () => {
    const source = readFileSync(new URL('../../resources/js/game/games/open-world/OpenWorldGame.js', import.meta.url), 'utf8');
    assert.match(source, /!this\.worldChallengeLocked\(\)/);
    assert.match(source, /this\.finds\.collect\(this\.characterManager\.position\(\), this\.chunkManager\.loaded\)/);
    assert.match(source, /finds: this\.finds\.snapshot\(\)/);
    assert.match(source, /this\.finds\.restore\(state\.finds\)/);
    assert.match(source, /await this\.chunkManager\?\.dispose\(\)/);
    assert.match(source, /this\.chunkRenderer\?\.dispose\(\)/);
    assert.doesNotMatch(source, /finishTurnRun\([^\n]*finds/);
});
