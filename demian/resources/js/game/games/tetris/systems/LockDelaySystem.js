import { TETRIS_CONFIG } from '../config/TetrisConfig.js';

export default class LockDelaySystem {
    constructor({
        delay = TETRIS_CONFIG.timing.lockDelaySeconds,
        maxResets = TETRIS_CONFIG.timing.maxLockResets,
    } = {}) {
        this.delay = delay;
        this.maxResets = maxResets;
        this.resetForPiece();
    }

    resetForPiece() {
        this.elapsed = 0;
        this.resets = 0;
        this.grounded = false;
    }

    update(deltaTime, { grounded, manipulated = false } = {}) {
        if (!grounded) {
            this.elapsed = 0;
            this.grounded = false;
            return false;
        }

        if (manipulated && this.grounded && this.resets < this.maxResets) {
            this.elapsed = 0;
            this.resets += 1;
        }

        this.grounded = true;
        this.elapsed += Math.max(0, deltaTime);
        return this.elapsed >= this.delay;
    }
}
