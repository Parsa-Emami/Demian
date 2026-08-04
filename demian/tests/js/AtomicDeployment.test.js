import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../..');

function source(path) {
    return readFileSync(resolve(root, path), 'utf8');
}

function makeBuild({ dynamic = false } = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'demian-atomic-build-'));
    mkdirSync(join(directory, 'assets'), { recursive: true });
    writeFileSync(join(directory, 'assets/app-test.js'), 'console.log("demian atomic");\n');

    const manifest = {
        'resources/js/app.js': {
            file: 'assets/app-test.js',
            isEntry: true,
            ...(dynamic ? { dynamicImports: ['resources/js/game/games/role-play/RolePlayGame.js'] } : {}),
        },
    };

    if (dynamic) {
        manifest['resources/js/game/games/role-play/RolePlayGame.js'] = {
            file: 'assets/RolePlayGame-deadbeef.js',
            isDynamicEntry: true,
        };
        writeFileSync(join(directory, 'assets/RolePlayGame-deadbeef.js'), 'export default class RolePlayGame {}\n');
    }

    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return directory;
}

test('production config disables game code splitting with the Vite 8 Rolldown API', () => {
    const config = source('vite.config.js');
    assert.match(config, /rolldownOptions\s*:/);
    assert.match(config, /codeSplitting\s*:\s*false/);
    assert.match(config, /strictExecutionOrder\s*:\s*true/);
    assert.doesNotMatch(config, /rollupOptions\s*:/);
});

test('GitHub Pages deployment validates and publishes one atomic bundle', () => {
    const workflow = source('../.github/workflows/deploy-demian-pages.yml');
    assert.match(workflow, /npm run validate:build/);
    assert.match(workflow, /expected one atomic JavaScript bundle/i);
    assert.match(workflow, /bundle_mode[^\n]*atomic/);
    assert.match(workflow, /actions\/upload-pages-artifact@v4/);
    assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('the HTML shell performs a guarded recovery from stale Vite chunks', () => {
    const blade = source('resources/views/demian.blade.php');
    assert.match(blade, /vite:preloadError/);
    assert.match(blade, /unhandledrejection/);
    assert.match(blade, /__demian_refresh/);
    assert.match(blade, /data-runtime-version="9\.1\.0-atomic-pixel2d"/);
    assert.match(blade, /data-deployment-mode="atomic-bundle"/);
});

test('missing character art falls back without aborting the café simulation', () => {
    const manager = source('resources/js/game/managers/CharacterManager.js');
    assert.match(manager, /createFallbackCharacterAssets/);
    assert.match(manager, /using the built-in pixel fallback/);
    assert.match(manager, /new THREE\.CanvasTexture\(canvas\)/);
    assert.match(manager, /assets = this\.createFallbackCharacterAssets\(record\)/);
});

test('atomic build validator accepts a single bundle and rejects game chunks', () => {
    const valid = makeBuild();
    const invalid = makeBuild({ dynamic: true });

    try {
        const validResult = spawnSync(process.execPath, [
            'tools/validate_build_bundle.mjs',
            '--build-root',
            valid,
        ], { cwd: root, encoding: 'utf8' });
        assert.equal(validResult.status, 0, `${validResult.stdout}\n${validResult.stderr}`);

        const invalidResult = spawnSync(process.execPath, [
            'tools/validate_build_bundle.mjs',
            '--build-root',
            invalid,
        ], { cwd: root, encoding: 'utf8' });
        assert.notEqual(invalidResult.status, 0);
        assert.match(`${invalidResult.stdout}\n${invalidResult.stderr}`, /dynamic deployment chunks|Standalone game chunks/i);
    } finally {
        rmSync(valid, { recursive: true, force: true });
        rmSync(invalid, { recursive: true, force: true });
    }
});
