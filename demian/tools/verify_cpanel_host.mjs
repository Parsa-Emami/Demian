import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Read-only public cPanel host smoke test. Valid TLS is enforced by Node's
 * normal HTTPS certificate verification. No requests create accounts or scores.
 * This is NOT a performance, physical device or production data backup test.
 */
export async function auditCpanelHost({ origin, expectedSha, fetcher = fetch }) {
    if (typeof origin !== 'string'
        || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin)
        || origin.includes('..')) {
        throw new Error('A bare HTTPS cPanel API origin is required');
    }
    if (typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
        throw new Error('An exact 40-digit release SHA is required');
    }
    const checks = [];
    const get = async (path, headers = {}) => {
        const response = await fetcher(origin + path, {
            method: 'GET', redirect: 'manual', credentials: 'omit',
            cache: 'no-store', headers: { Accept: 'application/json', ...headers },
            signal: AbortSignal.timeout(12000),
        });
        checks.push({ path, status: response.status });
        return response;
    };
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
    return {
        status: 'passed', release: expectedSha, origin,
        probes: checks, tlsCertificateValidation: 'default-strict',
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
        });
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error('[cPanel Step 29] Host HTTP acceptance failed: '+error.message);
        process.exitCode = 1;
    }
}
