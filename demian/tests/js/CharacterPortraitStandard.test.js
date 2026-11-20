import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CharacterPreviewRenderer from '../../resources/js/ui/CharacterPreviewRenderer.js';
import { PORTRAIT_STANDARD, PORTRAIT_LANDMARKS, resolvePortraitFrame } from '../../resources/js/ui/CharacterPortraitStandard.js';

import contract from '../../resources/game/character-visual-standard-v2.json' with { type: 'json' };

const manifest = JSON.parse(readFileSync(new URL('../../resources/game/character-motion.json', import.meta.url), 'utf8'));

test('every current roster character has an explicit portrait calibration and a square poster', () => {
    assert.deepEqual(Object.keys(PORTRAIT_LANDMARKS).sort(), manifest.characters.map(c => c.slug).sort());
    for (const { slug, packVersion } of manifest.characters) {
        const png = readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-preview-v${packVersion}.png`, import.meta.url));
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', slug);
        assert.equal(png.readUInt32BE(16), PORTRAIT_STANDARD.referenceSize, slug);
        assert.equal(png.readUInt32BE(20), PORTRAIT_STANDARD.referenceSize, slug);
    }
});

test('all crops preserve head bounds, aspect ratio, face scale and common eye alignment', () => {
    for (const [slug, [ex, ey, chin, left, top, right]] of Object.entries(PORTRAIT_LANDMARKS)) {
        const f = resolvePortraitFrame(slug, 224, 224);
        assert.ok(f, slug);
        assert.equal(f.w, f.h, slug);
        assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= 224 && f.y + f.h <= 224, slug);
        assert.ok(left >= f.x && right <= f.x + f.w && top >= f.y && chin <= f.y + f.h, slug);
        assert.ok(Math.abs((ex - f.x) / f.w - PORTRAIT_STANDARD.eyeX) <= .01, slug);
        assert.ok(Math.abs((ey - f.y) / f.h - PORTRAIT_STANDARD.eyeY) <= .01, slug);
        assert.ok((chin - ey) / f.h >= .15 && (chin - ey) / f.h <= PORTRAIT_STANDARD.eyeToChin + .001, slug);
        const double = resolvePortraitFrame(slug, 448, 448);
        assert.deepEqual(double, { x: f.x * 2, y: f.y * 2, w: f.w * 2, h: f.h * 2 }, slug);
    }
});

test('unknown, invalid or non-square art is not assigned a guessed crop', () => {
    for (const [slug, w, h] of [['unknown', 224, 224], ['toString', 224, 224], ['darya', 0, 0], ['darya', 224, 200], ['darya', Infinity, Infinity]]) {
        assert.equal(resolvePortraitFrame(slug, w, h), null);
    }
});

test('renderer applies calibrated crops only to portrait cards, not regular previews', async () => {
    const calls = [];
    const ctx = { clearRect() {}, drawImage(...args) { calls.push(args); } };
    const canvas = { dataset: {}, clientWidth: 112, clientHeight: 112, width: 112, height: 112,
        setAttribute() {}, getContext: () => ctx };
    const renderer = new CharacterPreviewRenderer();
    renderer.loadImage = async () => ({ naturalWidth: 224, naturalHeight: 224 });
    const record = { slug: 'darya', preview_url: 'https://example.test/poster.png' };
    await renderer.render(canvas, { ...record, portrait: true });
    const f = resolvePortraitFrame('darya', 224, 224);
    assert.deepEqual(calls[0].slice(1, 5), [f.x, f.y, f.w, f.h]);
    assert.equal(canvas.dataset.previewState, 'ready');
    assert.equal(canvas.dataset.portraitStandard, 'v2');
    assert.equal(ctx.imageSmoothingEnabled, false);
    await renderer.render(canvas, record);
    assert.deepEqual(calls[1].slice(1, 5), [0, 0, 224, 224]);
    await renderer.render(canvas, { ...record, slug: 'unknown', portrait: true });
    assert.deepEqual(calls[2].slice(1, 5), [0, 0, 224, 224]);
});

test('V2 family references, complete roster, accessories and shared rig match the shipped motion contract', () => {
    assert.equal(contract.version, 'demian-character-standard-v2');
    assert.equal(contract.families['female-base-v1'].reference, 'darya');
    assert.equal(contract.families['male-base-v1'].reference, 'arsal');
    assert.deepEqual(contract.canonicalRig, manifest.skeleton);
    assert.deepEqual(Object.keys(contract.characters).sort(), manifest.characters.map(c => c.slug).sort());
    for (const c of manifest.characters) {
        assert.equal(contract.characters[c.slug].family, c.family);
        assert.deepEqual(contract.characters[c.slug].accessories, c.accessories.map(a => a.kind));
        assert.equal(c.packVersion, contract.packVersion);
    }
    const ratios = Object.entries(PORTRAIT_LANDMARKS).map(([slug, m]) =>
        (m[2] - m[1]) / resolvePortraitFrame(slug, 224, 224).h);
    assert.ok(Math.max(...ratios) - Math.min(...ratios) <= .025);
    assert.equal(contract.atlas.worldSize, 3.75);
    assert.deepEqual(contract.atlas.pivot, {x: .5, y: .94});
});
