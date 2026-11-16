import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRailIndex, nearestRailIndex, centeredRailScrollLeft } from '../../resources/js/ui/ScrollSnapRail.js';

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

test('ScrollSnapRail centers items with negative scrollLeft on RTL Firefox/WebKit', () => {
    assert.equal(centeredRailScrollLeft(0,
        { left: 100, width: 300 }, { left: 350, width: 100 }), 150);
    // Right-to-left rail needs to travel further negative; clamping to zero
    // causes all but the first card to remain unreachable on Firefox.
    assert.equal(centeredRailScrollLeft(-100,
        { left: 100, width: 300 }, { left: 0, width: 100 }), -300);
    assert.equal(centeredRailScrollLeft(-250,
        { left: 0, width: 300 }, { left: 100, width: 100 }), -250);
});
