import test from 'node:test';
import assert from 'node:assert/strict';
import VisibilitySystem from '../../../resources/js/game/games/hide-and-seek/systems/VisibilitySystem.js';

const system = new VisibilitySystem({ range: 10, fieldOfViewDegrees: 90, revealThreshold: 0.25, hiddenRevealThreshold: 0.8 });
const observer = { position: { x: 0, z: 0 }, forward: { x: 0, z: 1 } };

test('VisibilitySystem rejects distance, FOV and occlusion before scoring', () => {
    assert.equal(system.evaluate(observer, { position: { x: 0, z: 11 } }).reason, 'range');
    assert.equal(system.evaluate(observer, { position: { x: 8, z: 0 } }).reason, 'fov');
    assert.equal(system.evaluate(observer, { position: { x: 0, z: 3 } }, { raycast: () => ({ fraction: 0.5 }) }).reason, 'occluded');
});

test('VisibilitySystem accounts for movement, light and concealment', () => {
    const target = { position: { x: 0, z: 3 } };
    const exposed = system.evaluate(observer, target, { movementSpeed: 6, lightLevel: 1, concealment: 0 });
    const hidden = system.evaluate(observer, target, { movementSpeed: 0, lightLevel: 0.4, concealment: 0.95 });
    assert.equal(exposed.visible, true);
    assert.equal(hidden.visible, false);
    assert.ok(exposed.score > hidden.score);
});
