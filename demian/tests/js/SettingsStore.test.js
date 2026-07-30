import test from 'node:test';
import assert from 'node:assert/strict';
import SettingsStore, { DEFAULT_SETTINGS } from '../../resources/js/game/settings/SettingsStore.js';

function createStorage(seed = {}) {
    const data = new Map(Object.entries(seed));
    return {
        getItem(key) { return data.get(key) ?? null; },
        setItem(key, value) { data.set(key, value); },
        dump(key) { return data.get(key); },
    };
}

test('SettingsStore validates persisted values and preserves defaults', () => {
    const key = 'settings';
    const storage = createStorage({
        [key]: JSON.stringify({
            quality: 'ultra',
            motion: 'reduced',
            hudVisible: false,
            soundEnabled: 'yes',
        }),
    });
    const store = new SettingsStore({ storage, storageKey: key, mediaQuery: { matches: false } });

    assert.equal(store.snapshot().quality, DEFAULT_SETTINGS.quality);
    assert.equal(store.snapshot().motion, 'reduced');
    assert.equal(store.snapshot().hudVisible, false);
    assert.equal(store.snapshot().soundEnabled, DEFAULT_SETTINGS.soundEnabled);
});

test('SettingsStore persists updates and emits immutable snapshots', () => {
    const key = 'settings';
    const storage = createStorage();
    const store = new SettingsStore({ storage, storageKey: key, mediaQuery: { matches: false } });
    const changes = [];
    store.subscribe((change) => changes.push(change));

    const current = store.update({ quality: 'high', musicEnabled: false });

    assert.equal(current.quality, 'high');
    assert.equal(current.musicEnabled, false);
    assert.ok(Object.isFrozen(current));
    assert.equal(changes.length, 1);
    assert.deepEqual(JSON.parse(storage.dump(key)), current);
});

test('SettingsStore resolves system motion preference without overwriting user state', () => {
    const mediaQuery = { matches: true };
    const store = new SettingsStore({ storage: createStorage(), mediaQuery });

    assert.equal(store.resolvedReducedMotion(), true);
    store.update({ motion: 'full' });
    assert.equal(store.resolvedReducedMotion(), false);
    store.update({ motion: 'reduced' });
    assert.equal(store.resolvedReducedMotion(), true);
});
