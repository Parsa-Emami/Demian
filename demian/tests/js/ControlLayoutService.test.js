import test from 'node:test';
import assert from 'node:assert/strict';
import ControlLayoutService from '../../resources/js/game/controls/ControlLayoutService.js';

function rootStub() {
    return { dataset: {} };
}

test('ControlLayoutService maps input contexts to isolated mobile layouts', () => {
    const root = rootStub();
    const service = new ControlLayoutService({ root, eventTarget: null });

    const world = service.apply('OPEN_WORLD');
    assert.equal(world.id, 'world');
    assert.equal(root.dataset.controlLayout, 'world');
    assert.equal(root.dataset.inputContext, 'OPEN_WORLD');

    const menu = service.apply('UNKNOWN_CONTEXT');
    assert.equal(menu.id, 'none');
    assert.equal(root.dataset.controlLayout, 'none');
    assert.equal(root.dataset.inputContext, 'UNKNOWN_CONTEXT');
});

test('ControlLayoutService accepts future game control surfaces without core changes', () => {
    const root = rootStub();
    const service = new ControlLayoutService({ root, eventTarget: null });

    service.register('RACING', { id: 'racing', joystick: true, throttle: true });
    const layout = service.apply('RACING');

    assert.deepEqual(layout, { id: 'racing', joystick: true, throttle: true });
    assert.equal(Object.isFrozen(layout), true);
    assert.equal(root.dataset.controlLayout, 'racing');
});
