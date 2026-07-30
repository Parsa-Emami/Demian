import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveMobileViewportMode,
    shouldForceLandscape,
} from '../../resources/js/ui/MobileGameUI.js';

test('mobile viewport mode prioritizes the character sheet over gameplay', () => {
    assert.equal(resolveMobileViewportMode({ sessionState: 'playing', sidebarState: 'expanded' }), 'character-sheet');
    assert.equal(resolveMobileViewportMode({ sessionState: 'paused', sidebarState: 'collapsed' }), 'gameplay');
    assert.equal(resolveMobileViewportMode({ sessionState: 'menu', sidebarState: 'collapsed' }), 'shell');
});

test('forced landscape is limited to active gameplay and never blocks character scrolling', () => {
    assert.equal(shouldForceLandscape({ isMobileDevice: true, physicalPortrait: true, preference: 'landscape', mode: 'gameplay' }), true);
    assert.equal(shouldForceLandscape({ isMobileDevice: true, physicalPortrait: true, preference: 'landscape', mode: 'character-sheet' }), false);
    assert.equal(shouldForceLandscape({ isMobileDevice: true, physicalPortrait: true, preference: 'landscape', mode: 'shell' }), false);
    assert.equal(shouldForceLandscape({ isMobileDevice: false, physicalPortrait: true, preference: 'landscape', mode: 'gameplay' }), false);
});
