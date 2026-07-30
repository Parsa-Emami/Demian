function hashSeed(seed) {
    const text = String(seed ?? 'demian');
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0 || 0x6d2b79f5;
}

/** Deterministic Mulberry32 random source. */
export default class SeededRandom {
    constructor(seed = Date.now()) {
        this.seed = seed;
        this.state = hashSeed(seed);
    }

    next() {
        let value = this.state += 0x6D2B79F5;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        this.state = value >>> 0;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    integer(maxExclusive) {
        const max = Math.floor(maxExclusive);
        if (max <= 0) return 0;
        return Math.floor(this.next() * max);
    }

    shuffle(values) {
        const result = [...values];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const target = this.integer(index + 1);
            [result[index], result[target]] = [result[target], result[index]];
        }
        return result;
    }
}
