import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mergeCompatibleAssets, validateCompatibleAssets, MAX_COMPAT_GENERATIONS }
    from '../../tools/compatible_build_assets.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = path => readFileSync(resolve(root, path), 'utf8');
const GAMES = [
    'open-world/OpenWorldGame.js', 'dino-run/DinoRunGame.js',
    'after-hours/AfterHoursGame.js', 'cafe-rush/CafeRushGame.js',
    'cafe-critters/CafeCrittersGame.js', 'coffee-crash/CoffeeCrashGame.js',
];
function makeBuild() {
    const directory = mkdtempSync(join(tmpdir(), 'demian-split-build-'));
    const write = (name, content) => {
        const file = join(directory, name);
        mkdirSync(resolve(file, '..'), { recursive: true });
        writeFileSync(file, content);
    };
    const manifest = {
        'resources/js/app.js': {
            file: 'assets/app-main.js', isEntry: true,
            css: ['assets/app-style.css'], imports: ['_shared.js'],
            dynamicImports: GAMES.map(name => 'resources/js/game/games/' + name),
        },
        '_shared.js': { file: 'assets/shared.js' },
    };
    write('assets/app-main.js', "import './shared.js';\n");
    write('assets/shared.js', 'export const shared = true;\n');
    write('assets/app-style.css', 'body{color:white}');
    for (const [index, game] of GAMES.entries()) {
        const name = 'resources/js/game/games/' + game;
        const file = 'assets/Game' + index + '.js';
        manifest[name] = { file, isDynamicEntry: true, imports: ['_shared.js'] };
        write(file, 'export default class Game' + index + '{}\n');
    }
    const save = () => write('manifest.json', JSON.stringify(manifest));
    save();
    return { directory, manifest, save };
}
function validate(root) {
    return spawnSync(process.execPath,
        ['tools/validate_build_bundle.mjs', '--build-root', root],
        { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8' });
}
test('Vite 8 emits strictly ordered lazily imported game chunks', () => {
    const config = source('vite.config.js');
    assert.match(config, /rolldownOptions\s*:/);
    assert.match(config, /codeSplitting:\s*true/);
    assert.match(config, /strictExecutionOrder:\s*true/);
});
test('GitHub Pages retention and release QA gate the published build', () => {
    const workflow = source('../.github/workflows/deploy-demian-pages.yml');
    assert.match(workflow, /Restore previous hashed modules/);
    assert.match(workflow, /demian-build-compat/);
    assert.match(workflow, /retention-days:\s*90/);
    assert.match(workflow, /test:versioned-rollover:browser/);
    assert.match(workflow, /actions\/deploy-pages@v4/);
});
test('stale dynamic imports retain guarded reload and no infinite loop', () => {
    const blade = source('resources/views/demian.blade.php');
    assert.match(blade, /vite:preloadError/);
    assert.match(blade, /unhandledrejection/);
    assert.match(blade, /__demian_refresh/);
    assert.match(blade, /data-deployment-mode="versioned-chunks"/);
});
test('missing character art still renders the safe pixel fallback', () => {
    const manager = source('resources/js/game/managers/CharacterManager.js');
    assert.match(manager, /createFallbackCharacterAssets/);
    assert.match(manager, /assets = this\.createFallbackCharacterAssets\(record\)/);
});
test('manifest validator detects absent game chunks and unknown imports', t => {
    const { directory, manifest, save } = makeBuild();
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const valid = validate(directory);
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    const key = 'resources/js/game/games/' + GAMES[0];
    manifest[key].file = 'assets/missing.js';
    save();
    const missing = validate(directory);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing or empty split build resource/);
    manifest[key].file = 'assets/Game0.js';
    manifest[key].imports.push('_does_not_exist');
    save();
    const invalid = validate(directory);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Unresolved Vite manifest import/);
});
test('retained hashes allow an old game to load and reject a corrupt archive', t => {
    const folder = mkdtempSync(join(tmpdir(), 'demian-compat-'));
    t.after(() => rmSync(folder, { recursive: true, force: true }));
    const first = join(folder, 'first'), archive = join(folder, 'archive');
    const second = join(folder, 'second'), third = join(folder, 'third');
    for (const p of [first, second, third]) mkdirSync(join(p, 'build/assets'), { recursive: true });
    writeFileSync(join(first, 'build/assets/game-old.js'), 'export const game = 1;');
    mergeCompatibleAssets({ release: first, releaseId: 'aaaaaaaaaaaaaaaa' });
    cpSync(join(first, 'build'), archive, { recursive: true });
    writeFileSync(join(second, 'build/assets/game-new.js'), 'export const game = 2;');
    mergeCompatibleAssets({ release: second, archive, releaseId: 'bbbbbbbbbbbbbbbb', requireArchive: true });
    assert.equal(validateCompatibleAssets(second).generations, 2);
    assert.ok(existsSync(join(second, 'build/assets/game-old.js')));
    writeFileSync(join(third, 'build/assets/third.js'), 'export const game = 3;');
    assert.throws(() => mergeCompatibleAssets({ release: third,
        archive: join(folder, 'missing'), releaseId: 'cccccccccccccccc', requireArchive: true }),
        /Previous hashed chunks/);
    writeFileSync(join(archive, 'assets/game-old.js'), 'corrupted');
    assert.throws(() => mergeCompatibleAssets({
        release: third, archive, releaseId: 'cccccccccccccccc',
    }), /corrupt previous-release chunk/);
});
test('only the six most recent code generations are carried to the next release', t => {
    const folder = mkdtempSync(join(tmpdir(), 'demian-compat-window-'));
    t.after(() => rmSync(folder, { recursive: true, force: true }));
    let archive = null, last = null;
    for (let i = 0; i < MAX_COMPAT_GENERATIONS + 2; i++) {
        const release = join(folder, 'version' + i);
        mkdirSync(join(release, 'build/assets'), { recursive: true });
        writeFileSync(join(release, 'build/assets/game-' + i + '.js'), 'export const i=' + i);
        mergeCompatibleAssets({ release, archive, releaseId: i.toString(16).padStart(16, '0') });
        archive = join(folder, 'copy' + i);
        cpSync(join(release, 'build'), archive, { recursive: true });
        last = release;
    }
    const data = JSON.parse(readFileSync(join(last, 'build/compat.json'), 'utf8'));
    assert.equal(data.generations.length, MAX_COMPAT_GENERATIONS);
    assert.ok(!data.generations.some(g => g.id === '0000000000000000'));
});

test('first split migration copies the successful atomic release, not just new game chunks', () => {
    const restore = source('tools/restore_previous_build.mjs');
    assert.match(restore, /demiancafe-ir-static-site/);
    assert.match(restore, /offline-packs\.json/);
    assert.match(restore, /mergeCompatibleAssets/);
    assert.match(restore, /last successful atomic release artifact/);
    assert.match(restore, /previous release used dynamic chunks/i);
});
