import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const OPEN_WORLD_SOURCE = new URL(
    '../../../resources/js/game/games/open-world/OpenWorldGame.js',
    import.meta.url
);
const CHUNK_RENDERER_SOURCE = new URL(
    '../../../resources/js/game/games/open-world/render/OpenWorldChunkRenderer.js',
    import.meta.url
);
const ARCADE_WORLD_SOURCE = new URL(
    '../../../resources/js/game/world/ArcadeWorld.js',
    import.meta.url
);

const RENDERER_SERVICE_SOURCE = new URL(
    '../../../resources/js/game/services/RendererService.js',
    import.meta.url
);
const GAME_APPLICATION_SOURCE = new URL(
    '../../../resources/js/game/application/GameApplication.js',
    import.meta.url
);

test('Open World uses the shared direct renderer instead of the optional bloom composer', async () => {
    const source = await readFile(OPEN_WORLD_SOURCE, 'utf8');

    assert.doesNotMatch(source, /PostProcessingPipeline/);
    assert.match(source, /this\.context\.renderer\.render\(this\.scene, this\.camera\)/);
    assert.match(source, /renderScene\(\{ phase: 'bootstrap', strict: false \}\)/);
});

test('Open World renders the café before blocking character boot', async () => {
    const source = await readFile(OPEN_WORLD_SOURCE, 'utf8');
    const bootstrapFrame = source.indexOf("renderScene({ phase: 'bootstrap'");
    const characterBoot = source.indexOf('await this.characterManager.boot()');

    assert.ok(bootstrapFrame >= 0, 'bootstrap frame is required');
    assert.ok(characterBoot >= 0, 'character boot is required');
    assert.ok(
        bootstrapFrame < characterBoot,
        'the café bootstrap frame must be drawn before character assets are awaited'
    );
});

test('Open World resize uses the authoritative renderer dimensions', async () => {
    const source = await readFile(OPEN_WORLD_SOURCE, 'utf8');

    assert.match(source, /const \{ width, height \} = this\.context\.renderer\.resize\(this\.pixelRatio\)/);
    assert.doesNotMatch(source, /this\.pipeline\.resize/);
});

test('ArcadeWorld can restore and inspect the café scene root', async () => {
    const source = await readFile(ARCADE_WORLD_SOURCE, 'utf8');

    assert.match(source, /ensureAttached\(\)/);
    assert.match(source, /if \(this\.root\.parent !== this\.scene\) this\.scene\.add\(this\.root\)/);
    assert.match(source, /renderStats\(\)/);
});

test('OpenWorldChunkRenderer consumes ChunkLoader option objects without disposing shared resources', async () => {
    const source = await readFile(CHUNK_RENDERER_SOURCE, 'utf8');

    assert.match(source, /const tier = typeof options === 'string' \? options : options\?\.tier \?\? 'preload'/);
    assert.match(source, /const signal = typeof options === 'object'/);
    assert.doesNotMatch(source, /child\.geometry\?\.dispose/);
    assert.match(source, /group\.clear\(\)/);
});


test('the shared renderer exposes every state-reset API used during game switches', async () => {
    const rendererSource = await readFile(RENDERER_SERVICE_SOURCE, 'utf8');
    const applicationSource = await readFile(GAME_APPLICATION_SOURCE, 'utf8');

    assert.match(applicationSource, /this\.rendererService\.resetState\(\{ clear: true \}\)/);
    assert.match(rendererSource, /resetState\(\{ clear = false \} = \{\}\)/);
    assert.match(rendererSource, /render\(scene, camera\)/);
    assert.match(rendererSource, /this\.renderer\.setRenderTarget\(null\)/);
});
