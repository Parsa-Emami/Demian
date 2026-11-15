import test from 'node:test';
import assert from 'node:assert/strict';
import InputRouter from '../../resources/js/game/input/InputRouter.js';
import MobileGameUI from '../../resources/js/ui/MobileGameUI.js';
import { readStick } from '../../resources/js/game/input/TouchStick.js';
import { normalizeTouchControls } from '../../resources/js/game/input/TouchControlPreferences.js';

function button(holdAction = null, pressAction = null) {
    const attrs = new Map(), pressed = new Set(), captured = new Set();
    return {
        dataset: { ...(holdAction ? { inputHold: holdAction } : {}),
            ...(pressAction ? { inputPress: pressAction } : {}) },
        disabled: false, hidden: false,
        classList: { add: v => pressed.add(v), remove: v => pressed.delete(v),
            contains: v => pressed.has(v) },
        setAttribute: (k,v) => attrs.set(k,v), getAttribute: k => attrs.get(k) ?? null,
        hasAttribute: k => attrs.has(k),
        setPointerCapture: id => captured.add(id),
        hasPointerCapture: id => captured.has(id),
        releasePointerCapture: id => captured.delete(id),
        closest: () => null,
    };
}
function pointer(targetButton, pointerId, type = 'pointerdown') {
    return { target: { closest: selector => selector.includes('data-input-')
        ? targetButton : null }, type, pointerId, pointerType: 'touch',
        button: 0, preventDefault() {}, stopPropagation() {} };
}
function router() {
    const input = Object.create(InputRouter.prototype);
    Object.assign(input, {
        contextName: 'RUN', contexts: new Map([['RUN', {
            actions: { jump: { keys: ['jump'], mode: 'press' },
                run: { keys: ['run'], mode: 'hold' } },
        }]]),
        bindings: { context: (_key, definition) => definition },
        gamepad: { action: () => false, stick: { magnitude: 0 } },
        held: new Set(), pressed: new Set(), virtualHeld: new Set(), virtualPressed: new Set(),
        pointerHolds: new Map(), pendingPointerPresses: new Map(),
        accessibilityPressed: new Set(), latchedHolds: new Map(), touchStick: null,
        touchControls: { touchRunMode: 'hold', touchSlideMode: 'hold',
            touchHaptics: false }, touchRoot: {
            dataset: { sessionState: 'playing', sidebarState: 'collapsed' },
        }, analog: { x: 0, z: 0, magnitude: 0 },
    });
    return input;
}

test('Step 19: cancelling a newer finger does not erase a completed tap by another finger', () => {
    const input = router(), jump = button(null, 'jump');
    input.onPointerDown(pointer(jump, 10));
    input.onPointerUp(pointer(jump, 10, 'pointerup'));
    input.onPointerDown(pointer(jump, 11));
    input.onPointerUp(pointer(jump, 11, 'pointercancel'));
    assert.equal(input.virtualPressed.has('jump'), true);
    assert.equal(input.snapshot().jump, true);
    assert.equal(input.snapshot().jump, false, 'one-shots must consume exactly once');
    assert.equal(input.pendingPointerPresses.size, 0);
});

test('Step 19: two cancelled fingers do not leave a ghost jump or stuck hold', () => {
    const input = router(), jump = button('run', 'jump');
    input.onPointerDown(pointer(jump, 1));
    input.onPointerDown(pointer(jump, 2));
    input.onPointerUp(pointer(jump, 1, 'pointercancel'));
    assert.equal(input.virtualPressed.has('jump'), true, 'remaining pointer still owns its press');
    assert.equal(input.virtualHeld.has('run'), true);
    input.onPointerUp(pointer(jump, 2, 'lostpointercapture'));
    assert.equal(input.virtualPressed.has('jump'), false);
    assert.equal(input.virtualHeld.has('run'), false);
    assert.equal(input.snapshot().jump, false);
    assert.equal(input.pointerHolds.size, 0);
});

test('Step 19: cancel after consumed press cannot delete a later independent press', () => {
    const input = router(), jump = button(null, 'jump');
    input.onPointerDown(pointer(jump, 1));
    assert.equal(input.snapshot().jump, true);
    input.onPointerDown(pointer(jump, 2));
    input.onPointerUp(pointer(jump, 1, 'pointercancel'));
    assert.equal(input.virtualPressed.has('jump'), true);
    input.onPointerUp(pointer(jump, 2, 'pointerup'));
    assert.equal(input.snapshot().jump, true);
    assert.equal(input.snapshot().jump, false);
});

test('Step 19: accessibility click survives unrelated pointer cancellation and consumes once', () => {
    const input = router(), jump = button(null, 'jump');
    input.onPointerDown(pointer(jump, 5));
    input.onClick({ detail: 0, target: { closest: () => jump } });
    input.onPointerUp(pointer(jump, 5, 'pointercancel'));
    assert.equal(input.snapshot().jump, true);
    assert.equal(input.snapshot().jump, false);
    assert.equal(input.accessibilityPressed.size, 0);
});

test('Step 19: one toggle command per simultaneous contact, cancellation restores prior state', () => {
    const input = router(), run = button('run');
    input.touchControls.touchRunMode = 'toggle';
    input.onPointerDown(pointer(run, 1));
    assert.equal(input.virtualHeld.has('run'), true);
    assert.equal(run.getAttribute('aria-pressed'), 'true');
    input.onPointerDown(pointer(run, 2));
    assert.equal(input.virtualHeld.has('run'), true, 'second finger cannot toggle off');
    input.onPointerUp(pointer(run, 2, 'pointerup'));
    input.onPointerUp(pointer(run, 1, 'pointercancel'));
    assert.equal(input.virtualHeld.has('run'), false);
    assert.equal(input.latchedHolds.size, 0);
    assert.equal(run.getAttribute('aria-pressed'), 'false');
    input.onPointerDown(pointer(run, 3));
    input.onPointerUp(pointer(run, 3, 'pointerup'));
    assert.equal(input.virtualHeld.has('run'), true);
    input.onPointerDown(pointer(run, 4));
    input.onPointerUp(pointer(run, 4, 'pointercancel'));
    assert.equal(input.virtualHeld.has('run'), true, 'cancelled off-tap restores the existing latch');
    input.clearTouch();
    assert.equal(input.virtualHeld.has('run'), false);
    assert.equal(run.getAttribute('aria-pressed'), 'false');
});

test('Step 19: cancelled touches cannot cross session/map/sidebar UI safety boundaries', () => {
    const input = router(), jump = button(null, 'jump');
    input.touchRoot.dataset.sessionState = 'paused';
    jump.closest = () => ({});
    input.onPointerDown(pointer(jump, 1));
    assert.equal(input.virtualPressed.size, 0);
    input.touchRoot.dataset.sessionState = 'playing';
    input.touchRoot.dataset.touchMapOpen = 'true';
    input.onPointerDown(pointer(jump, 2));
    assert.equal(input.virtualPressed.size, 0);
    delete input.touchRoot.dataset.touchMapOpen;
    input.touchRoot.dataset.sidebarState = 'expanded';
    input.onPointerDown(pointer(jump, 3));
    assert.equal(input.virtualPressed.size, 0);
});

test('Step 19: joystick dead-zone and sensitivity produce stable finite movement values', () => {
    for (const deadZone of [0, .1, .2, .3]) {
        for (const sensitivity of [.6, 1, 1.6]) {
            const center = readStick(0, 0, 80, deadZone, sensitivity);
            assert.equal(center.magnitude, 0);
            for (const vector of [[10, 0], [0, -20], [50, -50], [-300, 20]]) {
                const actual = readStick(...vector, 80, deadZone, sensitivity);
                assert.ok(Number.isFinite(actual.x) && Number.isFinite(actual.z));
                assert.ok(actual.magnitude >= 0 && actual.magnitude <= 1 + 1e-9);
            }
        }
    }
    const invalid = normalizeTouchControls({ touchDeadZone: 100, touchSensitivity: -5 });
    assert.equal(invalid.touchDeadZone, 30);
    assert.equal(invalid.touchSensitivity, 60);
});

function fakeMobileUI() {
    const state = { toggle: new Map(), tray: new Map(), label: '' };
    const root = { dataset: { sessionState: 'playing', sidebarState: 'collapsed' } };
    const ui = Object.create(MobileGameUI.prototype);
    Object.assign(ui, {
        root, actionsToggle: { setAttribute: (k,v) => state.toggle.set(k,v),
            querySelector: () => ({ set textContent(value) { state.label = value; } }) },
        actionsTray: { setAttribute: (k,v) => state.tray.set(k,v) },
        actionPointers: new Set(), actionCloseTimer: null, disposed: false,
        isExpanded: true, isMobileDevice: true,
    });
    ui.applyExpandedState();
    return { ui, root, state };
}
const trayEvent = (type, pointerId, detail = 1) => ({
    type, pointerId, detail, target: { closest: () => ({}) },
});

test('Step 19: action tray stays open while ANY finger holds an action; closes only after final release', async () => {
    const { ui, root, state } = fakeMobileUI();
    ui.onActionPress(trayEvent('pointerdown', 1));
    ui.onActionPress(trayEvent('pointerdown', 2));
    await new Promise(resolve => setTimeout(resolve, 165)); // previous 140ms collapse regression
    assert.equal(root.dataset.mobileActions, 'expanded');
    ui.onWindowActionEnd({ type: 'pointerup', pointerId: 1 });
    await new Promise(resolve => setTimeout(resolve, 8));
    assert.equal(root.dataset.mobileActions, 'expanded');
    ui.onWindowActionEnd({ type: 'pointerup', pointerId: 2 });
    await new Promise(resolve => setTimeout(resolve, 8));
    assert.equal(root.dataset.mobileActions, 'collapsed');
    assert.equal(state.tray.get('aria-hidden'), 'true');
    assert.equal(state.toggle.get('aria-expanded'), 'false');
});

test('Step 19: action tray cancels pending close if another gesture starts or OS cancels', async () => {
    const { ui, root } = fakeMobileUI();
    ui.onActionPress(trayEvent('pointerdown', 8));
    ui.onWindowActionEnd({ type: 'pointercancel', pointerId: 8 });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(root.dataset.mobileActions, 'expanded');
    ui.onActionPress(trayEvent('pointerdown', 9));
    ui.onWindowActionEnd({ type: 'pointerup', pointerId: 9 });
    ui.onActionPress(trayEvent('pointerdown', 10));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(root.dataset.mobileActions, 'expanded', 'new action cancels queued close');
    ui.onWindowActionEnd({ type: 'pointerup', pointerId: 10 });
    await new Promise(resolve => setTimeout(resolve, 8));
    assert.equal(root.dataset.mobileActions, 'collapsed');
});

test('Step 19: keyboard activation closes tray; context menu is allowed in menus and blocked on gameplay canvas only', async () => {
    const { ui, root } = fakeMobileUI();
    ui.onActionPress(trayEvent('click', undefined, 0));
    await new Promise(resolve => setTimeout(resolve, 8));
    assert.equal(root.dataset.mobileActions, 'collapsed');
    let blocked = 0;
    const mk = match => ({
        target: { closest: () => match ? ({}) : null }, preventDefault() { blocked++; },
    });
    ui.onStageContextMenu(mk(true));
    assert.equal(blocked, 1);
    root.dataset.sessionState = 'menu';
    ui.onStageContextMenu(mk(true));
    ui.onStageContextMenu(mk(false));
    assert.equal(blocked, 1);
});
