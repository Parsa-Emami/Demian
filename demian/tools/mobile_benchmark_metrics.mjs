import { readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';

export const MOBILE_GAME_IDS = Object.freeze([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
]);

/** Nearest-rank percentile: deterministic and easy to compare between reports. */
export function percentile(values, fraction) {
    const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    if (!sorted.length) return null;
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('Percentile must be between 0 and 1.');
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function distribution(values) {
    const valid = values.filter(value => Number.isFinite(value) && value >= 0);
    return { count: valid.length, p50: percentile(valid, .5), p95: percentile(valid, .95),
        p99: percentile(valid, .99), max: valid.length ? Math.max(...valid) : null,
        mean: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null };
}

export function inventoryRelease(directory) {
    const root = resolve(directory);
    const byExtension = {};
    const byDirectory = {};
    const files = [];
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const path = resolve(current, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) { walk(path); continue; }
            if (!entry.isFile()) continue;
            const bytes = statSync(path).size;
            const name = relative(root, path).split(sep).join('/');
            const extension = extname(path).toLowerCase() || '[none]';
            const group = name.split('/').slice(0, 3).join('/');
            byExtension[extension] = (byExtension[extension] ?? 0) + bytes;
            byDirectory[group] = (byDirectory[group] ?? 0) + bytes;
            files.push({ name, bytes });
        }
    };
    walk(root);
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    return {
        fileCount: files.length, totalBytes,
        byExtension: Object.fromEntries(Object.entries(byExtension).sort((a, b) => b[1] - a[1])),
        byDirectory: Object.fromEntries(Object.entries(byDirectory).sort((a, b) => b[1] - a[1]).slice(0, 30)),
        largestFiles: files.sort((a, b) => b.bytes - a.bytes).slice(0, 25),
    };
}

export function summarizeNetwork(requests) {
    const totals = { requestCount: requests.length, encodedTransferBytes: 0,
        failedRequests: [], httpErrors: [], cacheHits: 0, byType: {} };
    for (const row of requests) {
        const bytes = Number.isFinite(row.encodedBytes) && row.encodedBytes > 0 ? row.encodedBytes : 0;
        totals.encodedTransferBytes += bytes;
        const type = row.type ?? 'Other';
        const group = totals.byType[type] ?? { requests: 0, encodedBytes: 0 };
        group.requests++;
        group.encodedBytes += bytes;
        if (row.fromCache) totals.cacheHits++;
        if (row.error) totals.failedRequests.push({ url: row.url, reason: row.error });
        if (row.status >= 400) totals.httpErrors.push({ url: row.url, status: row.status });
    }
    return totals;
}

/** Provisional targets are advisory, never a false physical-device release gate. */
export const BUDGETS = Object.freeze({
    menuBootMs: 5000,
    initialTransferBytes: 5 * 1024 * 1024,
    renderP95MsAt60: 20,
    renderP95MsAt30: 38,
    touchRenderProxyP95Ms: 50,
});

export function evaluateAdvisoryBudget({ bootMs, transferBytes, renderP95, targetFps = 60, touchP95 }) {
    const measures = [
        ['menuBootMs', bootMs, BUDGETS.menuBootMs],
        ['initialTransferBytes', transferBytes, BUDGETS.initialTransferBytes],
        ['renderP95Ms', renderP95, targetFps === 30 ? BUDGETS.renderP95MsAt30 : BUDGETS.renderP95MsAt60],
        ['touchRenderProxyP95Ms', touchP95, BUDGETS.touchRenderProxyP95Ms],
    ];
    return measures.map(([name, actual, target]) => ({
        name, actual: Number.isFinite(actual) ? actual : null, target,
        status: !Number.isFinite(actual) ? 'unmeasured' : actual <= target ? 'within-target' : 'investigate',
    }));
}
