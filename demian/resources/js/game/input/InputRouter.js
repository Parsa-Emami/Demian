import { INPUT_CONTEXTS } from './InputContexts';
import InputBindingStore, { keyboardToken } from './InputBindingStore.js';
import GamepadSource from './GamepadSource.js';

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
    constructor({ root = document, contexts = INPUT_CONTEXTS, initialContext = 'MENU' } = {}) {
        this.root = root;
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
        this.analog = { x: 0, z: 0, magnitude: 0 };
        this.stickBinding = null;
        this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.device = this.coarsePointer ? 'touch' : 'keyboard';

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onClick = this.onClick.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibilityChange = () => {
            if (document.hidden) {
                this.onBlur();
            }
        });
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('pointerdown', this.onPointerDown);
        this.root.addEventListener('pointerup', this.onPointerUp);
        this.root.addEventListener('pointercancel', this.onPointerUp);
        this.root.addEventListener('lostpointercapture', this.onPointerUp, true);

        this.bindVirtualStick();
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
        if (this.controlKeys().has(key) && !nativeActivation) {
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

    onPointerDown(event) {
        const button = event.target.closest?.('[data-input-hold], [data-input-press]');

        if (!button) {
            return;
        }

        if (button.disabled || button.hidden || button.getAttribute('aria-disabled') === 'true') return;

        this.setDevice(event.pointerType === 'touch' ? 'touch' : 'keyboard');
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture?.(event.pointerId);

        const holdAction = button.dataset.inputHold;
        const pressAction = button.dataset.inputPress;

        if (holdAction) {
            this.virtualHeld.add(holdAction);
            this.pointerHolds.set(event.pointerId, { action: holdAction, button });
            button.classList.add('is-pressed');
        }

        if (pressAction) {
            this.virtualPressed.add(pressAction);
            button.classList.add('is-pressed');

            if (ACTION_HAPTICS.has(pressAction)) {
                navigator.vibrate?.(pressAction === 'dash' ? 18 : 10);
            }

            window.setTimeout(() => button.classList.remove('is-pressed'), 115);
        }
    }

    onPointerUp(event) {
        const binding = this.pointerHolds.get(event.pointerId);

        if (!binding) {
            return;
        }

        this.pointerHolds.delete(event.pointerId);
        if (![...this.pointerHolds.values()].some(entry => entry.action === binding.action)) {
            this.virtualHeld.delete(binding.action);
            binding.button.classList.remove('is-pressed');
        }
    }

    bindVirtualStick() {
        const base = this.root.querySelector('[data-virtual-stick]');
        const knob = base?.querySelector('[data-virtual-stick-knob]');

        if (!base || !knob) {
            return;
        }

        let pointerId = null;

        const update = (event) => {
            if (pointerId !== event.pointerId) {
                return;
            }

            const rect = base.getBoundingClientRect();
            const radius = Math.max(Math.min(rect.width, rect.height) * 0.36, 1);
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            let x = (event.clientX - centerX) / radius;
            let y = (event.clientY - centerY) / radius;
            const length = Math.hypot(x, y);

            if (length > 1) {
                x /= length;
                y /= length;
            }

            const deadZone = 0.1;
            const rawMagnitude = Math.hypot(x, y);
            const magnitude = Math.min(Math.max((rawMagnitude - deadZone) / (1 - deadZone), 0), 1);
            const normalizedLength = rawMagnitude || 1;
            this.analog.x = (x / normalizedLength) * magnitude;
            this.analog.z = (y / normalizedLength) * magnitude;
            this.analog.magnitude = magnitude;

            knob.style.setProperty('--stick-x', `${x * radius}px`);
            knob.style.setProperty('--stick-y', `${y * radius}px`);
            base.style.setProperty('--stick-force', magnitude.toFixed(3));
        };

        const press = (event) => {
            if (pointerId !== null) return;
            this.setDevice('touch');
            event.preventDefault();
            pointerId = event.pointerId;
            base.setPointerCapture?.(pointerId);
            base.classList.add('is-active');
            update(event);
        };

        const move = (event) => {
            if (pointerId === event.pointerId) {
                event.preventDefault();
                update(event);
            }
        };

        const release = (event) => {
            if (pointerId !== event.pointerId) {
                return;
            }

            event.preventDefault();
            pointerId = null;
            base.classList.remove('is-active');
            this.resetStick();
        };

        base.addEventListener('pointerdown', press);
        base.addEventListener('pointermove', move);
        base.addEventListener('pointerup', release);
        base.addEventListener('pointercancel', release);
        base.addEventListener('lostpointercapture', release);
        this.stickBinding = { base, knob, press, move, release, reset: () => { pointerId = null; base.classList.remove('is-active'); } };
    }

    resetStick() {
        this.analog.x = 0;
        this.analog.z = 0;
        this.analog.magnitude = 0;

        if (this.stickBinding) {
            this.stickBinding.reset();
            this.stickBinding.knob.style.setProperty('--stick-x', '0px');
            this.stickBinding.knob.style.setProperty('--stick-y', '0px');
            this.stickBinding.base.style.setProperty('--stick-force', '0');
        }
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

        const analog = this.analog.magnitude > .01 ? this.analog : this.gamepad.stick;
        if (context.analog && analog.magnitude > 0.01) {
            snapshot[context.analog.xAxis] = analog.x;
            snapshot[context.analog.zAxis] = analog.z;

            if (
                this.device === 'touch' &&
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
        if (button.dataset.inputPress) this.virtualPressed.add(button.dataset.inputPress);
        if (button.dataset.inputHold && !button.dataset.inputPress) {
            const action = button.dataset.inputHold;
            if (this.virtualHeld.has(action)) this.virtualHeld.delete(action);
            else this.virtualHeld.add(action);
            button.classList.toggle('is-pressed', this.virtualHeld.has(action));
            button.setAttribute('aria-pressed', String(this.virtualHeld.has(action)));
        }
    }

    onBlur() {
        this.keyboardCodes.clear();
        this.gamepad.reset();
        this.held.clear();
        this.pressed.clear();
        this.virtualHeld.clear();
        this.virtualPressed.clear();
        this.pointerHolds.clear();
        this.resetStick();
        this.root.querySelectorAll('.is-pressed').forEach((element) => {
            element.classList.remove('is-pressed');
            if (element.hasAttribute('aria-pressed')) element.setAttribute('aria-pressed', 'false');
        });
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.root.removeEventListener('click', this.onClick);
        this.root.removeEventListener('pointerdown', this.onPointerDown);
        this.root.removeEventListener('pointerup', this.onPointerUp);
        this.root.removeEventListener('pointercancel', this.onPointerUp);
        this.root.removeEventListener('lostpointercapture', this.onPointerUp, true);

        if (this.stickBinding) {
            const { base, press, move, release } = this.stickBinding;
            base.removeEventListener('pointerdown', press);
            base.removeEventListener('pointermove', move);
            base.removeEventListener('pointerup', release);
            base.removeEventListener('pointercancel', release);
            base.removeEventListener('lostpointercapture', release);
        }

        this.onBlur();
    }
}
