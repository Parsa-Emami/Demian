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

test('Open World studio frame payload satisfies CharacterManagerUI HUD contract', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/OpenWorldGame.js'), 'utf8');
    const frameEmit = source.slice(source.indexOf("this.context.eventBus.emit('studio:frame'"), source.indexOf("this.context.eventBus.emit('studio:frame'") + 700);
    assert.match(frameEmit, /position,/);
    assert.match(frameEmit, /cameraMode:\s*this\.cameraController\?\.mode\s*\?\?\s*'OVERVIEW'/);
});

test('CharacterManagerUI HUD tolerates incomplete telemetry without breaking the game frame', async () => {
    const source = await readFile(url('resources/js/ui/CharacterManagerUI.js'), 'utf8');
    const hudStart = source.indexOf('renderHud(frame = {})');
    const hud = source.slice(hudStart, source.indexOf('renderActiveCharacter', hudStart));
    assert.match(hud, /const position = frame\.position \?\? \{\}/);
    assert.match(hud, /Number\.isFinite\(Number\(position\.x\)\)/);
    assert.match(hud, /Number\.isFinite\(Number\(position\.z\)\)/);
    assert.match(hud, /'OVERVIEW'/);
});


test('V10 renderer presents the logical backbuffer at an integer pixel scale', async () => {
    const source = await readFile(url('resources/js/game/services/RendererService.js'), 'utf8');
    assert.match(source, /choosePixelGrid\(/);
    assert.match(source, /presentationScale/);
    assert.match(source, /this\.logicalWidth \* this\.presentationScale/);
    assert.match(source, /this\.logicalHeight \* this\.presentationScale/);
    assert.match(source, /data(?:set)?\.pixelGrid|dataset\.pixelGrid/);
});

test('Open World applies hard-edged 8-bit scene finishing after actors are drawn', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js'), 'utf8');
    const queue = source.indexOf('this.queue.flush(ctx)');
    const effects = source.indexOf('drawPixelSceneEffects(ctx');
    assert.ok(queue >= 0 && effects > queue);
    assert.match(source, /setZoom\(15/);
});

test('World map derives district labels from chunk centers instead of optional manifest fields', async () => {
    const source = await readFile(url('resources/js/game/games/open-world/ui/WorldMap.js'), 'utf8');
    assert.match(source, /districtCenter\(districtId\)/);
    assert.match(source, /chunk\.center\.x/);
    assert.match(source, /chunk\.center\.z/);
    assert.match(source, /district\?\.color/);
});
