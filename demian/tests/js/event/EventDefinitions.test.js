import test from 'node:test';
import assert from 'node:assert/strict';
import cafeRush from '../../../resources/js/game/games/event/definitions/cafe-rush.json' with { type: 'json' };
import neonCollector from '../../../resources/js/game/games/event/definitions/neon-collector.json' with { type: 'json' };
import survivalNight from '../../../resources/js/game/games/event/definitions/survival-night.json' with { type: 'json' };
import { validateEventDefinition } from '../../../resources/js/game/games/event/core/EventDefinitionValidator.js';

for (const definition of [cafeRush, neonCollector, survivalNight]) {
    test(`${definition.id} is a valid phase-six event definition`, () => {
        assert.deepEqual(validateEventDefinition(definition), []);
        assert.equal(definition.schemaVersion, 1);
        assert.ok(definition.objectives.length > 0);
    });
}

test('validator rejects duplicate world ids and broken reach references', () => {
    const invalid = structuredClone(cafeRush);
    invalid.world.zones[0].id = invalid.world.collectibles[0].id;
    invalid.objectives[1].zone = 'missing-zone';
    const errors = validateEventDefinition(invalid);
    assert.ok(errors.some((error) => error.includes('duplicated')));
    assert.ok(errors.some((error) => error.includes('unknown zone')));
});

test('validator rejects objective dependency cycles', () => {
    const invalid = structuredClone(cafeRush);
    invalid.objectives[0].requires = [invalid.objectives[1].id];
    invalid.objectives[1].requires = [invalid.objectives[0].id];
    const errors = validateEventDefinition(invalid);
    assert.ok(errors.some((error) => error.includes('dependency graph contains a cycle')));
});

