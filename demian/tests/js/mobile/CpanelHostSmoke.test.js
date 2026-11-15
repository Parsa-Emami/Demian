import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCpanelHost } from '../../../tools/verify_cpanel_host.mjs';

const sha = 'a'.repeat(40);
const origin = 'https://api.example.test';
const response = (status, json = null, headers = {}) => ({
    status, json: async () => json,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
});
const mock = (change = {}) => {
    const requests = [];
    const fetcher = async (url, options) => {
        requests.push({ url, options });
        const path = new URL(url).pathname;
        if (path === '/api/v1/arcade/health') {
            return response(change.healthStatus ?? 200,
                { status: change.state ?? 'ok', release: change.sha ?? sha },
                { 'cache-control': change.cache ?? 'no-store, private' });
        }
        if (path === '/up') return response(200);
        if (path === '/api/v1/arcade/rules') {
            return response(200, {version: 'test'},
                change.untrustedCors ? { 'access-control-allow-origin': change.untrustedCors } : {});
        }
        return response(change.exposedPath === path ? 200 : 404);
    };
    return { fetcher, requests };
};

test('Step 29 host smoke checks exact release, all private paths and hostile CORS without writing', async () => {
    const { fetcher, requests } = mock();
    const result = await auditCpanelHost({origin, expectedSha: sha, fetcher});
    assert.equal(result.status, 'passed');
    assert.equal(result.writeRequests, 0);
    assert.ok(result.probes.length >= 13);
    assert.ok(requests.some(x => x.url.endsWith('/.env')));
    assert.ok(requests.some(x => x.url.endsWith('/composer.lock')));
    assert.ok(requests.some(x => x.url.endsWith('/.git/config')));
    assert.ok(requests.every(x => x.options.method === 'GET'
        && x.options.credentials === 'omit'
        && x.options.redirect === 'manual'
        && !x.options.headers.Authorization));
});

test('Step 29 host smoke rejects insecure origin, wrong release, exposed secret, and permissive CORS', async () => {
    const cases = [
        {origin: 'http://api.example.test', expectedSha: sha, fetcher: mock().fetcher},
        {origin, expectedSha: 'incorrect', fetcher: mock().fetcher},
        {origin, expectedSha: sha, fetcher: mock({sha: 'b'.repeat(40)}).fetcher},
        {origin, expectedSha: sha, fetcher: mock({cache: 'public,max-age=600'}).fetcher},
        {origin, expectedSha: sha, fetcher: mock({exposedPath: '/.env'}).fetcher},
        {origin, expectedSha: sha, fetcher: mock({exposedPath: '/vendor/autoload.php'}).fetcher},
        {origin, expectedSha: sha,
            fetcher: mock({untrustedCors: 'https://untrusted-audit.example.invalid'}).fetcher},
        {origin, expectedSha: sha, fetcher: mock({untrustedCors: '*'}).fetcher},
    ];
    for (const options of cases) {
        await assert.rejects(auditCpanelHost(options));
    }
});
