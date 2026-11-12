import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BUDGETS, MOBILE_GAME_IDS, percentile, distribution, inventoryRelease, summarizeNetwork, evaluateAdvisoryBudget,
} from '../../../tools/mobile_benchmark_metrics.mjs';

describe('Mobile-01 benchmark measurement contract', () => {
    it('defines exactly the six production games in a stable order', () => {
        assert.deepEqual(MOBILE_GAME_IDS, [
            'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
        ]);
    });

    it('computes deterministic nearest-rank percentiles and excludes invalid values', () => {
        assert.equal(percentile([30, 10, 20, Number.NaN, -1], .5), 20);
        assert.equal(percentile([10, 20, 30, 40, 50], .95), 50);
        assert.equal(percentile([], .95), null);
        assert.throws(() => percentile([1], 1.2), RangeError);
        assert.deepEqual(distribution([1, 3, 5, -1, NaN]), {
            count: 3, p50: 3, p95: 5, p99: 5, max: 5, mean: 3,
        });
    });

    it('records transferred network bytes without treating decoded length as transfer', () => {
        const actual = summarizeNetwork([
            { url: '/a.png', type: 'Image', encodedBytes: 123, status: 200 },
            { url: '/a.js', type: 'Script', encodedBytes: 50, status: 200, fromCache: true },
            { url: '/b.png', type: 'Image', encodedBytes: 0, status: 404 },
            { url: '/timeout', type: 'Other', error: 'timeout' },
        ]);
        assert.equal(actual.requestCount, 4);
        assert.equal(actual.encodedTransferBytes, 173);
        assert.equal(actual.cacheHits, 1);
        assert.equal(actual.byType.Image.encodedBytes, 123);
        assert.deepEqual(actual.httpErrors, [{ url: '/b.png', status: 404 }]);
        assert.deepEqual(actual.failedRequests, [{ url: '/timeout', reason: 'timeout' }]);
    });

    it('reports optional measurements as unmeasured, and budgets as advisory only', () => {
        const rows = evaluateAdvisoryBudget({
            bootMs: 6000, transferBytes: 100, renderP95: null, touchP95: NaN, targetFps: 30,
        });
        assert.equal(rows.find(x => x.name === 'menuBootMs').status, 'investigate');
        assert.equal(rows.find(x => x.name === 'initialTransferBytes').status, 'within-target');
        assert.equal(rows.find(x => x.name === 'renderP95Ms').target, BUDGETS.renderP95MsAt30);
        assert.equal(rows.find(x => x.name === 'renderP95Ms').status, 'unmeasured');
        assert.equal(rows.find(x => x.name === 'touchRenderProxyP95Ms').status, 'unmeasured');
    });

    it('inventories deploy artifacts without following symlinks and ranks largest files', () => {
        const root = mkdtempSync(join(tmpdir(), 'demian-mobile01-'));
        try {
            mkdirSync(join(root, 'assets/characters'), { recursive: true });
            writeFileSync(join(root, 'index.html'), '1234');
            writeFileSync(join(root, 'assets/characters/darya.png'), '123456789');
            writeFileSync(join(root, 'assets/characters/iman.png'), '12345');
            const result = inventoryRelease(root);
            assert.equal(result.fileCount, 3);
            assert.equal(result.totalBytes, 18);
            assert.equal(result.byExtension['.png'], 14);
            assert.equal(result.largestFiles[0].name, 'assets/characters/darya.png');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
