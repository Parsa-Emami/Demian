import test from 'node:test';
import assert from 'node:assert/strict';
import CafeArtStream, { cafeQualityProfile, cafeArtLevel, visibleCafeTiles } from '../../resources/js/game/rendering2d/CafeArtStream.js';
import { CAFE_BOUNDS } from '../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import art from '../../resources/game/cafe-art.json' with { type: 'json' };

const camera = (z = -4.68, ppu = 24) => ({ position: { x: .36, z }, pixelsPerUnit: ppu, viewportWidth: 800, viewportHeight: 600,
    worldToScreen(p) { return { x: 400 + (p.x - this.position.x) * ppu, y: 300 + (p.z - this.position.z) * ppu }; } });
const bitmap = onClose => ({ width: 516, height: 516, close() { onClose?.(); } });
async function settle(stream) {
    for (let i = 0; i < 100 && stream.active.size; i++) await Promise.all([...stream.active.values()].map(entry => entry.promise));
    assert.equal(stream.active.size, 0);
}

test('cafe quality resolves explicit choices and keeps the same surface art in every tier', () => {
    assert.equal(cafeQualityProfile('auto', 'performance').quality, 'performance');
    assert.equal(cafeQualityProfile('high', 'performance').quality, 'high');
    assert.equal(cafeQualityProfile('unknown', 'unknown').quality, 'balanced');
    assert(Object.isFrozen(cafeQualityProfile('high')));
    assert.equal(cafeArtLevel(camera(0, 2), cafeQualityProfile('high')), null);
    for (const tier of ['performance', 'balanced', 'high']) {
        const profile = cafeQualityProfile(tier);
        assert(cafeArtLevel(camera(0, 32), profile).width <= profile.maxWidth);
    }
});

test('tile selection covers the FBX transform, clips at edges and never flips the entrance', () => {
    const level = art.levels.at(-1);
    for (const z of [CAFE_BOUNDS.minZ, -119.16, -44.28, -4.68, CAFE_BOUNDS.maxZ]) {
        const tiles = visibleCafeTiles(camera(z), level, 96);
        assert(tiles.length > 0);
        assert.equal(new Set(tiles.map(tile => tile.id)).size, tiles.length);
        for (const tile of tiles) {
            assert(tile.x >= 0 && tile.x < level.width);
            assert(tile.y >= 0 && tile.y < level.height);
        }
    }
    assert(visibleCafeTiles(camera(-4.68), level).every(tile => tile.y > level.height / 2));
    assert.deepEqual(visibleCafeTiles({ ...camera(), position: { x: 9999, z: 9999 } }, level), []);
    assert.deepEqual(visibleCafeTiles(camera(), null), []);
});

test('stationary overview requests no tiles and close view coalesces repeated prepares', async () => {
    let requests = 0;
    const stream = new CafeArtStream({ quality: 'performance', loader: async () => { requests++; return bitmap(); } });
    stream.prepare(camera(0, 2)); assert.equal(requests, 0); assert.equal(stream.active.size, 0);
    for (let i = 0; i < 20; i++) stream.prepare(camera());
    await settle(stream);
    const loaded = requests;
    for (let i = 0; i < 20; i++) stream.prepare(camera());
    await settle(stream);
    assert.equal(requests, loaded); assert(loaded > 0 && loaded <= 8);
    stream.dispose();
});

test('travel evicts and closes decoded tiles within each tier budget', async () => {
    for (const quality of ['performance', 'balanced', 'high']) {
        let created = 0, closed = 0;
        const stream = new CafeArtStream({ quality, loader: async () => { created++; return bitmap(() => closed++); } });
        for (const z of [-4.68, -44.28, -79.56, -119.16, -162, -4.68]) {
            stream.prepare(camera(z), 96); await settle(stream);
            const stats = stream.stats();
            assert(stats.ready <= stats.maxTiles); assert(stats.decodedBytes <= stats.maxDecodedBytes);
        }
        assert(closed > 0); stream.dispose(); assert.equal(closed, created); assert.equal(stream.loadedBytes, 0);
    }
});

test('a late high-quality decode cannot enter the cache after a quality change', async () => {
    let release, closed = 0, count = 0;
    const stream = new CafeArtStream({ quality: 'high', loader: async () => {
        if (count++ === 0) return new Promise(done => { release = () => done(bitmap(() => closed++)); });
        return bitmap(() => closed++);
    } });
    stream.prepare(camera()); await Promise.resolve();
    stream.setQuality('performance'); stream.prepare(camera()); release(); await settle(stream);
    assert.equal(stream.stats().quality, 'performance'); assert(closed > 0);
    assert([...stream.ready.values()].every(entry => entry.tile.level.width === 1024));
    assert(stream.stats().ready <= 8); stream.dispose();
});

test('failed tiles retain the preview and wait for cooldown instead of retrying every frame', async () => {
    let now = 0, requests = 0;
    const stream = new CafeArtStream({ quality: 'performance', clock: () => now, loader: async () => { requests++; throw Error('offline'); } });
    stream.prepare(camera()); await settle(stream); const initial = requests;
    assert(initial > 0); assert.equal(stream.ready.size, 0);
    for (let i = 0; i < 30; i++) stream.prepare(camera());
    await settle(stream); assert.equal(requests, initial);
    now = 30001; stream.prepare(camera()); await settle(stream); assert(requests > initial);
    stream.dispose();
});

test('concurrent requests respect the tier limit and dispose aborts outstanding work', async () => {
    for (const quality of ['performance', 'balanced', 'high']) {
        const signals = [];
        const stream = new CafeArtStream({ quality, loader: async (_url, { signal }) => {
            signals.push(signal);
            return new Promise((_done, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
        } });
        stream.prepare(camera()); await Promise.resolve();
        assert.equal(signals.length, cafeQualityProfile(quality).concurrency);
        stream.dispose(); await settle(stream);
        assert(signals.every(signal => signal.aborted)); assert.equal(stream.ready.size, 0);
    }
});

test('tile drawing includes bleed and finite placement in the shared world coordinate system', async () => {
    const stream = new CafeArtStream({ quality: 'performance', loader: async () => bitmap() });
    stream.prepare(camera()); await settle(stream);
    const calls = []; stream.draw({ drawImage: (...args) => calls.push(args) }, camera());
    assert.equal(calls.length, stream.ready.size);
    for (const call of calls) assert(call.slice(1).every(Number.isFinite));
    stream.dispose();
});
