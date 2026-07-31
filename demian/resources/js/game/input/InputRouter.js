import { INPUT_CONTEXTS } from './InputContexts';

const ACTION_HAPTICS = new Set([
    'jump',
    'attack',
    'combo',
    'uppercut',
    'cast',
    'dash',
    'slide',
    'dodge',
    'win',
    'celebrate',
    'guitar',
    'hardDrop',
    'interact',
    'revealPulse',
    'eventAction',
    'toggleInventory',
    'toggleQuests',
]);

function normalizeKeyboardEvent(event) {
    if (event.code === 'Space' || event.key === ' ') {
        return 'space';
    }

    return String(event.key ?? '').toLowerCase();
}

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
        this.held = new Set();
        this.pressed = new Set();
        this.virtualHeld = new Set();
        this.virtualPressed = new Set();
        this.pointerHolds = new Map();
        this.analog = { x: 0, z: 0, magnitude: 0 };
        this.stickBinding = null;
        this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibilityChange = () => {
            if (document.hidden) {
                this.onBlur();
            }
        });
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
        this.pressed.clear();
        this.virtualPressed.clear();
        this.root.dispatchEvent?.(new CustomEvent('input:context-changed', {
            detail: { context: name },
        }));
    }

    get context() {
        return this.contexts.get(this.contextName);
    }

    onKeyDown(event) {
        if (isTypingTarget(event.target)) {
            return;
        }

        const key = normalizeKeyboardEvent(event);

        if (this.controlKeys().has(key)) {
            event.preventDefault();
        }

        if (!this.held.has(key)) {
            this.pressed.add(key);
        }

        this.held.add(key);
    }

    onKeyUp(event) {
        this.held.delete(normalizeKeyboardEvent(event));
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

        this.virtualHeld.delete(binding.action);
        binding.button.classList.remove('is-pressed');
        this.pointerHolds.delete(event.pointerId);
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
        this.stickBinding = { base, knob, press, move, release };
    }

    resetStick() {
        this.analog.x = 0;
        this.analog.z = 0;
        this.analog.magnitude = 0;

        if (this.stickBinding) {
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
            snapshot[name] = definition.mode === 'hold'
                ? this.isHeld(definition.keys)
                : this.consumePressed(definition.keys, consumePresses);
        });

        if (context.analog && this.analog.magnitude > 0.01) {
            snapshot[context.analog.xAxis] = this.analog.x;
            snapshot[context.analog.zAxis] = this.analog.z;

            if (
                this.coarsePointer &&
                context.analog.autoSprintAction &&
                this.analog.magnitude > context.analog.autoSprintThreshold
            ) {
                snapshot[context.analog.autoSprintAction] = true;
            }
        }

        return snapshot;
    }

    onBlur() {
        this.held.clear();
        this.pressed.clear();
        this.virtualHeld.clear();
        this.virtualPressed.clear();
        this.pointerHolds.clear();
        this.resetStick();
        this.root.querySelectorAll('.is-pressed').forEach((element) => {
            element.classList.remove('is-pressed');
        });
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
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
