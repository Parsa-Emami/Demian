import { CRITTERS, CRITTER_BY_ID, CRITTER_RULES, HINT_AFTER, TABLE_FIELDS, TURN_PAGES } from './CafeCrittersData.js';

const FIELD_BY_ID = Object.fromEntries(TABLE_FIELDS.map((field) => [field.id, field]));

export default class CafeCrittersModel {
    constructor(difficulty, discovered, rotation) {
        this.reset(difficulty, discovered, rotation);
    }

    reset(difficulty = 'standard', discovered = [], rotation = 0) {
        this.difficulty = Object.hasOwn(CRITTER_RULES, difficulty) ? difficulty : 'standard';
        this.rules = CRITTER_RULES[this.difficulty];
        const known = Array.isArray(discovered) ? discovered : [];
        this.album = new Set(known.filter((id) => Object.hasOwn(CRITTER_BY_ID, id)));
        const unseen = CRITTERS.filter((guest) => !this.album.has(guest.id));
        const start = Number.isSafeInteger(rotation) && rotation >= 0 ? rotation % CRITTERS.length : 0;
        const replay = [...CRITTERS.slice(start), ...CRITTERS.slice(0, start)];
        this.targets = (unseen.length ? unseen : replay).slice(0, TURN_PAGES);
        this.page = 0;
        this.status = 'ready';
        this.elapsed = 0;
        this.found = 0;
        this.newPages = 0;
        this.misses = 0;
        this.resetPuzzle();
    }

    resetPuzzle() {
        this.selection = Object.fromEntries(TABLE_FIELDS.map(({ id }) => [id, null]));
        this.attempts = new Set();
        this.feedback = null;
        this.hint = null;
    }

    get guest() { return this.targets[this.page]; }
    get remaining() { return this.rules.seconds === null ? null : Math.max(0, this.rules.seconds - this.elapsed); }
    get canInvite() { return this.status === 'playing' && TABLE_FIELDS.every(({ id }) => this.selection[id]); }

    start() {
        if (this.status === 'ready') this.status = 'playing';
    }

    select(field, option) {
        if (this.status !== 'playing' || !Object.hasOwn(FIELD_BY_ID, field)) return false;
        if (!Object.hasOwn(FIELD_BY_ID[field].options, option) || this.selection[field] === option) return false;
        this.selection[field] = option;
        this.feedback = null;
        return true;
    }

    invite() {
        if (!this.canInvite) return null;
        const guest = this.guest;
        const wrong = TABLE_FIELDS.filter(({ id }) => this.selection[id] !== guest.setting[id]);
        if (!wrong.length) {
            const first = !this.album.has(guest.id);
            this.album.add(guest.id);
            this.newPages += Number(first);
            this.found += 1;
            this.status = 'visiting';
            this.feedback = { type: 'discovery', guest, first };
            return this.feedback;
        }

        const attempt = TABLE_FIELDS.map(({ id }) => this.selection[id]).join('/');
        if (this.attempts.has(attempt)) {
            this.feedback = { type: 'repeat' };
            return this.feedback;
        }
        this.attempts.add(attempt);
        this.misses += 1;
        if (this.attempts.size >= HINT_AFTER) {
            const field = wrong.at(-1).id;
            this.hint = { field, value: guest.setting[field] };
        }
        this.feedback = { type: 'miss', matches: TABLE_FIELDS.length - wrong.length };
        return this.feedback;
    }

    next() {
        if (this.status !== 'visiting') return false;
        if (this.page + 1 === this.targets.length) {
            this.status = 'finished';
        } else {
            this.page += 1;
            this.resetPuzzle();
            this.status = 'playing';
        }
        return true;
    }

    advance(dt) {
        if (this.status !== 'playing' || this.rules.seconds === null || !Number.isFinite(dt) || dt <= 0) return;
        this.elapsed = Math.min(this.rules.seconds, this.elapsed + dt);
        if (this.remaining <= 1e-6) {
            this.elapsed = this.rules.seconds;
            this.status = 'finished';
        }
    }

    result() {
        return {
            won: this.status === 'finished' && this.found === this.targets.length,
            found: this.found,
            goal: this.targets.length,
            discovered: this.album.size,
            newPages: this.newPages,
            misses: this.misses,
        };
    }
}
