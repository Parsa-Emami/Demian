import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, runReadOnlySmoke } from '../../../tools/smoke_arcade_api.mjs';

test('latency percentile and smoke verdict cannot hide 429 or 500', () => {
    assert.equal(percentile([], .95), null);
    assert.equal(percentile([1, 10, 20, 100], .95), 100);
    assert.equal(percentile([1, 10, 20, 100], .5), 10);
    assert.equal(summarize([{ ok: true, elapsedMs: 120, status: 200 }]).passed, true);
    const failed = summarize([
        { ok: true, elapsedMs: 100, status: 200 },
        { ok: false, elapsedMs: 100, status: 429 },
    ]);
    assert.equal(failed.passed, false);
    assert.equal(failed.errors, 1);
    assert.equal(failed.statusCounts['429'], 1);
    assert.equal(summarize([{ ok: true, elapsedMs: 1700, status: 200 }]).passed, false);
});

test('bounded concurrent smoke never mutates player data and follows all public GET contracts', async () => {
    const calls = [], active = { current: 0, max: 0 };
    const fetcher = async (url, options) => {
        active.current++;
        active.max = Math.max(active.max, active.current);
        calls.push({ url, options });
        await new Promise(done => setTimeout(done, 3));
        active.current--;
        return { status: 200, ok: true, json: async () =>
            url.includes('/games') ? { games: [] }
                : url.includes('/leaderboards/') ? { data: [] } : { game_id: 'dino-run' } };
    };
    const results = await runReadOnlySmoke({
        baseUrl: 'https://api.test/api/v1/arcade', users: 50, fetcher,
    });
    assert.equal(results.length, 50);
    assert.ok(active.max > 1 && active.max <= 50);
    assert.equal(summarize(results).passed, true);
    assert.ok(calls.every(({ url, options }) => url.startsWith('https://api.test/api/v1/arcade/')
        && options.method === 'GET' && options.credentials === 'omit'
        && options.headers.Authorization === undefined));
    await assert.rejects(runReadOnlySmoke({ users: 51 }), RangeError);
});
