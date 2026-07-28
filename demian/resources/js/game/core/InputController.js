const CONTROL_KEYS = new Set([
    'w', 'a', 's', 'd',
    'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
    'shift', ' ', 'e', 'q', 'x', 'u', 'c', 'v', 'z', 'g', 'b', 'n', 't', 'y', 'h',
    'j', 'k', 'l', 'p', 'o', 'i',
]);

const ACTION_HAPTICS = new Set([
    'jump', 'attack', 'combo', 'uppercut', 'cast', 'dash', 'slide', 'dodge', 'win', 'celebrate',
]);

export default class InputController {
    constructor(root = document) {
        this.root = root;
        this.held = new Set();
        this.pressed = new Set();
        this.virtualHeld = new Set();
        this.virtualPressed = new Set();
        this.pointerBindings = [];
        this.analog = { x: 0, z: 0, magnitude: 0 };
        this.stickBinding = null;
        this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onBlur);

        this.bindVirtualControls();
        this.bindVirtualStick();
    }

    onKeyDown(event) {
        const target = event.target;
        const isTyping =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable;

        if (isTyping) {
            return;
        }

        const key = event.key.toLowerCase();
        if (CONTROL_KEYS.has(key)) {
            event.preventDefault();
        }

        if (!this.held.has(key)) {
            this.pressed.add(key);
        }
        this.held.add(key);
    }

    onKeyUp(event) {
        this.held.delete(event.key.toLowerCase());
    }

    onBlur() {
        this.held.clear();
        this.pressed.clear();
        this.virtualHeld.clear();
        this.virtualPressed.clear();
        this.resetStick();
        this.root.querySelectorAll('.is-pressed').forEach((element) =>
            element.classList.remove('is-pressed')
        );
    }

    bindVirtualControls() {
        this.root.querySelectorAll('[data-input-hold]').forEach((button) => {
            const key = button.dataset.inputHold;

            const press = (event) => {
                event.preventDefault();
                event.stopPropagation();
                button.setPointerCapture?.(event.pointerId);
                this.virtualHeld.add(key);
                button.classList.add('is-pressed');
            };

            const release = (event) => {
                event.preventDefault();
                this.virtualHeld.delete(key);
                button.classList.remove('is-pressed');
            };

            button.addEventListener('pointerdown', press);
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('lostpointercapture', release);
            this.pointerBindings.push({ button, press, release, type: 'hold' });
        });

        this.root.querySelectorAll('[data-input-press]').forEach((button) => {
            const key = button.dataset.inputPress;

            const press = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.virtualPressed.add(key);
                button.classList.add('is-pressed');

                if (ACTION_HAPTICS.has(key)) {
                    navigator.vibrate?.(key === 'dash' ? 18 : 10);
                }

                window.setTimeout(() => button.classList.remove('is-pressed'), 115);
            };

            button.addEventListener('pointerdown', press);
            this.pointerBindings.push({ button, press, type: 'press' });
        });
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
            const magnitude = Math.min(Math.max((Math.hypot(x, y) - deadZone) / (1 - deadZone), 0), 1);
            const normalizedLength = Math.hypot(x, y) || 1;
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
            event.preventDefault();
            update(event);
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

    isHeld(...keys) {
        return keys.some((key) => this.held.has(key) || this.virtualHeld.has(key));
    }

    consumePressed(...keys) {
        const matched = keys.find((key) => this.pressed.has(key) || this.virtualPressed.has(key));
        if (!matched) {
            return false;
        }

        this.pressed.delete(matched);
        this.virtualPressed.delete(matched);
        return true;
    }

    snapshot() {
        const digitalX =
            Number(this.isHeld('d', 'arrowright', 'right')) -
            Number(this.isHeld('a', 'arrowleft', 'left'));
        const digitalZ =
            Number(this.isHeld('s', 'arrowdown', 'down')) -
            Number(this.isHeld('w', 'arrowup', 'up'));

        const usingAnalog = this.analog.magnitude > 0.01;
        const x = usingAnalog ? this.analog.x : digitalX;
        const z = usingAnalog ? this.analog.z : digitalZ;
        const autoSprint = this.coarsePointer && this.analog.magnitude > 0.9;

        return {
            x,
            z,
            run: this.isHeld('shift', 'run') || autoSprint,
            jump: this.consumePressed(' ', 'jump'),
            attack: this.consumePressed('e', 'attack'),
            combo: this.consumePressed('j', 'combo'),
            uppercut: this.consumePressed('k', 'uppercut'),
            cast: this.consumePressed('l', 'cast'),
            charge: this.consumePressed('p', 'charge'),
            hurt: this.consumePressed('i', 'hurt'),
            win: this.consumePressed('q', 'win'),
            celebrate: this.consumePressed('o', 'celebrate'),
            dash: this.consumePressed('x', 'dash'),
            slide: this.consumePressed('slide'),
            dodge: this.consumePressed('u', 'dodge'),
            dance: this.consumePressed('c', 'dance'),
            wave: this.consumePressed('v', 'wave'),
            salute: this.consumePressed('salute'),
            spin: this.consumePressed('z', 'spin'),
            crouch: this.consumePressed('g', 'crouch'),
            laugh: this.consumePressed('b', 'laugh'),
            pose: this.consumePressed('n', 'pose'),
            sleep: this.consumePressed('t', 'sleep'),
            taunt: this.consumePressed('y', 'taunt'),
            speak: this.consumePressed('h', 'speak'),
        };
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onBlur);

        this.pointerBindings.forEach(({ button, press, release, type }) => {
            button.removeEventListener('pointerdown', press);
            if (type === 'hold') {
                button.removeEventListener('pointerup', release);
                button.removeEventListener('pointercancel', release);
                button.removeEventListener('lostpointercapture', release);
            }
        });

        if (this.stickBinding) {
            const { base, press, move, release } = this.stickBinding;
            base.removeEventListener('pointerdown', press);
            base.removeEventListener('pointermove', move);
            base.removeEventListener('pointerup', release);
            base.removeEventListener('pointercancel', release);
            base.removeEventListener('lostpointercapture', release);
        }
    }
}
