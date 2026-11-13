import test from 'node:test';
import assert from 'node:assert/strict';
import InputRouter from '../../../resources/js/game/input/InputRouter.js';
import TouchStick, { readStick } from '../../../resources/js/game/input/TouchStick.js';
import MobileGameUI from '../../../resources/js/ui/MobileGameUI.js';

function fakeButton() {
    const classes = new Set();
    const captures = new Set();
    const attrs = new Map();
    return {
        dataset: {}, disabled: false, hidden: false,
        classList: { add: value => classes.add(value), remove: value => classes.delete(value),
            contains: value => classes.has(value) },
        setPointerCapture: id => captures.add(id),
        hasPointerCapture: id => captures.has(id),
        releasePointerCapture: id => captures.delete(id),
        getAttribute: name => attrs.get(name) ?? null,
        setAttribute: (name, value) => attrs.set(name, value),
        hasAttribute: name => attrs.has(name),
        closest: () => null,
    };
}
function routerStub() {
    const router = Object.create(InputRouter.prototype);
    Object.assign(router, {
        touchControls: { touchRunMode: 'hold', touchSlideMode: 'hold',
            touchHaptics: false, touchAutoSprint: false },
        touchRoot: { dataset: { sessionState: 'playing', sidebarState: 'collapsed' } },
        pointerHolds: new Map(), latchedHolds: new Map(),
        virtualHeld: new Set(), virtualPressed: new Set(),
        analog: { x: 0, z: 0, magnitude: 0 },
    });
    return router;
}
function pointerEvent(button, id, type = 'pointerdown') {
    return { pointerId: id, button: 0, pointerType: 'touch', target: {
        closest: selector => selector.includes('data-input-') ? button : null,
    }, type, preventDefault() {}, stopPropagation() {} };
}

test('two-finger hold and press remain independent; release never clears the other finger', () => {
    const router = routerStub();
    const run = fakeButton(), jump = fakeButton();
    run.dataset.inputHold = 'run';
    jump.dataset.inputPress = 'jump';
    router.onPointerDown(pointerEvent(run, 10));
    router.onPointerDown(pointerEvent(jump, 11));
    assert.equal(router.pointerHolds.size, 2);
    assert.equal(router.virtualHeld.has('run'), true);
    assert.equal(router.virtualPressed.has('jump'), true);
    router.onPointerUp(pointerEvent(jump, 11, 'pointerup'));
    assert.equal(router.virtualHeld.has('run'), true);
    assert.equal(router.virtualPressed.has('jump'), true, 'tap survives normal finger release until consumed by game');
    router.onPointerUp(pointerEvent(run, 10, 'pointerup'));
    assert.equal(router.virtualHeld.size, 0);
});

test('cancel and lost capture remove unconsumed press actions, but do not cancel another held pointer', () => {
    const router = routerStub(), jump = fakeButton(), run = fakeButton();
    jump.dataset.inputPress = 'jump'; run.dataset.inputHold = 'run';
    router.onPointerDown(pointerEvent(jump, 12));
    router.onPointerDown(pointerEvent(run, 13));
    router.onPointerUp(pointerEvent(jump, 12, 'pointercancel'));
    assert.equal(router.virtualPressed.has('jump'), false);
    assert.equal(router.virtualHeld.has('run'), true);
    router.onPointerUp(pointerEvent(run, 13, 'lostpointercapture'));
    assert.equal(router.virtualHeld.has('run'), false);
    assert.equal(router.pointerHolds.size, 0);
});

test('two fingers holding the same action retain the hold until the final pointer leaves', () => {
    const router = routerStub(), run = fakeButton(); run.dataset.inputHold = 'run';
    router.onPointerDown(pointerEvent(run, 1));
    router.onPointerDown(pointerEvent(run, 2));
    router.onPointerUp(pointerEvent(run, 1, 'pointerup'));
    assert.equal(router.virtualHeld.has('run'), true);
    router.onPointerUp(pointerEvent(run, 2, 'pointerup'));
    assert.equal(router.virtualHeld.has('run'), false);
});

test('clearTouch resets latched holds, joystick and captured pointers even if a detached button throws', () => {
    const router = routerStub(), run = fakeButton();
    run.dataset.inputHold = 'run';
    router.onPointerDown(pointerEvent(run, 1));
    run.releasePointerCapture = () => { throw new Error('detached'); };
    router.analog.magnitude = 0.7;
    router.touchStick = { reset() { Object.assign(router.analog, { x: 0, z: 0, magnitude: 0 }); } };
    assert.doesNotThrow(() => router.clearTouch());
    assert.equal(router.pointerHolds.size, 0);
    assert.equal(router.virtualHeld.size, 0);
    assert.equal(router.analog.magnitude, 0);
});

test('invalid geometry never returns NaN joystick movement during rapid rotation', () => {
    for (const values of [
        [0, 0, 0, .1, 1], [1, 1, Infinity, .1, 1],
        [1, 1, 60, .1, 0], [1, 1, 60, 1, 1], [NaN, 1, 60, .1, 1],
    ]) {
        assert.deepEqual(readStick(...values), { x: 0, z: 0, magnitude: 0, offsetX: 0, offsetY: 0 });
    }
});

test('joystick owns one pointer; second finger can press an independent action', () => {
    const router = routerStub();
    router.contexts = new Map([['OPEN_WORLD', { analog: { xAxis: 'x', zAxis: 'z' } }]]);
    router.contextName = 'OPEN_WORLD';
    router.touchControls.touchStickMode = 'fixed';
    router.touchControls.touchDeadZone = 10;
    router.touchControls.touchSensitivity = 100;
    const styles = new Map(), classes = new Set(), captures = new Set();
    const base = {
        contains: () => true, getBoundingClientRect: () => ({ left: 20, top: 20, width: 100, height: 100 }),
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        style: { setProperty: (key,val) => styles.set(key,val), removeProperty: key => styles.delete(key) },
    };
    const zone = { setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id),
        releasePointerCapture: id => captures.delete(id) };
    const stick = Object.create(TouchStick.prototype);
    Object.assign(stick, { router, zone, base,
        knob: { style: base.style }, value: router.analog, gesture: null });
    router.touchStick = stick;
    const mkEvent = (id,x,y) => ({ pointerId:id, button:0, target:base, clientX:x, clientY:y,
        preventDefault() {}, stopPropagation() {} });
    stick.press(mkEvent(1, 70, 70));
    stick.move(mkEvent(1, 100, 70));
    assert.ok(router.analog.magnitude > 0);
    stick.press(mkEvent(2, 70, 70));
    assert.equal(stick.gesture.id, 1);
    const jump = fakeButton(); jump.dataset.inputPress = 'jump';
    router.onPointerDown(pointerEvent(jump, 2));
    assert.equal(router.virtualPressed.has('jump'), true);
    stick.release(mkEvent(2, 70, 70));
    assert.ok(router.analog.magnitude > 0);
    stick.release(mkEvent(1, 100, 70));
    assert.equal(router.analog.magnitude, 0);
    assert.equal(captures.size, 0);
});

test('visual-viewport keyboard shrink does not falsely rotate the physical phone; unchanged layout is deduplicated', () => {
    const previous = { window: globalThis.window, document: globalThis.document,
        CustomEvent: globalThis.CustomEvent };
    let viewport = { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 };
    const changes = [], vars = {};
    const classes = { toggle() {}, remove() {} };
    globalThis.window = {
        innerWidth: 390, innerHeight: 844, visualViewport: viewport,
        matchMedia: () => ({ matches: true }), // physical device remains portrait
    };
    globalThis.document = {
        documentElement: { style: { setProperty: (k,v) => { vars[k] = v; } }, classList: classes },
        body: { classList: classes },
    };
    globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
    try {
        const root = { dataset: { sessionState: 'playing', sidebarState: 'collapsed',
            gameOrientation: 'landscape' }, dispatchEvent: e => changes.push(e) };
        const ui = Object.create(MobileGameUI.prototype);
        Object.assign(ui, { root, isMobileDevice: true, orientationHint: null, lastLayoutSignature: null });
        ui.onViewportChange();
        assert.equal(root.dataset.forcedLandscape, 'true');
        assert.equal(changes.length, 1);
        ui.onViewportChange();
        assert.equal(changes.length, 1, 'same geometry must not reset a held stick');
        viewport.height = 350; // virtual keyboard shrinks the visual viewport only
        ui.onViewportChange();
        assert.equal(root.dataset.physicalOrientation, 'portrait');
        assert.equal(root.dataset.forcedLandscape, 'true');
        assert.equal(changes.length, 2);
        assert.equal(vars['--demian-logical-height'], '390px');
    } finally {
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
        }
    }
});
