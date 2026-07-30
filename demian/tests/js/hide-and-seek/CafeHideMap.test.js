import test from 'node:test';
import assert from 'node:assert/strict';
import { CAFE_HIDE_MAP, validateCafeHideMap } from '../../../resources/js/game/games/hide-and-seek/maps/CafeHideMap.js';

test('Cafe hide map is deterministic and has enough gameplay spaces', () => {
    assert.equal(validateCafeHideMap(CAFE_HIDE_MAP), true);
    assert.ok(CAFE_HIDE_MAP.hideSpots.length >= 8);
    assert.ok(CAFE_HIDE_MAP.staticColliders.length >= 10);
    assert.ok(CAFE_HIDE_MAP.patrolPoints.length >= 6);
});
