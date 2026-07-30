import { TETRIS_CONFIG } from '../config/TetrisConfig.js';

export default class InputRepeatSystem {
    constructor({
        das = TETRIS_CONFIG.timing.dasSeconds,
        arr = TETRIS_CONFIG.timing.arrSeconds,
        softDropInterval = TETRIS_CONFIG.timing.softDropIntervalSeconds,
    } = {}) {
        this.das = das;
        this.arr = arr;
        this.softDropInterval = softDropInterval;
        this.reset();
    }

    reset() {
        this.direction = 0;
        this.heldTime = 0;
        this.repeatTime = 0;
        this.softDropHeld = false;
        this.softDropTime = 0;
    }

    horizontal(input, deltaTime) {
        const nextDirection = input.moveLeft === input.moveRight
            ? 0
            : input.moveLeft ? -1 : 1;
        const moves = [];

        if (nextDirection !== this.direction) {
            this.direction = nextDirection;
            this.heldTime = 0;
            this.repeatTime = 0;
            if (nextDirection !== 0) moves.push(nextDirection);
            return moves;
        }

        if (nextDirection === 0) return moves;
        this.heldTime += deltaTime;
        if (this.heldTime < this.das) return moves;

        this.repeatTime += deltaTime;
        while (this.repeatTime >= this.arr && moves.length < 8) {
            this.repeatTime -= this.arr;
            moves.push(nextDirection);
        }
        return moves;
    }

    softDrop(input, deltaTime) {
        if (!input.softDrop) {
            this.softDropHeld = false;
            this.softDropTime = 0;
            return 0;
        }

        if (!this.softDropHeld) {
            this.softDropHeld = true;
            this.softDropTime = 0;
            return 1;
        }

        this.softDropTime += deltaTime;
        let steps = 0;
        while (this.softDropTime >= this.softDropInterval && steps < 8) {
            this.softDropTime -= this.softDropInterval;
            steps += 1;
        }
        return steps;
    }
}
