import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CharacterSpeechBubble from '../../resources/js/game/characters/CharacterSpeechBubble.js';
import { drawCharacterSpeech } from '../../resources/js/game/rendering2d/PixelActorRenderer.js';

const messages = ['ارادت', 'چه بازیکنی'];

test('every Amin quality variant carries exactly the two requested dialogue lines', () => {
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite', 'detail']) {
        const atlas = JSON.parse(readFileSync(new URL(`../../public/assets/characters/amin/amin-atlas-v14-${variant}.json`, import.meta.url)));
        assert.deepEqual(atlas.speech, { duration: 3.2, messages });
    }
});

test('the talk action selects both Amin lines without repeating the previous line', () => {
    const spoken = [];
    const speech = { messages, lastIndex: -1, show: message => spoken.push(message) };
    for (let i = 0; i < 20; i++) CharacterSpeechBubble.prototype.showRandom.call(speech);
    assert.deepEqual([...new Set(spoken)].sort(), [...messages].sort());
    assert.ok(spoken.every((line, i) => i === 0 || line !== spoken[i - 1]));
});

test('Canvas speech draws the actual text texture above the character and stays inside either viewport', () => {
    for (const [viewportWidth, viewportHeight, cssScale] of [[390, 600, 1], [1440, 900, 1.35]]) {
        for (const screen of [{ x: 2, y: 10 }, { x: viewportWidth - 2, y: viewportHeight - 2 }, { x: viewportWidth / 2, y: viewportHeight / 2 }]) {
            const image = { width: 1024, height: 320 };
            const calls = [];
            const ctx = { save() {}, restore() {}, drawImage(...args) { calls.push({ args, opacity: this.globalAlpha }); } };
            const camera = { viewportWidth, viewportHeight, pixelsPerUnit: 24, worldToScreen: () => screen };
            const entity = {
                position: { x: 0, z: 0 },
                animator: { currentFrameName: () => 'idle_000' },
                atlas: { frames: { idle_000: { x: 0, y: 0, w: 96, h: 96 } } },
                speech: { remaining: 3.2, sprite: { visible: true }, texture: { image }, material: { opacity: .8 } },
            };
            assert.equal(drawCharacterSpeech(ctx, camera, entity, { cssScale }), true);
            assert.equal(calls.length, 1);
            const [texture, x, y, width, height] = calls[0].args;
            assert.equal(texture, image);
            assert.equal(calls[0].opacity, .8);
            assert.ok(x >= 0 && y >= 0 && x + width <= viewportWidth && y + height <= viewportHeight);
            assert.equal(height / width, 320 / 1024);
            entity.speech.remaining = 0;
            assert.equal(drawCharacterSpeech(ctx, camera, entity), false);
            assert.equal(calls.length, 1);
        }
    }
});

test('Canvas speech ignores hidden, absent and incomplete textures', () => {
    const ctx = { drawImage() { assert.fail('Inactive speech must not be drawn'); } };
    assert.equal(drawCharacterSpeech(ctx, {}, {}), false);
    assert.equal(drawCharacterSpeech(ctx, {}, { speech: { remaining: 1, sprite: { visible: false } } }), false);
    assert.equal(drawCharacterSpeech(ctx, {}, { speech: { remaining: 1, sprite: { visible: true }, texture: { image: { complete: false } } } }), false);
});
