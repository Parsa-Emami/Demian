import test from 'node:test';
import assert from 'node:assert/strict';
import TapToMoveController from '../../../resources/js/game/input/TapToMoveController.js';
import { VirtualJoystick } from '../../../src/Infrastructure/Phaser/Input/VirtualJoystick.js';

test('VirtualJoystick applies dead zone and clamps magnitude', () => {
    const joystick = new VirtualJoystick({ deadZone: 0.2 });
    assert.deepEqual(joystick.setVector(0.1, 0), { x: 0, y: 0, magnitude: 0 });
    const value = joystick.setVector(2, 0); assert.equal(value.x, 1); assert.equal(value.magnitude, 1);
});

test('TapToMoveController follows a bounded navigation path and arrives', () => {
    const controller = new TapToMoveController({ navigation: { findPath: () => [{ x: 1, z: 0 }, { x: 2, z: 0 }] }, stopDistance: .05 });
    assert.equal(controller.setDestination({ x: 0, z: 0 }, { x: 2, z: 0 }), true);
    const first = controller.update({ x: 0, z: 0 }, 1, 1); assert.deepEqual(first, { x: 1, z: 0, arrived: false, destination: { x: 2, z: 0 } });
    const second = controller.update({ x: 1, z: 0 }, 1, 1); assert.equal(second.x, 1);
    const done = controller.update({ x: 2, z: 0 }, 1, 0); assert.equal(done.arrived, true); assert.equal(controller.active, false);
});
