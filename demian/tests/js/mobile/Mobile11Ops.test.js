import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runReadOnlySmoke, summarize } from '../../../tools/smoke_arcade_api.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const release = read('../../../ops/mobile-11/release.sh');
const backup = read('../../../ops/mobile-11/backup_mysql.sh');
const deploy = read('../../../../.github/workflows/mobile11-api-deploy.yml');
const load = read('../../../tools/load/mobile11_read_only.js');
const pages = read('../../../../.github/workflows/deploy-demian-pages.yml');

test('production deployment is manual, gated and pinned to explicit SSH host keys', () => {
    assert.match(deploy, /workflow_dispatch:/);
    assert.doesNotMatch(deploy, /\n  push:/);
    assert.match(deploy, /DEPLOY_PRODUCTION_WITH_BACKUP/);
    assert.match(deploy, /environment:/);
    assert.match(deploy, /secrets.API_DEPLOY_SSH_KEY/);
    assert.match(deploy, /secrets.API_SSH_KNOWN_HOSTS/);
    assert.match(deploy, /StrictHostKeyChecking=yes/);
    assert.match(deploy, /refs\/heads\/main/);
    assert.doesNotMatch(deploy, /StrictHostKeyChecking=no/);
    assert.match(deploy, /composer install --no-dev/);
    assert.match(deploy, /resources\/game/);
});

test('immutable release retains .env and storage, checks readiness and rolls back code on failure', () => {
    assert.match(release, /shared\/\.env/);
    assert.match(release, /shared\/storage/);
    assert.match(release, /flock -n/);
    assert.match(release, /\.mobile11-release/);
    assert.match(release, /php artisan arcade:integrity --json/);
    assert.match(release, /php artisan migrate --force/);
    assert.match(release, /curl -fsS/);
    assert.match(release, /rollback\(\)/);
    assert.match(release, /mv -Tf/);
    assert.ok(release.indexOf('php artisan migrate --force') <
        release.indexOf('activate "$release"'));
    assert.match(release, /APP_DEBUG=/);
    assert.match(release, /APP_KEY=/);
    assert.doesNotMatch(release, /migrate:rollback/);
});

test('encrypted backup mandates permissions and fails closed on pipeline errors', () => {
    assert.match(backup, /pipefail/);
    assert.match(backup, /umask 077/);
    assert.match(backup, /mysqldump --defaults-extra-file/);
    assert.match(backup, /--single-transaction/);
    assert.match(backup, /age -r/);
    assert.match(backup, /sha256sum/);
    assert.match(backup, /OFFSITE TRANSFER/);
});

test('load test has explicit authorization, tight rate bounds and never writes', () => {
    assert.match(load, /DEMIAN_LOAD_APPROVED/);
    assert.match(load, /constant-arrival-rate/);
    assert.match(load, /rate: 50/);
    assert.match(load, /per-vu-iterations/);
    assert.match(load, /p\(95\)<500/);
    assert.match(load, /http_req_failed/);
    assert.doesNotMatch(load, /http\.post\s*\(/);
    assert.doesNotMatch(load, /http\.del\s*\(/);
});

test('frontend API URL remains explicit, never forces staging endpoints on visitors', () => {
    assert.match(pages, /vars.DEMIAN_ARCADE_API_URL/);
    assert.match(pages, /github.ref == 'refs\/heads\/main'/);
    assert.match(pages, /\|\| ''/);
});

test('read-only 50-client smoke cannot submit a score or create a player', async () => {
    const calls = [];
    const fake = async (url, options) => {
        calls.push({url,options});
        const body = url.endsWith('/games') ? {games: []}
            : url.includes('/leaderboards/') ? {data: []}
            : {game_id: 'dino-run'};
        return {ok: true, status: 200, json: async () => body};
    };
    const rows = await runReadOnlySmoke({
        baseUrl: 'https://example.test/api/v1/arcade', users: 50, fetcher: fake,
    });
    assert.equal(rows.length, 50);
    assert.equal(summarize(rows).passed, true);
    assert.equal(calls.length, 50);
    assert.ok(calls.every(c => c.options.method === 'GET' &&
        !c.options.headers.Authorization && c.options.credentials === 'omit'));
});

test('smoke fails on degraded responses, not only HTTP errors', async () => {
    const rows = await runReadOnlySmoke({
        baseUrl: 'https://example.test/api/v1/arcade', users: 3,
        fetcher: async () => ({ok: true, status: 200, json: async () => ({})}),
    });
    assert.equal(summarize(rows).passed, false);
    assert.equal(summarize(rows).errors, 3);
});
