import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import WorldPartition from '../../../resources/js/game/games/open-world/world/WorldPartition.js';
import ChunkManager from '../../../resources/js/game/games/open-world/streaming/ChunkManager.js';

function harness(options = {}) {
    const created = [];
    const disposed = [];
    const loader = {
        async load(definition, { signal, tier }) {
            await Promise.resolve();
            if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            const handle = {
                id: definition.id,
                tier,
                setTier(value) { this.tier = value; },
                dispose() { disposed.push(definition.id); },
            };
            created.push(definition.id);
            return handle;
        },
    };
    const unloader = { async unload(handle) { handle.dispose(); } };
    const manager = new ChunkManager({
        manifest,
        partition: new WorldPartition(manifest),
        loader,
        unloader,
        activeRadius: 0,
        preloadRadius: 1,
        maxLoadedChunks: 9,
        concurrency: 2,
        ...options,
    });
    return { manager, created, disposed };
}

test('chunk manager loads active and preload rings with bounded concurrency result', async () => {
    const { manager, created } = harness();
    manager.update({ x: 0, z: 0 });
    await manager.whenIdle();
    const stats = manager.stats();
    assert.equal(stats.loaded, 9);
    assert.equal(stats.active, 1);
    assert.equal(stats.dormant, 8);
    assert.equal(created.length, 9);
    await manager.dispose();
});

test('chunk manager unloads old chunks and promotes destination on movement', async () => {
    const { manager, disposed } = harness();
    manager.update({ x: 0, z: 0 });
    await manager.whenIdle();
    const oldCurrent = manager.stats().currentChunkId;
    manager.update({ x: -18, z: -12 });
    await manager.whenIdle();
    assert.notEqual(manager.stats().currentChunkId, oldCurrent);
    assert.equal(manager.loaded.get(manager.stats().currentChunkId).tier, 'active');
    assert.ok(disposed.length > 0);
    await manager.dispose();
});

test('chunk manager enforces memory budget without evicting current chunk', async () => {
    const { manager } = harness({ activeRadius: 1, preloadRadius: 2, maxLoadedChunks: 5 });
    manager.update({ x: 0, z: 0 });
    await manager.whenIdle();
    assert.equal(manager.stats().loaded, 5);
    assert.ok(manager.loaded.has(manager.stats().currentChunkId));
    await manager.dispose();
});

test('chunk manager aborts obsolete in-flight loads after a long-distance move', async () => {
    let aborted = 0;
    const loader = {
        load(definition, { signal, tier }) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => resolve({ id: definition.id, tier, setTier() {}, dispose() {} }), 12);
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    aborted += 1;
                    reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                }, { once: true });
            });
        },
    };
    const manager = new ChunkManager({
        manifest,
        partition: new WorldPartition(manifest),
        loader,
        unloader: { async unload(handle) { handle.dispose(); } },
        activeRadius: 0,
        preloadRadius: 0,
        maxLoadedChunks: 1,
        concurrency: 1,
    });
    manager.update({ x: -18, z: -12 });
    manager.update({ x: 18, z: 12 });
    await manager.whenIdle();
    assert.ok(aborted >= 1);
    assert.equal(manager.stats().currentChunkId, 'cafe-3-2');
    assert.ok(manager.loaded.has('cafe-3-2'));
    await manager.dispose();
});
