import { CRITTERS, CRITTER_BY_ID, CRITTER_RULES } from './CafeCrittersData.js';

const PREFIX = 'demian.cafe-critters.v1.';

export default class CafeCrittersStore {
    constructor(storage = () => globalThis.localStorage) {
        this.storage = storage;
        this.memory = new Map();
    }

    read(key) {
        try { return this.storage().getItem(PREFIX + key) ?? this.memory.get(key) ?? null; }
        catch { return this.memory.get(key) ?? null; }
    }

    write(key, value) {
        this.memory.set(key, value);
        try { this.storage().setItem(PREFIX + key, value); } catch {}
    }

    get difficulty() {
        const difficulty = this.read('difficulty');
        return Object.hasOwn(CRITTER_RULES, difficulty) ? difficulty : 'standard';
    }

    get showGuide() { return this.read('guide') !== 'hidden'; }

    saveEntry(difficulty, hideGuide) {
        if (Object.hasOwn(CRITTER_RULES, difficulty)) this.write('difficulty', difficulty);
        if (hideGuide) this.write('guide', 'hidden');
    }

    discoveries() {
        return CRITTERS.filter(({ id }) => this.read(`guest.${id}`) === '1').map(({ id }) => id);
    }

    record(id) {
        if (Object.hasOwn(CRITTER_BY_ID, id)) this.write(`guest.${id}`, '1');
    }
}
