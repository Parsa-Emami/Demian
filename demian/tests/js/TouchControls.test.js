import assert from 'node:assert/strict';
import test from 'node:test';
import InputRouter from '../../resources/js/game/input/InputRouter.js';
import SettingsStore from '../../resources/js/game/settings/SettingsStore.js';
import { readStick } from '../../resources/js/game/input/TouchStick.js';

test('legacy settings gain touch defaults and persist validated preferences', () => {
    let saved = JSON.stringify({ quality: 'high' });
    const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
    const settings = new SettingsStore({ storage });
    assert.equal(settings.snapshot().touchStickMode, 'fixed');
    settings.update({ touchStickMode: 'floating', touchHand: 'left', touchOpacity: 20,
        touchDeadZone: 52, touchSensitivity: 125.4, touchRunMode: 'invalid', touchHaptics: false });
    const restored = new SettingsStore({ storage }).snapshot();
    assert.equal(restored.quality, 'high');
    assert.equal(restored.touchStickMode, 'floating');
    assert.equal(restored.touchHand, 'left');
    assert.equal(restored.touchOpacity, 55);
    assert.equal(restored.touchDeadZone, 30);
    assert.equal(restored.touchSensitivity, 125);
    assert.equal(restored.touchRunMode, 'hold');
    assert.equal(restored.touchHaptics, false);
});

test('radial stick suppresses drift, preserves diagonal direction and reaches full speed', () => {
    assert.equal(readStick(3, 4, 50, .1, 1).magnitude, 0);
    const diagonal = readStick(120, -120, 50, .1, .6);
    assert.equal(diagonal.magnitude, 1);
    assert.equal(diagonal.x, -diagonal.z);
    assert.ok(Math.abs(Math.hypot(diagonal.offsetX, diagonal.offsetY) - 50) < 1e-9);
    assert.ok(readStick(20, 0, 50, .1, 1.6).magnitude > readStick(20, 0, 50, .1, .6).magnitude);
});

test('toggle stays active after pointer release and resets with the touch context', () => {
    const router = Object.create(InputRouter.prototype);
    Object.assign(router, {
        pointerHolds: new Map(), latchedHolds: new Map(), virtualHeld: new Set(), virtualPressed: new Set(['jump']),
    });
    const classes = new Set();
    const attributes = new Map();
    const button = {
        classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
        setAttribute: (key, value) => attributes.set(key, value),
        hasAttribute: key => attributes.has(key),
    };
    router.toggleHold('duck', button);
    router.pointerHolds.set(1, { button });
    router.onPointerUp({ pointerId: 1 });
    assert.equal(router.virtualHeld.has('duck'), true);
    assert.equal(classes.has('is-pressed'), true);
    router.toggleHold('duck', button);
    assert.equal(router.virtualHeld.has('duck'), false);
    router.toggleHold('duck', button);
    router.clearTouch();
    assert.equal(router.virtualHeld.size, 0);
    assert.equal(router.virtualPressed.size, 0);
    assert.equal(attributes.get('aria-pressed'), 'false');
});
