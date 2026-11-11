import { COLS, ROWS, INGREDIENTS, LEVELS } from './CoffeeCrashData.js';

const copy = value => structuredClone(value);
export const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b)
    && a >= 0 && b >= 0 && a < COLS * ROWS && b < COLS * ROWS
    && Math.abs(a % COLS - b % COLS) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) === 1;

export function findRuns(board) {
    const runs = [];
    for (const direction of ['row', 'column']) {
        const lines = direction === 'row' ? ROWS : COLS;
        const length = direction === 'row' ? COLS : ROWS;
        for (let line = 0; line < lines; line++) {
            let group = [];
            const flush = () => { if (group.length >= 3) runs.push({ cells: group, direction }); };
            for (let offset = 0; offset <= length; offset++) {
                const i = direction === 'row' ? line * COLS + offset : offset * COLS + line;
                const tile = offset < length ? board[i] : null;
                if (!tile || (group.length && tile.type !== board[group[0]].type)) {
                    flush();
                    group = [];
                }
                if (tile) group.push(i);
            }
        }
    }
    return runs;
}

export default class CoffeeCrashModel {
    constructor(level = 1) { this.reset(level); }

    reset(level = 1) {
        this.level = LEVELS.find(item => item.id === level) ?? LEVELS[0];
        this.rng = this.level.seed;
        this.score = 0;
        this.moves = this.level.moves;
        this.collected = Array(INGREDIENTS.length).fill(0);
        this.bestChain = 0;
        this.status = 'playing';
        this.history = null;
        this.usedUndo = false;
        this.board = [];
        this.generate();
    }

    random(max) {
        let state = this.rng;
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        this.rng = state >>> 0;
        return Math.floor(this.rng / 4294967296 * max);
    }

    tile() { return { type: this.random(INGREDIENTS.length), special: null }; }

    generate() {
        for (let attempt = 0; attempt < 300; attempt++) {
            this.board = [];
            for (let i = 0; i < COLS * ROWS; i++) {
                const allowed = INGREDIENTS.map((_, type) => type).filter(type =>
                    !(i % COLS >= 2 && this.board[i - 1]?.type === type && this.board[i - 2]?.type === type)
                    && !(i >= COLS * 2 && this.board[i - COLS]?.type === type && this.board[i - COLS * 2]?.type === type));
                this.board.push({ type: allowed[this.random(allowed.length)], special: null });
            }
            if (this.findMove()) return;
        }
        throw new Error('Coffee Crash could not generate a playable board.');
    }

    findMove() {
        for (let a = 0; a < this.board.length; a++) {
            for (const b of [a + 1, a + COLS]) {
                if (!adjacent(a, b)) continue;
                if (this.specialSwap(a, b)) return [a, b];
                [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
                const valid = findRuns(this.board).some(run => run.cells.includes(a) || run.cells.includes(b));
                [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
                if (valid) return [a, b];
            }
        }
        return null;
    }

    specialSwap(a, b) {
        return this.board[a]?.special === 'rainbow' || this.board[b]?.special === 'rainbow'
            || (Boolean(this.board[a]?.special) && Boolean(this.board[b]?.special));
    }

    snapshot() {
        return copy({ board: this.board, rng: this.rng, score: this.score, moves: this.moves,
            collected: this.collected, status: this.status, bestChain: this.bestChain });
    }

    frame(kind, extra = {}) {
        return { kind, board: copy(this.board), score: this.score, collected: [...this.collected], moves: this.moves, ...extra };
    }

    swap(a, b) {
        if (this.status !== 'playing' || !adjacent(a, b)) return { accepted: false, frames: [] };
        const before = this.snapshot();
        const special = this.specialSwap(a, b);
        [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
        let runs = findRuns(this.board);
        if (!special && !runs.some(run => run.cells.includes(a) || run.cells.includes(b))) {
            const frames = [this.frame('swap', { affected: [a, b] })];
            this.board = before.board;
            frames.push(this.frame('invalid', { affected: [a, b] }));
            return { accepted: false, frames };
        }
        this.history = before;
        this.moves--;
        const frames = [this.frame('swap', { affected: [a, b] })];
        let initial = special ? new Set([a, b]) : null;
        const rainbowTargets = new Map();
        if (special) {
            const rainbows = [a, b].filter(i => this.board[i].special === 'rainbow');
            if (rainbows.length) {
                const target = this.board[rainbows[0] === a ? b : a].type;
                rainbows.forEach(i => rainbowTargets.set(i, target));
                this.board.forEach((tile, i) => { if (rainbows.length === 2 || tile.type === target) initial.add(i); });
            }
        }
        let chain = 0;
        while ((runs.length || initial) && chain < 64) {
            chain++;
            const creations = initial ? [] : this.creations(runs, chain === 1 ? [b, a] : []);
            const clear = initial ?? new Set(runs.flatMap(run => run.cells));
            this.expand(clear, chain === 1 ? rainbowTargets : new Map());
            for (const creation of creations) clear.delete(creation.index);
            for (const i of clear) {
                this.collected[this.board[i].type]++;
                this.score += 60 * Math.min(chain, 5);
            }
            frames.push(this.frame('clear', { cleared: [...clear], chain }));
            for (const i of clear) this.board[i] = null;
            for (const creation of creations) this.board[creation.index].special = creation.special;
            this.collapse();
            frames.push(this.frame('fall', { chain }));
            initial = null;
            runs = findRuns(this.board);
        }
        this.bestChain = Math.max(this.bestChain, chain);
        if (runs.length) {
            this.generate();
            frames.push(this.frame('shuffle'));
        } else if (!this.findMove()) {
            this.shuffle();
            frames.push(this.frame('shuffle'));
        }
        this.status = this.level.goals.every(goal => this.collected[goal.type] >= goal.count)
            ? 'won' : this.moves <= 0 ? 'lost' : 'playing';
        frames.push(this.frame('settled'));
        return { accepted: true, frames, chain, status: this.status };
    }

    creations(runs, preferred) {
        const groups = [];
        for (const run of runs) {
            const touching = groups.filter(group => run.cells.some(i => group.cells.has(i)));
            const group = { cells: new Set(run.cells), runs: [run] };
            for (const other of touching) {
                other.cells.forEach(i => group.cells.add(i));
                group.runs.push(...other.runs);
                groups.splice(groups.indexOf(other), 1);
            }
            groups.push(group);
        }
        return groups.flatMap(group => {
            const longest = group.runs.reduce((best, run) => run.cells.length > best.cells.length ? run : best);
            const special = longest.cells.length >= 5 ? 'rainbow' : group.runs.length > 1 ? 'bomb'
                : longest.cells.length === 4 ? longest.direction : null;
            if (!special) return [];
            const candidates = [...preferred, ...group.cells].filter(i => group.cells.has(i) && !this.board[i].special);
            if (!candidates.length) return [];
            return [{ index: candidates[0], special }];
        });
    }

    expand(clear, rainbowTargets = new Map()) {
        const queue = [...clear];
        const seen = new Set();
        const add = i => {
            if (i >= 0 && i < this.board.length && this.board[i] && !clear.has(i)) { clear.add(i); queue.push(i); }
        };
        for (let head = 0; head < queue.length; head++) {
            const i = queue[head];
            if (seen.has(i)) continue;
            seen.add(i);
            const tile = this.board[i];
            if (!tile?.special) continue;
            const x = i % COLS;
            const y = Math.floor(i / COLS);
            if (tile.special === 'row') for (let xx = 0; xx < COLS; xx++) add(y * COLS + xx);
            if (tile.special === 'column') for (let yy = 0; yy < ROWS; yy++) add(yy * COLS + x);
            if (tile.special === 'bomb') {
                for (let yy = Math.max(0, y - 1); yy <= Math.min(ROWS - 1, y + 1); yy++)
                    for (let xx = Math.max(0, x - 1); xx <= Math.min(COLS - 1, x + 1); xx++) add(yy * COLS + xx);
            }
            if (tile.special === 'rainbow') this.board.forEach((other, at) => { if (other?.type === (rainbowTargets.get(i) ?? tile.type)) add(at); });
        }
    }

    collapse() {
        for (let x = 0; x < COLS; x++) {
            const remaining = [];
            for (let y = ROWS - 1; y >= 0; y--) if (this.board[y * COLS + x]) remaining.push(this.board[y * COLS + x]);
            for (let y = ROWS - 1; y >= 0; y--) this.board[y * COLS + x] = remaining.shift() ?? this.tile();
        }
    }

    shuffle() {
        const original = copy(this.board);
        for (let attempt = 0; attempt < 300; attempt++) {
            this.board = copy(original);
            for (let i = this.board.length - 1; i > 0; i--) {
                const j = this.random(i + 1);
                [this.board[i], this.board[j]] = [this.board[j], this.board[i]];
            }
            if (!findRuns(this.board).length && this.findMove()) return;
        }
        this.generate();
    }

    undo() {
        if (!this.history || this.usedUndo || this.status !== 'playing') return false;
        Object.assign(this, copy(this.history));
        this.history = null;
        this.usedUndo = true;
        return true;
    }

    get stars() { return this.status === 'won' ? this.moves >= 10 ? 3 : this.moves >= 5 ? 2 : 1 : 0; }
}
