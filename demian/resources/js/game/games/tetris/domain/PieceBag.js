import SeededRandom from './SeededRandom.js';
import { PIECE_TYPES } from './Tetrominoes.js';

export default class PieceBag {
    constructor({ seed = Date.now(), random = null } = {}) {
        this.seed = seed;
        this.random = random ?? new SeededRandom(seed);
        this.queue = [];
    }

    refill() {
        this.queue.push(...this.random.shuffle(PIECE_TYPES));
    }

    next() {
        if (this.queue.length === 0) this.refill();
        return this.queue.shift();
    }

    peek(count = 1) {
        while (this.queue.length < count) this.refill();
        return this.queue.slice(0, count);
    }

    reset() {
        this.random = new SeededRandom(this.seed);
        this.queue = [];
    }
}
