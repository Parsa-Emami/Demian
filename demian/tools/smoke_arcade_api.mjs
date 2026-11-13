/**
 * Read-only Mobile-08 burst smoke test. Explicit opt-in only: at most 50
 * public GETs total. Never creates players, starts runs or submits scores.
 * A single burst cannot establish 24/7 capacity, battery use or 50 users/hour.
 *
 * Example:
 * node tools/smoke_arcade_api.mjs --base-url=https://api.example.com/api/v1/arcade --users=50
 */
import { pathToFileURL } from 'node:url';

export function percentile(values, quantile) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const ordered = [...values].sort((a, b) => a - b);
    const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(quantile * ordered.length) - 1));
    return Math.round(ordered[index] * 10) / 10;
}

export function summarize(results, maxP95Ms = 1500) {
    const successes = results.filter(row => row.ok);
    const errors = results.filter(row => !row.ok);
    const p95Ms = percentile(results.map(row => row.elapsedMs), .95);
    const p50Ms = percentile(results.map(row => row.elapsedMs), .5);
    return {
        total: results.length,
        success: successes.length,
        errors: errors.length,
        statusCounts: Object.fromEntries([...new Set(results.map(row => row.status))]
            .map(status => [String(status), results.filter(row => row.status === status).length])),
        p50Ms, p95Ms, maxP95Ms,
        passed: results.length > 0 && errors.length === 0 && p95Ms <= maxP95Ms,
    };
}

function parseArgs(argv) {
    const args = Object.fromEntries(argv.map(arg => {
        const [key, ...value] = arg.split('=');
        return [key, value.join('=')];
    }));
    if (!args['--base-url']) throw new Error('--base-url is required (HTTPS production API or localhost).');
    const url = new URL(args['--base-url']);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        throw new Error('Only HTTPS or localhost HTTP URLs are allowed.');
    }
    if (url.username || url.password || url.search || url.hash) throw new Error('Credentials and query strings are not allowed in base URL.');
    if (!url.pathname.endsWith('/api/v1/arcade')) {
        throw new Error('API URL must end with /api/v1/arcade.');
    }
    const users = Number(args['--users'] ?? 10);
    if (!Number.isInteger(users) || users < 1 || users > 50) {
        throw new Error('--users must be between 1 and 50.');
    }
    const maxP95Ms = Number(args['--p95-ms'] ?? 1500);
    if (!Number.isInteger(maxP95Ms) || maxP95Ms < 100 || maxP95Ms > 10000) {
        throw new Error('--p95-ms must be between 100 and 10000.');
    }
    return { baseUrl: url.href.replace(/\/$/, ''), users, maxP95Ms };
}

export async function runReadOnlySmoke({ baseUrl, users = 10, timeoutMs = 10000, fetcher = fetch } = {}) {
    if (!Number.isInteger(users) || users < 1 || users > 50) throw new RangeError('Users must be 1..50');
    const paths = ['/rules', '/leaderboards/dino-run?period=weekly', '/games'];
    return Promise.all(Array.from({ length: users }, async (_, i) => {
        const path = paths[i % paths.length];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = performance.now();
        try {
            const response = await fetcher(baseUrl + path, {
                method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                return { path, status: response.status, ok: false,
                    elapsedMs: performance.now() - started };
            }
            const json = await response.json();
            const valid = path.startsWith('/leaderboards/') ? Array.isArray(json.data)
                : path === '/games' ? Array.isArray(json.games)
                : json?.game_id === 'dino-run';
            return { path, status: response.status, ok: valid,
                elapsedMs: performance.now() - started };
        } catch (error) {
            return { path, status: 'network-error', ok: false,
                reason: error?.name ?? 'Error', elapsedMs: performance.now() - started };
        } finally {
            clearTimeout(timer);
        }
    }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const config = parseArgs(process.argv.slice(2));
        console.error(`[Demian] Running ${config.users} read-only GETs against ${config.baseUrl}. No writes.`);
        const summary = summarize(await runReadOnlySmoke(config), config.maxP95Ms);
        console.log(JSON.stringify({ target: config.baseUrl, ...summary, note:
            'A single burst is insufficient to certify sustained throughput; repeat under controlled hosting conditions.' }, null, 2));
        if (!summary.passed) process.exitCode = 1;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}
