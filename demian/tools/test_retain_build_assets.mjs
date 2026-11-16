/** Release immutability and bounded lineage regression without network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainBuildAssets } from './retain_build_assets.mjs';

const makeBuild = (base, appHash, gameHash) => {
    const build = join(base, 'build');
    mkdirSync(join(build, 'assets'), { recursive: true });
    writeFileSync(join(build, 'manifest.json'), JSON.stringify({
        'resources/js/app.js': { file: 'assets/app-' + appHash + '.js' },
        'resources/js/game/games/dino-run/DinoRunGame.js': { file: 'assets/DinoRunGame-' + gameHash + '.js' },
    }));
    writeFileSync(join(build, 'assets/app-' + appHash + '.js'), 'main:' + appHash);
    writeFileSync(join(build, 'assets/DinoRunGame-' + gameHash + '.js'), 'game:' + gameHash);
};
test('two older hashed releases remain deployable and the third ages out', () => {
    const temp = mkdtempSync(join(tmpdir(), 'demian-hashed-'));
    try {
        let prior = null;
        for (let index = 0; index < 4; index++) {
            const id = String(index).repeat(8);
            const site = join(temp, 'r' + index);
            makeBuild(site, id, id);
            const result = retainBuildAssets({ site, previous: prior });
            assert.equal(result.preservedReleases, Math.min(index, 2));
            const lineage = JSON.parse(readFileSync(join(site, 'build/asset-history.json')));
            assert.equal(lineage.releases.length, 1 + Math.min(index, 2));
            for (const row of lineage.releases) {
                for (const asset of row.files) {
                    assert.ok(readFileSync(join(site, 'build', asset)).length);
                }
            }
            const nextPrior = join(temp, 'prior' + index);
            mkdirSync(nextPrior);
            cpSync(join(site, 'build/assets'), join(nextPrior, 'assets'), { recursive: true });
            cpSync(join(site, 'build/asset-history.json'), join(nextPrior, 'asset-history.json'));
            prior = nextPrior;
        }
    } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('a missing historical chunk fails closed rather than silently breaking old tabs', () => {
    const temp = mkdtempSync(join(tmpdir(), 'demian-missing-'));
    try {
        const site = join(temp, 'site');
        const prior = join(temp, 'prior');
        makeBuild(site, 'aaaaaaaa', 'aaaaaaaa');
        mkdirSync(join(prior, 'assets'), { recursive: true });
        writeFileSync(join(prior, 'asset-history.json'), JSON.stringify({
            schema: 1, releases: [{ id: 'bbbbbbbbbbbbbbbb',
                files: ['assets/DinoRunGame-bbbbbbbb.js'] }],
        }));
        assert.throws(() => retainBuildAssets({ site, previous: prior }), /Missing prior immutable/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
});
