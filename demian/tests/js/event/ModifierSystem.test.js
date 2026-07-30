import test from 'node:test';
import assert from 'node:assert/strict';
import ModifierSystem from '../../../resources/js/game/games/event/modifiers/ModifierSystem.js';

 test('ModifierSystem composes event modifiers and resets cleanly', () => {
    const system = new ModifierSystem();
    const active = system.apply([
        { id: 'speed', type: 'speed', value: 1.2 },
        { id: 'score', type: 'double-score', value: 2 },
        { id: 'fog', type: 'fog', value: 0.04 },
        { id: 'gravity', type: 'low-gravity', value: 0.5 },
    ]);
    assert.equal(active.movementSpeedMultiplier, 1.2);
    assert.equal(active.scoreMultiplier, 2);
    assert.equal(active.gravityMultiplier, 0.5);
    assert.equal(active.fogDensity, 0.04);
    system.reset();
    assert.deepEqual(system.snapshot().modifiers, []);
    assert.equal(system.snapshot().scoreMultiplier, 1);
});
