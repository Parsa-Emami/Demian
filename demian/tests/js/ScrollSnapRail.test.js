import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRailIndex, nearestRailIndex } from '../../resources/js/ui/ScrollSnapRail.js';

test('ScrollSnapRail clamps navigation indices for empty and populated rails', () => {
    assert.equal(clampRailIndex(0, 0), -1);
    assert.equal(clampRailIndex(-4, 5), 0);
    assert.equal(clampRailIndex(2.9, 5), 2);
    assert.equal(clampRailIndex(99, 5), 4);
});

test('ScrollSnapRail resolves the card nearest the viewport center', () => {
    assert.equal(nearestRailIndex([], 100), -1);
    assert.equal(nearestRailIndex([40, 140, 240], 150), 1);
    assert.equal(nearestRailIndex([40, 140, 240], 230), 2);
});
