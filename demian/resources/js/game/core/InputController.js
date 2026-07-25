const CONTROL_KEYS = new Set([
    'w',
    'a',
    's',
    'd',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
    'shift',
    ' ',
    'e',
    'q',
    'x',
    'u',
    'c',
    'v',
    'z',
    'g',
    'b',
    'n',
    't',
    'y',
    'h',
]);

export default class InputController {
    constructor(root = document) {
        this.root = root;
        this.held = new Set();
        this.pressed = new Set();
        this.virtualHeld = new Set();
        this.virtualPressed = new Set();
        this.pointerBindings = [];

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);

        this.bindVirtualControls();
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
    }

    bindVirtualControls() {
        this.root.querySelectorAll('[data-input-hold]').forEach((button) => {
            const key = button.dataset.inputHold;

            const press = (event) => {
                event.preventDefault();
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
                this.virtualPressed.add(key);
                button.classList.add('is-pressed');
                window.setTimeout(() => button.classList.remove('is-pressed'), 130);
            };

            button.addEventListener('pointerdown', press);
            this.pointerBindings.push({ button, press, type: 'press' });
        });
    }

    isHeld(...keys) {
        return keys.some(
            (key) => this.held.has(key) || this.virtualHeld.has(key)
        );
    }

    consumePressed(...keys) {
        const matched = keys.find(
            (key) => this.pressed.has(key) || this.virtualPressed.has(key)
        );

        if (!matched) {
            return false;
        }

        this.pressed.delete(matched);
        this.virtualPressed.delete(matched);
        return true;
    }

    snapshot() {
        return {
            x:
                Number(this.isHeld('d', 'arrowright', 'right')) -
                Number(this.isHeld('a', 'arrowleft', 'left')),
            z:
                Number(this.isHeld('s', 'arrowdown', 'down')) -
                Number(this.isHeld('w', 'arrowup', 'up')),
            run: this.isHeld('shift', 'run'),
            jump: this.consumePressed(' ', 'jump'),
            attack: this.consumePressed('e', 'attack'),
            win: this.consumePressed('q', 'win'),
            dash: this.consumePressed('x', 'dash'),
            dodge: this.consumePressed('u', 'dodge'),
            dance: this.consumePressed('c', 'dance'),
            wave: this.consumePressed('v', 'wave'),
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

        this.pointerBindings.forEach(({ button, press, release, type }) => {
            button.removeEventListener('pointerdown', press);

            if (type === 'hold') {
                button.removeEventListener('pointerup', release);
                button.removeEventListener('pointercancel', release);
                button.removeEventListener('lostpointercapture', release);
            }
        });
    }
}
