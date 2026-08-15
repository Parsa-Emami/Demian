import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = (path) => new URL(`../../../${path}`, import.meta.url);

test('Open World uses the Canvas2D pixel renderer for every visible frame', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/OpenWorldGame.js'), 'utf8');
    assert.match(source, /OpenWorldPixelRenderer/);
    assert.match(source, /this\.pixelRenderer\.render/);
    assert.doesNotMatch(source, /this\.context\.renderer\.render\(this\.scene, this\.camera\)/);
    assert.match(source, /renderScene\(\{ phase: 'bootstrap', strict: false \}\)/);
});

test('Open World renders the café before blocking character boot', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/OpenWorldGame.js'), 'utf8');
    const bootstrapFrame = source.indexOf("renderScene({ phase: 'bootstrap'");
    const characterBoot = source.indexOf('await this.characterManager.boot()');
    assert.ok(bootstrapFrame >= 0 && characterBoot >= 0 && bootstrapFrame < characterBoot);
});

test('Open World chunk renderer is data-only and never owns GPU resources', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/render/OpenWorldChunkRenderer.js'), 'utf8');
    assert.match(source, /Data-only chunk factory/);
    assert.doesNotMatch(source, /geometry|material|from ['"]three['"]/);
    assert.match(source, /this\.handles\.clear\(\)/);
});

test('the shared renderer owns a nearest-neighbour logical backbuffer', async () => {
    const source = await readFile(url('resources/js/game/services/RendererService.js'), 'utf8');
    assert.match(source, /getContext\('2d'/);
    assert.match(source, /bufferCanvas/);
    assert.match(source, /imageSmoothingEnabled = false/);
    assert.match(source, /imageRendering: 'pixelated'/);
    assert.doesNotMatch(source, /WebGLRenderer/);
    assert.match(source, /lowLatency = false/);
    assert.match(source, /rendererLowLatency/);
    assert.match(source, /\? \{ alpha: false, desynchronized: true \}/);
});

test('primary Canvas2D rendering does not request the low-latency compositor by default', async () => {
    const source = await readFile(url('resources/js/game/services/RendererService.js'), 'utf8');
    const defaultOptions = source.indexOf('lowLatency = false');
    const conditionalLowLatency = source.indexOf('? { alpha: false, desynchronized: true }');
    const stableDefault = source.indexOf(': { alpha: false }');
    assert.ok(defaultOptions >= 0);
    assert.ok(conditionalLowLatency > defaultOptions);
    assert.ok(stableDefault > conditionalLowLatency);
});
