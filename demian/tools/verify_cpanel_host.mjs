import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Read-only public cPanel host smoke test. Valid TLS is enforced by Node's
 * normal HTTPS certificate verification. No requests create accounts or scores.
 * This is NOT a performance, physical device or production data backup test.
 */
export async function auditCpanelHost({ origin, expectedSha, allowedOrigin = null, fetcher = fetch }) {
    if (typeof origin !== 'string'
        || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin)
        || origin.includes('..')) {
        throw new Error('A bare HTTPS cPanel API origin is required');
    }
    if (typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
        throw new Error('An exact 40-digit release SHA is required');
    }
    if (allowedOrigin !== null
        && (typeof allowedOrigin !== 'string'
            || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(allowedOrigin)
            || allowedOrigin.includes('..') || allowedOrigin === origin)) {
        throw Error('Explicit distinct HTTPS frontend Origin is required');
    }
    const checks = [];
    const probe = async (path, method = 'GET', headers = {}) => {
        const response = await fetcher(origin + path, {
            method, redirect: 'manual', credentials: 'omit',
            cache: 'no-store', headers: { Accept: 'application/json', ...headers },
            signal: AbortSignal.timeout(12000),
        });
        checks.push({ path, method, status: response.status });
        return response;
    };
    const get = (path, headers = {}) => probe(path, 'GET', headers);
    const readiness = await get('/api/v1/arcade/health');
    if (readiness.status !== 200
        || !(readiness.headers?.get('cache-control') ?? '').includes('no-store')) {
        throw new Error('The API readiness endpoint is not healthy or has unsafe caching');
    }
    let health;
    try { health = await readiness.json(); } catch { throw Error('Unreadable API readiness JSON'); }
    if (health?.status !== 'ok' || health?.release !== expectedSha) {
        throw new Error('The API release is not healthy or does not match this deployment');
    }
    const alive = await get('/up');
    if (alive.status !== 200) throw Error('Laravel /up endpoint is unavailable');

    // Fail closed if the configured domain points at the Laravel project root
    // instead of its public/ directory, even if the API itself responds.
    for (const path of [
        '/.env',
        '/artisan',
        '/composer.json',
        '/composer.lock',
        '/vendor/autoload.php',
        '/bootstrap/cache/config.php',
        '/storage/logs/laravel.log',
        '/.git/config',
        '/database/database.sqlite',
        '/characters',
    ]) {
        const response = await get(path);
        if (![403, 404, 410].includes(response.status)) {
            throw Error('The API origin exposes or incorrectly serves a private path: '+path);
        }
    }
    const hostileOrigin = 'https://untrusted-audit.example.invalid';
    const cors = await get('/api/v1/arcade/rules', { Origin: hostileOrigin });
    if (cors.status !== 200
        || cors.headers?.get('access-control-allow-origin') === hostileOrigin
        || cors.headers?.get('access-control-allow-origin') === '*') {
        throw Error('The API accepted an untrusted browser Origin or rules are unavailable');
    }
    // Missing CORS is as operationally broken as '*' CORS. Probe the actual
    // configured frontend, not only a blocked hostile Origin. OPTIONS is safe.
    if (allowedOrigin !== null) {
        const allowed = await get('/api/v1/arcade/rules', { Origin: allowedOrigin });
        const allowedHeader = allowed.headers?.get('access-control-allow-origin');
        if (allowed.status !== 200 || allowedHeader !== allowedOrigin
            || allowed.headers?.get('access-control-allow-credentials') === 'true') {
            throw Error('Configured frontend cannot use CORS or credentials are exposed');
        }
        const preflight = await probe('/api/v1/arcade/runs', 'OPTIONS', {
            Origin: allowedOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization, content-type',
        });
        const methods = preflight.headers?.get('access-control-allow-methods')?.toUpperCase() ?? '';
        const headers = preflight.headers?.get('access-control-allow-headers')?.toLowerCase() ?? '';
        if (![200, 204].includes(preflight.status)
            || preflight.headers?.get('access-control-allow-origin') !== allowedOrigin
            || !methods.includes('POST')
            || !headers.includes('authorization') || !headers.includes('content-type')) {
            throw Error('Frontend POST/Authorization preflight is misconfigured');
        }
    }
    for (const path of ['/api/v1/arcade/player', '/api/v1/arcade/player/coupons',
        '/api/v1/arcade/player/identity']) {
        const protectedResource = await get(path);
        if (protectedResource.status !== 401) {
            throw Error('Unauthenticated player resource was not protected: '+path);
        }
    }
    return {
        status: 'passed', release: expectedSha, origin,
        probes: checks, tlsCertificateValidation: 'default-strict',
        readOnlyRequests: checks.filter(row => row.method === 'GET').length,
        corsPreflights: checks.filter(row => row.method === 'OPTIONS').length,
        writeRequests: 0, physicalHostCapacityVerified: false,
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const flags = Object.fromEntries(process.argv.slice(2).map(x => {
        const index = x.indexOf('=');
        if (index < 0) return [x, ''];
        return [x.slice(0, index), x.slice(index + 1)];
    }));
    try {
        const result = await auditCpanelHost({
            origin: flags['--origin'], expectedSha: flags['--release'],
            allowedOrigin: flags['--client-origin'] ?? null,
        });
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error('[cPanel Step 29] Host HTTP acceptance failed: '+error.message);
        process.exitCode = 1;
    }
}
