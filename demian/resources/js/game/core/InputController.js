const MOVEMENT_KEYS = new Set([
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
]);

export default class InputController {
    constructor() {
        this.held = new Set();
        this.pressed = new Set();

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();

        if (MOVEMENT_KEYS.has(key)) {
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
    }

    isHeld(...keys) {
        return keys.some((key) => this.held.has(key));
    }

    consumePressed(...keys) {
        const matched = keys.find((key) => this.pressed.has(key));

        if (!matched) {
            return false;
        }

        this.pressed.delete(matched);
        return true;
    }

    snapshot() {
        return {
            x:
                Number(this.isHeld('d', 'arrowright')) -
                Number(this.isHeld('a', 'arrowleft')),
            z:
                Number(this.isHeld('s', 'arrowdown')) -
                Number(this.isHeld('w', 'arrowup')),
            run: this.isHeld('shift'),
            jump: this.consumePressed(' '),
            attack: this.consumePressed('e'),
            win: this.consumePressed('q'),
        };
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
    }
}
