import { gravityIntervalForLevel } from '../config/TetrisConfig.js';

export default class GravitySystem {
    constructor() {
        this.accumulator = 0;
    }

    reset() {
        this.accumulator = 0;
    }

    update(deltaTime, level) {
        this.accumulator += Math.max(0, deltaTime);
        const interval = gravityIntervalForLevel(level);
        let steps = 0;

        while (this.accumulator >= interval && steps < 20) {
            this.accumulator -= interval;
            steps += 1;
        }

        return steps;
    }
}
