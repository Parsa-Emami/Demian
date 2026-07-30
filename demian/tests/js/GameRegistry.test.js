import test from 'node:test';
import assert from 'node:assert/strict';
import BaseGame from '../../resources/js/game/contracts/BaseGame.js';
import GameRegistry from '../../resources/js/game/registry/GameRegistry.js';

class FakeGame extends BaseGame {}

test('GameRegistry lazily loads a module once and creates fresh instances', async () => {
    let loadCount = 0;
    const registry = new GameRegistry({
        fake: {
            title: 'Fake',
            inputContext: 'MENU',
            loader: async () => {
                loadCount += 1;
                return { default: FakeGame };
            },
        },
    });

    const first = await registry.create('fake');
    const second = await registry.create('fake');

    assert.equal(loadCount, 1);
    assert.ok(first instanceof FakeGame);
    assert.ok(second instanceof FakeGame);
    assert.notEqual(first, second);
});

test('GameRegistry clears failed lazy imports so launch can be retried', async () => {
    let attempts = 0;
    const registry = new GameRegistry({
        retryable: {
            loader: async () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('temporary failure');
                }
                return { default: FakeGame };
            },
        },
    });

    await assert.rejects(() => registry.create('retryable'), /temporary failure/);
    const game = await registry.create('retryable');

    assert.ok(game instanceof FakeGame);
    assert.equal(attempts, 2);
});

test('GameRegistry rejects duplicate and unknown game ids', () => {
    const registry = new GameRegistry({
        fake: { loader: async () => ({ default: FakeGame }) },
    });

    assert.throws(
        () => registry.register('fake', { loader: async () => ({ default: FakeGame }) }),
        /already registered/
    );
    assert.throws(() => registry.get('missing'), /not registered/);
});
