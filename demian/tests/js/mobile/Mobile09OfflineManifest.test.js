import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, truncateSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildOfflinePackManifest, OFFLINE_GAME_IDS, OFFLINE_MAX_PACK_BYTES } from '../../../tools/offline_pack_manifest.mjs';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../../../resources/js/game/characters/CharacterVisualContract.js';
import { sendPwaMessage } from '../../../resources/js/game/performance/PwaOfflineManager.js';

const entry = { file: 'assets/app-test.js', css: ['assets/app-test.css'] };
const version = '0123456789abcdef';
function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'demian-mobile09-'));
    const write = (path, value = 'data') => {
        const full = join(root, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, value);
        return full;
    };
    for (const path of [
        'index.html', 'characters.json', 'manifest.webmanifest',
        'build/assets/app-test.js', 'build/assets/app-test.css',
        'build/assets/font.woff2',
        'assets/characters/character-manifest-v4.json',
        'assets/characters/master-motion-v1.json',
        'assets/environments/cafe-runner-v1/wordmark.png',
        'assets/environments/cafe-runner-v1/interior.webp',
        'assets/environments/demian-fbx/polished-v1/preview.webp',
        'assets/environments/demian-fbx/floorplan.webp',
        'assets/environments/demian-fbx/floorplan-detail.webp',
        'assets/environments/demian-fbx/polished-v1/lod-1024/0-0.webp',
    ]) write(path);
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const v = characterPackVersion(slug), base = 'assets/characters/' + slug + '/' + slug;
        write(base + '-preview-v' + v + '.png');
        write(base + '-atlas-v' + v + '-lite.json');
        write(base + '-spritesheet-v' + v + '-lite.png');
    }
    return { root, write };
}

test('six portable offline bundles share one complete core and contain no credentials or API URLs', t => {
    const { root } = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
    const manifest = buildOfflinePackManifest({ release: root, entry, releaseId: version });
    assert.equal(manifest.release, version);
    assert.deepEqual(manifest.games.map(g => g.id), OFFLINE_GAME_IDS);
    assert.ok(manifest.core.length > 35);
    assert.ok(manifest.core.some(f => f.path === 'index.html'));
    assert.ok(manifest.core.some(f => f.path.endsWith('.woff2')));
    assert.ok(manifest.core.some(f => f.path.includes('-lite.png')));
    for (const pack of manifest.games) {
        assert.equal(pack.totalBytes, manifest.coreBytes + pack.bytes);
        assert.ok(pack.totalBytes <= OFFLINE_MAX_PACK_BYTES);
        assert.ok(pack.files.every(f => !f.path.includes('api/') && !f.path.startsWith('/')));
    }
    assert.ok(manifest.games.find(g => g.id === 'open-world').files.some(f => f.path.includes('lod-1024/')));
});

test('a broken or oversized release fails before any offline manifest is published', t => {
    const { root } = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.throws(() => buildOfflinePackManifest({ release: root, entry, releaseId: 'invalid' }),
        /release hash/);
    const oversize = join(root, 'assets/environments/demian-fbx/floorplan-detail.webp');
    truncateSync(oversize, OFFLINE_MAX_PACK_BYTES + 1);
    assert.throws(() => buildOfflinePackManifest({ release: root, entry, releaseId: version }),
        /exceeds 96 MiB/);
    truncateSync(oversize, 4);
    rmSync(join(root, 'index.html'));
    assert.throws(() => buildOfflinePackManifest({ release: root, entry, releaseId: version }),
        /Missing PWA asset/);
});

test('offline message exchange forwards progress, success and explicit worker errors', async () => {
    const worker = { postMessage(_data, ports) {
        const port = ports[0];
        port.postMessage({ type: 'PROGRESS', done: 1, total: 3 });
        port.postMessage({ type: 'DONE', coreReady: true, games: { 'dino-run': true } });
    } };
    const progress = [];
    const ready = await sendPwaMessage(worker, { type: 'DEMIAN_PACK_DOWNLOAD', id: 'dino-run' },
        { onProgress: x => progress.push(x.done), timeoutMs: 2000 });
    assert.deepEqual(progress, [1]);
    assert.equal(ready.games['dino-run'], true);
    await assert.rejects(sendPwaMessage({
        postMessage(_data, ports) { ports[0].postMessage({ type: 'ERROR', message: 'quota' }); },
    }, { type: 'DEMIAN_PACK_DOWNLOAD', id: 'dino-run' }), /quota/);
    await assert.rejects(sendPwaMessage(null, { type: 'DEMIAN_PACK_STATUS' }), /Service Worker/);
});

test('worker only downloads on explicit message, refuses private API caching, and gates offline shell on a ready marker', () => {
    const sw = readFileSync(new URL('../../../tools/templates/service-worker.js', import.meta.url), 'utf8');
    assert.match(sw, /DEMIAN_PACK_DOWNLOAD/);
    assert.match(sw, /DEMIAN_PACK_REMOVE/);
    assert.match(sw, /request\.headers\.has\('Authorization'\)/);
    assert.match(sw, /request\.credentials === 'include'/);
    assert.match(sw, /request\.credentials === 'include' && !publicStatic/);
    assert.match(sw, /\['image', 'font', 'style', 'script'\]/);
    const visual = readFileSync(new URL('../../../resources/js/game/characters/runtime/CharacterVisualService.js', import.meta.url), 'utf8');
    assert.match(visual, /navigator\?\.onLine === false/);
    assert.match(sw, /isReady\(CORE_CACHE, 'core'\)/);
    assert.match(sw, /await caches\.delete\(cacheName\)/);
    assert.match(sw, /event\.waitUntil\(self\.skipWaiting\(\)\)/);
    assert.doesNotMatch(sw, /fetch\([^)]*\/api\/v1\/arcade/);
});
