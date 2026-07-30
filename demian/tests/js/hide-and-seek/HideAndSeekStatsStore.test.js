import test from 'node:test';
import assert from 'node:assert/strict';
import HideAndSeekStatsStore from '../../../resources/js/game/games/hide-and-seek/persistence/HideAndSeekStatsStore.js';

class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(key, value); }
}

test('HideAndSeekStatsStore persists versioned aggregate statistics', () => {
    const storage = new MemoryStorage();
    const store = new HideAndSeekStatsStore({ storage });
    const state = store.commit({ won: true, role: 'hider', score: 900, survivalSeconds: 72, tags: 0 });
    assert.equal(state.matches, 1);
    assert.equal(state.wins, 1);
    assert.equal(state.hiderWins, 1);
    assert.equal(state.bestScore, 900);
    assert.equal(new HideAndSeekStatsStore({ storage }).snapshot().longestSurvivalSeconds, 72);
});
