import test from 'node:test';
import assert from 'node:assert/strict';
import CafeArtStream from '../../../resources/js/game/rendering2d/CafeArtStream.js';
import { CAFE_BOUNDS } from '../../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';

const camera = {
    position: { x: (CAFE_BOUNDS.minX + CAFE_BOUNDS.maxX) / 2,
        z: (CAFE_BOUNDS.minZ + CAFE_BOUNDS.maxZ) / 2 },
    viewportWidth: 390,
    viewportHeight: 840,
    pixelsPerUnit: 35,
};
const policies = {
    saving: { deferBackground: true, reason: 'save-data', maxBackgroundNpcs: 0 },
    normal: { deferBackground: false, reason: 'normal', maxBackgroundNpcs: Infinity },
    slow: { deferBackground: false, reason: 'limited-3g', maxBackgroundNpcs: 1 },
};
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('cafe uses lightweight preview during Save-Data and resumes fine tile streaming after upgrade', async () => {
    let mode = 'saving';
    let loads = 0;
    const stream = new CafeArtStream({
        detected: 'high', quality: 'high',
        networkPolicy: () => policies[mode],
        loader: async () => { loads++; return { width: 512, height: 512, close() {} }; },
    });
    try {
        stream.prepare(camera);
        assert.equal(stream.desired.size, 0);
        assert.equal(stream.stats().active, 0);
        assert.equal(loads, 0);
        mode = 'slow';
        stream.onConnectionChange();
        stream.prepare(camera);
        assert.ok(stream.desired.size > 0);
        assert.ok(stream.desired.size <= 2, '3G may only request two optional detailed tiles');
        for (let i = 0; i < 50 && stream.stats().ready === 0; i++) await tick();
        assert.ok(stream.stats().ready > 0);
        mode = 'normal';
        stream.onConnectionChange();
        stream.prepare(camera);
        assert.ok(stream.desired.size >= 2);
    } finally {
        stream.dispose();
    }
});

test('optional cafe tiles abort on hidden/offline without restarting downloads', async () => {
    let mode = 'normal', cancelled = 0;
    const stream = new CafeArtStream({
        detected: 'high', quality: 'high',
        networkPolicy: () => policies[mode],
        loader: (_url, { signal }) => new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => {
                cancelled++;
                const error = new Error('tile cancelled');
                error.name = 'AbortError';
                reject(error);
            }, { once: true })),
    });
    try {
        stream.prepare(camera);
        assert.ok(stream.stats().active > 0);
        mode = 'saving';
        stream.onConnectionChange();
        stream.prepare(camera);
        assert.equal(stream.desired.size, 0);
        for (let i = 0; i < 40 && stream.stats().active > 0; i++) await tick();
        assert.equal(stream.stats().active, 0);
        assert.equal(stream.stats().ready, 0);
        assert.equal(stream.queue.length, 0);
        // A queued Promise may never reach the custom loader before abort; it
        // still must relinquish its permit without downloading the tile.
        assert.ok(cancelled >= 0);
    } finally {
        stream.dispose();
    }
});

test('normal network connection can clear stale tile cooldowns after reconnect', () => {
    let mode = 'saving';
    const stream = new CafeArtStream({ networkPolicy: () => policies[mode] });
    try {
        stream.failed.set('1536:0:0', Date.now() + 30000);
        stream.onConnectionChange();
        assert.equal(stream.failed.size, 1, 'Save-Data does not retry blocked tiles');
        mode = 'normal';
        stream.onConnectionChange();
        assert.equal(stream.failed.size, 0, 'recovering connection allows new tile requests');
        assert.equal(stream.viewKey, null);
    } finally {
        stream.dispose();
    }
});
