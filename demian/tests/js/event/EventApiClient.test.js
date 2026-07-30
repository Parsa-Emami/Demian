import test from 'node:test';
import assert from 'node:assert/strict';
import EventApiClient from '../../../resources/js/game/games/event/network/EventApiClient.js';

function response(payload, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => payload };
}

test('EventApiClient starts an authoritative session and submits evidence with its token', async () => {
    const calls = [];
    const fetcher = async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/sessions')) {
            return response({
                data: { id: 'session-1', token: 'secret', seed: 'seed-1' },
                definition: { id: 'cafe-rush' },
            }, { status: 201 });
        }
        return response({ data: { id: 'claim-1', successful: true, rewards: [] } });
    };
    const client = new EventApiClient({ baseUrl: '/api/v1/events/', fetcher, timeoutMs: 1000 });
    const started = await client.startSession('cafe-rush', { source: 'test' });
    const claim = await client.completeSession(started.session, {
        score: 100,
        elapsed_ms: 1200,
        evidence: { collected_item_ids: [], reached_zone_ids: [], defeated_enemy_ids: [] },
    });

    assert.equal(started.session.id, 'session-1');
    assert.equal(claim.id, 'claim-1');
    assert.equal(calls[0].url, '/api/v1/events/cafe-rush/sessions');
    assert.equal(calls[1].url, '/api/v1/event-sessions/session-1/complete');
    assert.equal(calls[1].options.headers['X-Event-Token'], 'secret');
});

test('EventApiClient rejects malformed and failed responses', async () => {
    const failed = new EventApiClient({
        baseUrl: '/api/v1/events',
        fetcher: async () => response({ message: 'invalid evidence' }, { ok: false, status: 422 }),
    });
    await assert.rejects(() => failed.startSession('cafe-rush'), /invalid evidence/);

    const malformed = new EventApiClient({
        baseUrl: '/api/v1/events',
        fetcher: async () => response({ data: {} }),
    });
    await assert.rejects(() => malformed.startSession('cafe-rush'), /invalid session payload/);
});
