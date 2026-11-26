import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const spec = JSON.parse(read('../../resources/game/game-design-standard-v1.json'));
const active = GAME_CATALOG.filter(game => game.available);

test('design standard covers every released game exactly once and preserves cafe identity', () => {
    assert.equal(spec.schemaVersion, 1);
    assert.equal(spec.phase, 1);
    assert.equal(active.length, 7);
    assert.deepEqual(spec.games.map(game => game.id).sort(), active.map(game => game.id).sort());
    assert.equal(new Set(spec.games.map(game => game.id)).size, spec.games.length);
    for (const game of active) {
        assert.equal(game.environment, spec.environment);
        assert.equal(game.environmentLocked, true);
    }
});

test('each game has a complete core loop, progression, risk and measurable acceptance intent', () => {
    for (const game of spec.games) {
        assert.ok(spec.pillars.includes(game.pillar), game.id);
        assert.ok(game.loop.length >= 3 && game.loop.every(step => step.trim()), game.id);
        assert.ok(game.session.minSeconds > 0 && game.session.maxSeconds >= game.session.minSeconds, game.id);
        for (const field of ['skill', 'failure', 'progression', 'competitive']) assert.ok(game[field].trim(), game.id + ':' + field);
        assert.ok(game.risks.length >= 2 && game.acceptance.length >= 3, game.id);
    }
});

test('quality gates specify priorities and evidence without pretending external acceptance', () => {
    assert.equal(new Set(spec.gates.map(gate => gate.id)).size, spec.gates.length);
    assert.ok(spec.gates.length >= 12);
    for (const gate of spec.gates) {
        assert.match(gate.id, /^GDS-\d{2}$/);
        assert.ok(['P0', 'P1', 'P2'].includes(gate.priority));
        assert.ok(gate.requirement && gate.evidence && gate.area);
    }
    assert.equal(spec.metrics.release.criticalOpenDefectsMaximum, 0);
    assert.equal(spec.metrics.release.verifiedPrizeLeakMaximum, 0);
    assert.ok(spec.metrics.note.includes('not measured'));
    for (const id of ['after-hours', 'cafe-rush', 'open-world']) {
        assert.match(spec.games.find(game => game.id === id).competitive, /no-prizes$/);
    }
});

test('home menu omits redundant copy in Blade and tracked playable output', () => {
    for (const path of ['../../resources/views/demian.blade.php', '../../../playable/index.html']) {
        const html = read(path);
        assert.doesNotMatch(html, /data-game-library-summary|class="cafe-menu__footer"|بازی‌های کوچک، ماجراجویی‌های بزرگ/);
        assert.match(html, /data-shell-action="play"/);
        assert.match(html, /<nav class="demian-legal-links"/);
    }
});

test('tracked playable offline index size and release identifiers agree', () => {
    const html = read('../../../playable/index.html');
    const manifest = JSON.parse(read('../../../playable/offline-packs.json'));
    const worker = read('../../../playable/service-worker.js');
    assert.equal(manifest.core.find(row => row.path === 'index.html').bytes, Buffer.byteLength(html));
    assert.equal(manifest.coreBytes, manifest.core.reduce((sum, row) => sum + row.bytes, 0));
    assert.equal(manifest.release, /const RELEASE_ID = '([a-f0-9]{16})'/.exec(worker)?.[1]);
    for (const game of manifest.games) {
        assert.equal(game.totalBytes, manifest.coreBytes + game.bytes);
        assert.ok(game.totalBytes <= manifest.maxPackBytes);
    }
});
