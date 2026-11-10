import { INPUT_CONTEXTS } from './InputContexts.js';
import InputBindingStore, { keyboardToken } from './InputBindingStore.js';
import GamepadSource from './GamepadSource.js';
import TouchStick from './TouchStick.js';
import { applyTouchControlLayout, DEFAULT_TOUCH_CONTROLS, normalizeTouchControls } from './TouchControlPreferences.js';

const ACTION_HAPTICS = new Set([
    'jump',
    'dash',
    'slide',
    'dodge',
    'win',
    'celebrate',
    'ability',
    'guitar',
    'hardDrop',
    'interact',
    'revealPulse',
    'eventAction',
    'toggleInventory',
    'toggleQuests',
]);

function isTypingTarget(target) {
    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
    );
}

/**
 * Context-aware keyboard, pointer and virtual-stick input source.
 *
 * Context definitions translate physical controls into semantic game actions,
 * allowing the same key to mean different things in different games.
 */
export default class InputRouter {
    constructor({ root = document, touchRoot = root.querySelector('[data-manager-shell]'), contexts = INPUT_CONTEXTS, initialContext = 'MENU' } = {}) {
        this.root = root;
        this.touchRoot = touchRoot;
        this.contexts = new Map(Object.entries(contexts));
        this.contextName = null;
        this.bindings = new InputBindingStore();
        this.gamepad = new GamepadSource();
        this.keyboardCodes = new Map();
        this.held = new Set();
        this.pressed = new Set();
        this.virtualHeld = new Set();
        this.virtualPressed = new Set();
        this.pointerHolds = new Map();
        this.latchedHolds = new Map();
        const stickZone = touchRoot?.querySelector('[data-touch-stick-zone]');
        this.touchStick = stickZone ? new TouchStick(stickZone, this) : null;
        this.analog = this.touchStick?.value ?? { x: 0, z: 0, magnitude: 0 };
        this.device = window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard';
        document.documentElement.dataset.inputDevice = this.device;
        this.applyTouchControls(DEFAULT_TOUCH_CONTROLS);

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onClick = this.onClick.bind(this);
        this.clearTouch = this.clearTouch.bind(this);
        this.onPointerDevice = (event) => this.setDevice(event.pointerType === 'touch' ? 'touch' : 'keyboard');
        this.orientation = window.matchMedia?.('(orientation: portrait)');
        this.orientation?.addEventListener?.('change', this.clearTouch);
        this.touchRoot?.addEventListener('sidebar:changed', this.clearTouch);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibilityChange = () => {
            if (document.hidden) {
                this.onBlur();
            }
        });
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('pointerdown', this.onPointerDevice, true);
        this.root.addEventListener('pointerdown', this.onPointerDown);
        this.root.addEventListener('pointerup', this.onPointerUp);
        this.root.addEventListener('pointercancel', this.onPointerUp);
        this.root.addEventListener('lostpointercapture', this.onPointerUp, true);

        this.setContext(initialContext);
    }

    registerContext(name, definition) {
        if (!name || !definition) {
            throw new TypeError('Input context requires a name and definition.');
        }

        this.contexts.set(name, definition);
        return this;
    }

    setContext(name) {
        if (!this.contexts.has(name)) {
            throw new Error(`Input context "${name}" is not registered.`);
        }

        if (this.contextName === name) {
            return;
        }

        this.contextName = name;
        this.onBlur();
        this.root.dispatchEvent?.(new CustomEvent('input:context-changed', {
            detail: { context: name },
        }));
    }

    get context() {
        return this.bindings.context(this.contextName, this.contexts.get(this.contextName));
    }

    onKeyDown(event) {
        if (event.defaultPrevented || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        const key = keyboardToken(event);
        if (event.repeat && !this.held.has(key)) return;
        this.setDevice('keyboard');

        const nativeActivation = ['space', 'enter'].includes(key) && event.target.closest?.('button, summary, a');
        if (nativeActivation) return;
        if (this.controlKeys().has(key)) {
            event.preventDefault();
        }

        if (!this.held.has(key)) {
            this.pressed.add(key);
        }

        this.held.add(key);
        this.keyboardCodes.set(event.code || event.key, key);
    }

    onKeyUp(event) {
        const key = keyboardToken(event);
        this.keyboardCodes.delete(event.code || event.key);
        if (![...this.keyboardCodes.values()].includes(key)) this.held.delete(key);
    }

    controlKeys() {
        const keys = new Set();
        const context = this.context ?? {};

        Object.values(context.axes ?? {}).forEach((definition) => {
            definition.negative.forEach((key) => keys.add(key));
            definition.positive.forEach((key) => keys.add(key));
        });

        Object.values(context.actions ?? {}).forEach((definition) => {
            definition.keys.forEach((key) => keys.add(key));
        });

        return keys;
    }

    applyTouchControls(settings) {
        const controls = normalizeTouchControls(settings);
        if (Object.keys(controls).every(key => controls[key] === this.touchControls?.[key])) return;
        this.clearTouch();
        this.touchControls = controls;
        applyTouchControlLayout(this.touchRoot, controls);
        if (this.touchRoot) this.touchRoot.dataset.touchHaptics = String(controls.touchHaptics);
        this.updateTouchVisibility();
    }

    updateTouchVisibility() {
        if (!this.touchRoot) return;
        const mode = this.touchControls.touchVisibility;
        const visible = mode === 'always' || (mode === 'auto' && this.device === 'touch');
        if (!visible && this.touchRoot.dataset.touchUi === 'on') this.clearTouch();
        this.touchRoot.dataset.touchUi = visible ? 'on' : 'off';
    }

    touchBlocked() {
        const state = this.touchRoot?.dataset;
        return state && (state.sessionState !== 'playing' || state.sidebarState === 'expanded' ||
            state.touchMapOpen === 'true' || state.shiftDialog || state.crittersDialog);
    }

    onPointerDown(event) {
        const button = event.target.closest?.('[data-input-hold], [data-input-press]');
        if (!button || event.button !== 0 || this.pointerHolds.has(event.pointerId) ||
            button.disabled || button.hidden || button.getAttribute('aria-disabled') === 'true') return;
        if (button.closest('[data-control-surface]') && this.touchBlocked()) return;

        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture?.(event.pointerId);
        const holdAction = button.dataset.inputHold;
        const pressAction = button.dataset.inputPress;
        const toggle = (holdAction === 'run' && this.touchControls.touchRunMode === 'toggle') ||
            (holdAction === 'duck' && this.touchControls.touchSlideMode === 'toggle');
        const action = toggle ? undefined : holdAction;
        this.pointerHolds.set(event.pointerId, { action, button });
        if (toggle) this.toggleHold(holdAction, button);
        else {
            if (action) this.virtualHeld.add(action);
            button.classList.add('is-pressed');
        }

        if (pressAction) this.virtualPressed.add(pressAction);
        if (event.pointerType === 'touch' && this.touchControls.touchHaptics &&
            (ACTION_HAPTICS.has(pressAction) || holdAction === 'duck')) {
            navigator.vibrate?.(pressAction === 'dash' ? 18 : 10);
        }
    }

    onPointerUp(event) {
        const binding = this.pointerHolds.get(event.pointerId);
        if (!binding) return;
        this.pointerHolds.delete(event.pointerId);
        const { action, button } = binding;
        if (action && !this.latchedHolds.has(action) &&
            ![...this.pointerHolds.values()].some(entry => entry.action === action)) {
            this.virtualHeld.delete(action);
        }
        if (![...this.latchedHolds.values()].includes(button) &&
            ![...this.pointerHolds.values()].some(entry => entry.button === button)) {
            button.classList.remove('is-pressed');
        }
    }

    toggleHold(action, button) {
        const previous = this.latchedHolds.get(action);
        if (previous) {
            this.latchedHolds.delete(action);
            if (![...this.pointerHolds.values()].some(entry => entry.action === action)) this.virtualHeld.delete(action);
            previous.classList.remove('is-pressed');
            previous.setAttribute('aria-pressed', 'false');
            return;
        }
        this.latchedHolds.set(action, button);
        this.virtualHeld.add(action);
        button.classList.add('is-pressed');
        button.setAttribute('aria-pressed', 'true');
    }

    clearTouch() {
        const captures = [...this.pointerHolds.entries()];
        this.pointerHolds.clear();
        const buttons = new Set(this.latchedHolds.values());
        for (const [id, { button }] of captures) {
            buttons.add(button);
            if (button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
        }
        for (const button of buttons) {
            button.classList.remove('is-pressed');
            if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', 'false');
        }
        this.latchedHolds.clear();
        this.virtualHeld.clear();
        this.virtualPressed.clear();
        this.touchStick?.reset();
    }

    isHeld(keys) {
        return keys.some((key) => this.held.has(key) || this.virtualHeld.has(key));
    }

    consumePressed(keys, consume) {
        const matched = keys.find((key) => this.pressed.has(key) || this.virtualPressed.has(key));

        if (!matched) {
            return false;
        }

        if (consume) {
            keys.forEach((key) => {
                this.pressed.delete(key);
                this.virtualPressed.delete(key);
            });
        }

        return true;
    }

    axisSnapshot(definition) {
        return (
            Number(this.isHeld(definition.positive)) -
            Number(this.isHeld(definition.negative))
        );
    }

    snapshot({ consumePresses = true } = {}) {
        const context = this.context ?? {};
        const snapshot = {};

        Object.entries(context.axes ?? {}).forEach(([name, definition]) => {
            snapshot[name] = this.axisSnapshot(definition);
        });

        Object.entries(context.actions ?? {}).forEach(([name, definition]) => {
            const keyboard = definition.mode === 'hold'
                ? this.isHeld(definition.keys)
                : this.consumePressed(definition.keys, consumePresses);
            snapshot[name] = this.gamepad.action(name, definition.mode, consumePresses) || keyboard;
        });

        const usingTouchStick = this.analog.magnitude > .01;
        const analog = usingTouchStick ? this.analog : this.gamepad.stick;
        if (context.analog && analog.magnitude > 0.01) {
            snapshot[context.analog.xAxis] = analog.x;
            snapshot[context.analog.zAxis] = analog.z;

            if (
                usingTouchStick && this.touchControls.touchAutoSprint &&
                this.touchControls.touchRunMode === 'hold' &&
                context.analog.autoSprintAction &&
                analog.magnitude > context.analog.autoSprintThreshold
            ) {
                snapshot[context.analog.autoSprintAction] = true;
            }
        }

        return snapshot;
    }

    setDevice(device) {
        if (this.device === device) return;
        this.device = device;
        document.documentElement.dataset.inputDevice = device;
        this.updateTouchVisibility();
        this.root.dispatchEvent(new CustomEvent('input:device-changed', { detail: { device } }));
    }

    poll() {
        if (document.hidden || !document.hasFocus()) { this.gamepad.reset(); return; }
        let pads;
        try { pads = navigator.getGamepads?.() ?? []; } catch { this.gamepad.reset(); return; }
        const result = this.gamepad.poll(pads, this.contextName, performance.now());
        if (result.active) this.setDevice('gamepad');
        for (const action of result.ui) {
            const event = new CustomEvent('input:gamepad-ui', { detail: { action }, cancelable: true });
            this.root.dispatchEvent(event);
            if (event.defaultPrevented) {
                this.gamepad.pressed.clear();
                if (['confirm', 'cancel', 'pause'].includes(action)) { this.gamepad.reset(); break; }
            }
        }
    }

    onClick(event) {
        if (event.detail !== 0) return;
        const button = event.target.closest?.('[data-input-press], [data-input-hold]');
        if (!button || button.disabled || button.hidden || button.getAttribute('aria-disabled') === 'true') return;
        if (button.closest('[data-control-surface]') && this.touchBlocked()) return;
        if (button.dataset.inputPress) this.virtualPressed.add(button.dataset.inputPress);
        if (button.dataset.inputHold && !button.dataset.inputPress) this.toggleHold(button.dataset.inputHold, button);
    }

    onBlur() {
        this.keyboardCodes.clear();
        this.gamepad.reset();
        this.held.clear();
        this.pressed.clear();
        this.clearTouch();
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.root.removeEventListener('click', this.onClick);
        this.root.removeEventListener('pointerdown', this.onPointerDevice, true);
        this.root.removeEventListener('pointerdown', this.onPointerDown);
        this.root.removeEventListener('pointerup', this.onPointerUp);
        this.root.removeEventListener('pointercancel', this.onPointerUp);
        this.root.removeEventListener('lostpointercapture', this.onPointerUp, true);

        this.orientation?.removeEventListener?.('change', this.clearTouch);
        this.touchRoot?.removeEventListener('sidebar:changed', this.clearTouch);
        this.touchStick?.dispose();
        this.onBlur();
    }
}
