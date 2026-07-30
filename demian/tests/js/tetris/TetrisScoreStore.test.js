import test from 'node:test';
import assert from 'node:assert/strict';
import TetrisScoreStore from '../../../resources/js/game/games/tetris/persistence/TetrisScoreStore.js';

function storage() {
    const values = new Map();
    return {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); },
    };
}

test('Tetris score store persists versioned aggregate progress', () => {
    const backend = storage();
    const first = new TetrisScoreStore({ storage: backend, key: 'tetris' });
    const commit = first.commitSession({ score: 1200, lines: 12, level: 2 });
    const second = new TetrisScoreStore({ storage: backend, key: 'tetris' });

    assert.equal(commit.isNewHighScore, true);
    assert.equal(second.snapshot().highScore, 1200);
    assert.equal(second.snapshot().gamesPlayed, 1);
    assert.equal(second.snapshot().totalLines, 12);
});

test('Tetris score store rejects malformed persisted numbers', () => {
    const backend = storage();
    backend.setItem('tetris', JSON.stringify({ highScore: -99, bestLevel: 'bad' }));
    const store = new TetrisScoreStore({ storage: backend, key: 'tetris' });

    assert.equal(store.snapshot().highScore, 0);
    assert.equal(store.snapshot().bestLevel, 1);
});
