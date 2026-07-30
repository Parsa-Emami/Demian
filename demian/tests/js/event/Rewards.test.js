import test from 'node:test';
import assert from 'node:assert/strict';
import RewardResolver from '../../../resources/js/game/games/event/rewards/RewardResolver.js';
import EventRewardStore from '../../../resources/js/game/games/event/persistence/EventRewardStore.js';
import cafeRush from '../../../resources/js/game/games/event/definitions/cafe-rush.json' with { type: 'json' };

function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('RewardResolver applies score conditions and EventRewardStore is idempotent', () => {
    const receipt = new RewardResolver().resolve(cafeRush, {
        sessionId: 's1', successful: true, score: 1000,
        objectives: cafeRush.objectives.map((item) => ({ id: item.id, status: 'completed' })),
    });
    assert.equal(receipt.totals.coin, 300);
    assert.ok(receipt.unlocks.badges.includes('cafe-runner'));
    const store = new EventRewardStore({ storage: memoryStorage() });
    const first = store.commit(receipt);
    const second = store.commit(receipt);
    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(store.snapshot().wallet.coin, 300);
});

test('failed events resolve no rewards', () => {
    const receipt = new RewardResolver().resolve(cafeRush, { sessionId: 's2', successful: false, score: 9999 });
    assert.deepEqual(receipt.rewards, []);
    assert.equal(receipt.totals.coin, 0);
});

test('server reward claims are converted into authoritative idempotent receipts', () => {
    const resolver = new RewardResolver();
    const receipt = resolver.fromServerClaim(cafeRush, {
        id: 'claim-1',
        event_session_id: 'session-1',
        event_id: 'cafe-rush',
        successful: true,
        score: 1400,
        rewards: [
            { type: 'coin', amount: 125 },
            { type: 'badge', id: 'server-verified' },
        ],
    });
    assert.equal(receipt.id, 'server:claim-1');
    assert.equal(receipt.totals.coin, 125);
    assert.deepEqual(receipt.unlocks.badges, ['server-verified']);

    const store = new EventRewardStore({ storage: memoryStorage() });
    assert.equal(store.commit(receipt).applied, true);
    assert.equal(store.commit(receipt).applied, false);
    assert.equal(store.snapshot().wallet.coin, 125);
});

