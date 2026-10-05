import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';
import DinoRunGame from '../../../resources/js/game/games/dino-run/DinoRunGame.js';
import { runnerLighting } from '../../../resources/js/game/games/dino-run/DinoRunEnvironment.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../../resources/js/game/characters/CharacterVisualContract.js';
import CharacterVisualService from '../../../resources/js/game/characters/runtime/CharacterVisualService.js';
import { smoothPresentationGrid } from '../../../resources/js/game/services/RendererService.js';

test('slide immediately follows grounded input and is available on the very first landing step', () => {
    const model = new DinoRunModel(); model.status = 'running';
    model.step(1 / 60, { slide: true }); assert.equal(model.duck, true);
    model.y = .01; model.vy = -20;
    model.obstacles = [{ x: RUNNER_CONFIG.playerX, previousX: RUNNER_CONFIG.playerX,
        y: RUNNER_CONFIG.birdAltitude, w: 40, h: 22 }];
    model.step(1 / 60, { duck: true });
    assert.equal(model.y, 0); assert.equal(model.duck, true); assert.equal(model.status, 'running');
});

test('runner sends a real slide state to the shared avatar, then releases it without losing jump controls', () => {
    const game = new DinoRunGame(); let lastActor;
    game.context = { app: { sessionState: 'playing' }, root: { dataset: { sidebarState: 'collapsed' } } };
    game.actor = {}; game.avatar = { sync: (actor) => { lastActor = { ...actor }; } };
    game.model.status = 'running';
    game.fixedUpdate(1 / 60, { duck: true }); assert.equal(lastActor.motionState, 'slide');
    game.fixedUpdate(1 / 60, {}); assert.equal(lastActor.motionState, null);
    game.fixedUpdate(1 / 60, { jump: true, jumpHeld: true }); assert.equal(lastActor.airborne, true);
});

test('each installed character has a dense, independent low slide cycle and correct wing metadata', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const atlas = JSON.parse(readFileSync(resolve(import.meta.dirname,
            `../../../public/assets/characters/${slug}/${slug}-atlas-v14-mobile.json`), 'utf8'));
        assert.equal(Object.keys(atlas.frames).length, 672);
        assert.equal(atlas.animations.run.frames.length, 80);
        assert.equal(atlas.animations.slide.frames.length, 64);
        assert.equal(atlas.animations.slide.loop, true);
        const running = new Set(atlas.animations.run.frames);
        assert.ok(atlas.animations.slide.frames.every((f) => !running.has(f) && atlas.frames[f]));
        assert.equal(atlas.render.dedicatedSlide, true);
        assert.equal(atlas.render.frameBlend, false);
        if (slug === 'uzudi') assert.deepEqual(atlas.movement.wingPoweredStates,
            ['run', 'sprint', 'takeoff', 'jump', 'fall', 'slide']);
    }
});

test('old character selections recover to Darya while the new characters persist across games', () => {
    let value = 'tiam';
    const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
    const service = new CharacterVisualService({ storage });
    assert.equal(service.activeSlug, 'darya');
    service.setActiveSlug('uzudi'); assert.equal(value, 'uzudi');
    service.setActiveSlug('ronak'); assert.equal(service.activeSlug, 'uzudi');
    assert.equal(new CharacterVisualService({ storage }).activeSlug, 'uzudi');
});

test('switching characters evicts older decoded sheets while retaining recent and in-use images', async () => {
    const service = new CharacterVisualService({ storage: null });
    let loads = 0;
    service.loadPair = async (slug, variant) => {
        loads += 1;
        return { slug, variant, image: { naturalWidth: 2688, naturalHeight: 3136 } };
    };
    const darya = await service.loadPack('darya');
    await service.loadPack('setayesh');
    assert.equal(await service.loadPack('darya'), darya);
    await service.loadPack('uzudi');
    assert.equal(service.packCache.size, 2);
    assert.equal(service.packCache.has('setayesh:mobile'), false);
    assert.equal(darya.image.naturalWidth, 2688);
    assert.equal(loads, 3);
    await service.loadPack('setayesh');
    assert.equal(loads, 4);
    assert.equal(service.packCache.size, 2);
});

test('day, sunset, night and sunrise form a continuous bounded cycle independent of score', () => {
    assert.equal(runnerLighting(0).night, 0); assert.equal(runnerLighting(48).night, 1);
    assert.equal(runnerLighting(80).night, 0);
    assert.deepEqual(runnerLighting(0), runnerLighting(90));
    assert.ok(runnerLighting(32).twilight > .9);
    for (let t = 0; t < 90; t += 1 / 60) {
        const current = runnerLighting(t), next = runnerLighting(t + 1 / 60);
        assert.ok(current.night >= 0 && current.night <= 1);
        assert.ok(Math.abs(next.night - current.night) < .003);
    }
});

test('smooth character rendering preserves face detail with a bounded mobile backbuffer', () => {
    const mobile = smoothPresentationGrid(390, 844, 3, 1.35);
    assert.ok(mobile.logicalWidth >= 520);
    assert.ok(mobile.logicalWidth * mobile.logicalHeight <= 1250000);
    const low = smoothPresentationGrid(390, 844, 3, 1);
    assert.deepEqual(low, { logicalWidth: 390, logicalHeight: 844 });
    for (const [w, h] of [[844, 390], [768, 1024], [1440, 900], [3840, 2160]]) {
        const grid = smoothPresentationGrid(w, h, 3, 1.5);
        assert.ok(grid.logicalWidth * grid.logicalHeight <= 1250000);
    }
});
