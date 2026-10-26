import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import InputBindingStore, { DEFAULT_BINDINGS, keyboardToken } from '../../resources/js/game/input/InputBindingStore.js';
import GamepadSource, { radialStick } from '../../resources/js/game/input/GamepadSource.js';
import { INPUT_CONTEXTS } from '../../resources/js/game/input/InputContexts.js';
import CharacterActionBuffer, { IMPULSE_ACTIONS } from '../../resources/js/game/characters/CharacterActionBuffer.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import CharacterFeedback from '../../resources/js/game/rendering2d/CharacterFeedback.js';
import CharacterFollowRig from '../../resources/js/game/rendering2d/CharacterFollowRig.js';
import GameRuntime from '../../resources/js/game/runtime/GameRuntime.js';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';
const pad = ({ buttons = [], axes = [0, 0], index = 0 } = {}) => ({ index, connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: Number(buttons.includes(i)) })) });
const source = () => { const input = new GamepadSource(); input.poll([pad()], 'OPEN_WORLD'); return input; };

test('physical key codes work with Persian text and down movement no longer slides', () => {
    assert.equal(keyboardToken({ code: 'KeyW', key: 'ص' }), 'w'); assert.equal(keyboardToken({ code: 'KeyS', key: 'س' }), 's');
    assert.equal(keyboardToken({ code: 'ShiftRight' }), 'shift'); assert.equal(keyboardToken({ code: 'Space' }), 'space');
    assert.equal(INPUT_CONTEXTS.OPEN_WORLD.actions.slide.keys.includes('arrowdown'), false);
    assert.ok(INPUT_CONTEXTS.OPEN_WORLD.axes.z.positive.includes('arrowdown')); assert.ok(INPUT_CONTEXTS.DINO_RUN.actions.duck.keys.includes('arrowdown'));
});
test('rebindings reject conflicts and reserved keys, persist and preserve touch aliases', () => {
    const memory = new Map(), storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
    const store = new InputBindingStore(storage);
    for (const key of ['v', 'escape', 'arrowdown', 'f', 'r']) assert.equal(store.set('jump', key).ok, false);
    assert.equal(store.set('jump', 'j').persisted, true);
    const restored = new InputBindingStore(storage), world = restored.context('OPEN_WORLD', INPUT_CONTEXTS.OPEN_WORLD);
    assert.equal(restored.bindings.jump, 'j'); assert.deepEqual(world.actions.jump.keys, ['jump', 'j']); assert.deepEqual(world.actions.jumpHeld.keys, ['jumpHeld', 'j']);
    assert.ok(restored.context('DINO_RUN', INPUT_CONTEXTS.DINO_RUN).actions.jump.keys.includes('j'));
    restored.reset(); assert.deepEqual(restored.bindings, DEFAULT_BINDINGS);
});
test('unavailable storage cannot prevent play or a temporary rebinding', () => {
    const store = new InputBindingStore({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    assert.deepEqual(store.bindings, DEFAULT_BINDINGS); assert.deepEqual(store.set('dash', 'j'), { ok: true, persisted: false });
});
test('radial deadzone removes drift, rescales and caps diagonal movement', () => {
    assert.deepEqual(radialStick(.1, .1), { x: 0, z: 0, magnitude: 0 }); assert.ok(Math.abs(radialStick(.59, 0).x - .5) < 1e-9);
    const full = radialStick(1, 1); assert.equal(full.magnitude, 1); assert.ok(Math.abs(Math.hypot(full.x, full.z) - 1) < 1e-9); assert.equal(radialStick(NaN, 1).magnitude, 0);
});
test('gamepad edges survive render-only frames and fire once across fixed updates', () => {
    const input = source(); input.poll([pad({ buttons: [0, 5] })], 'OPEN_WORLD'); input.poll([pad({ buttons: [0, 5] })], 'OPEN_WORLD');
    assert.equal(input.action('jump', 'press', true), true); assert.equal(input.action('jump', 'press', true), false);
    assert.equal(input.action('jumpHeld', 'hold', true), true); assert.equal(input.action('run', 'hold', true), true);
    input.poll([pad()], 'OPEN_WORLD'); assert.equal(input.action('jumpHeld', 'hold', true), false);
});
test('gamepad neutral gating prevents held inputs leaking through reconnects and menus', () => {
    const input = source(); input.reset(); assert.deepEqual(input.poll([pad({ buttons: [0] })], 'OPEN_WORLD').ui, []);
    assert.equal(input.action('jump', 'press', true), false); input.poll([pad()], 'OPEN_WORLD'); input.poll([pad({ buttons: [0] })], 'OPEN_WORLD');
    assert.equal(input.action('jump', 'press', true), true); input.poll([], 'OPEN_WORLD'); assert.equal(input.held.size, 0);
    input.poll([pad({ index: 1, buttons: [2] })], 'OPEN_WORLD'); assert.equal(input.action('dash', 'press', true), false);
});
test('runner shares jump and held duck while diagonal d-pad stays normalized', () => {
    const input = source(); input.poll([pad({ buttons: [1, 12, 15] })], 'DINO_RUN');
    assert.equal(input.action('jump', 'press', true), true); assert.equal(input.action('duck', 'hold', true), true); assert.equal(input.action('dodge', 'press', true), false);
    assert.ok(Math.abs(Math.hypot(input.stick.x, input.stick.z) - 1) < 1e-9);
});
test('action buffer bridges short recovery but expires during a long airborne delay', () => {
    const buffer = new CharacterActionBuffer(); buffer.push('dodge'); buffer.update(.1); assert.equal(buffer.take(false), null);
    assert.equal(buffer.take(true), 'dodge'); assert.equal(buffer.take(true), null); buffer.push('dash'); buffer.update(.17); assert.equal(buffer.take(true), null);
});
test('impulse poses follow physical duration independently of source clip length', () => {
    const samples = [], animator = { setPlaybackRate() {}, seek: p => samples.push(p), update() { throw Error('clip must not own physics'); } };
    for (const [state, timing] of Object.entries(IMPULSE_ACTIONS)) advanceCharacterAnimation(animator, { state, stateTime: timing.duration / 2, actionDuration: timing.duration });
    assert.deepEqual(samples, [.5, .5, .5]);
});
test('all ten characters and six variants resolve every enabled action to installed artwork', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) for (const variant of ['desktop', 'mobile', 'lite', 'runtime', 'detail', 'source']) {
        const suffix = variant === 'source' ? '' : `-${variant}`;
        let atlas;
        try { atlas = JSON.parse(readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v14${suffix}.json`, import.meta.url))); }
        catch (error) { if (variant === 'source') continue; throw error; }
        const animator = new FrameAnimator(atlas);
        for (const action of ['dash', 'dodge', 'slide', 'wave', 'celebrate']) {
            const resolved = animator.resolveName(action); assert.notEqual(resolved, 'idle', `${slug}:${variant}:${action}`);
            assert.ok(atlas.animations[resolved]?.frames.length > 1);
            if (!animator.has(action)) assert.ok(atlas.fallbacks[action], `${slug}:${action} requires an explicit fallback`);
        }
    }
});
test('canvas feedback is capped, expires, ignores NPCs and draws nothing with reduced motion', () => {
    const feedback = new CharacterFeedback({ limit: 20 }), entity = { isPlayerControlled: true, group: { position: { x: 2, z: 3 } }, actionDirection: { x: 1, z: 0 } };
    for (let i = 0; i < 20; i++) feedback.emit('dash', entity); assert.equal(feedback.items.length, 20);
    feedback.draw({ save() { throw Error('must not draw'); } }, {}, { reducedMotion: true });
    for (let i = 0; i < 20; i++) feedback.update(.05, entity); assert.equal(feedback.items.length, 0);
    feedback.emit('land', { ...entity, isPlayerControlled: false }); assert.equal(feedback.items.length, 0);
});
test('camera holds idle jitter, caps look-ahead and snaps immediately after teleport', () => {
    const rig = new CharacterFollowRig(); rig.reset({ x: 0, z: 0 }); assert.equal(rig.sample({ x: .01, z: .01 }, .016).x, 0);
    for (let i = 1; i <= 60; i++) rig.sample({ x: i / 10, z: 0 }, 1 / 60);
    assert.ok(rig.lead.x <= 1.1 && rig.lead.x > .5); assert.deepEqual(rig.sample({ x: 30, z: 20 }, .016), { x: 30, z: 20, immediate: true });
    rig.sample({ x: 31, z: 20 }, .016, { reducedMotion: true }); assert.equal(rig.lead.x, 0);
});
test('runtime polls gamepads while paused or showing menus', () => {
    let polls = 0;
    const runtime = new GameRuntime({ inputRouter: { poll() { polls++; } }, requestFrame: () => 1, cancelFrame: () => {}, visibilityTarget: null });
    runtime.running = true; runtime.paused = true; runtime.tick(0); runtime.tick(16); assert.equal(polls, 2); runtime.dispose();
});
