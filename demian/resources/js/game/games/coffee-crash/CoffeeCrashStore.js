import { LEVELS } from './CoffeeCrashData.js';
const KEY = 'demian.coffee-crash.v1';
export default class CoffeeCrashStore {
    constructor(storage) {
        this.storage = storage;
        this.records = {};
        this.skipGuide = false;
        try {
            this.storage ??= globalThis.localStorage;
            const value = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
            if (value?.version === 1) {
                this.skipGuide = value.skipGuide === true;
                for (const level of LEVELS) {
                    const record = value.records?.[level.id];
                    if (Number.isInteger(record?.stars) && record.stars >= 1 && record.stars <= 3
                        && Number.isSafeInteger(record.score) && record.score >= 0) this.records[level.id] = record;
                }
            }
        } catch {}
    }
    get unlocked() {
        let level = 1;
        while (level < LEVELS.length && this.records[level]) level++;
        return level;
    }
    save() {
        try { this.storage?.setItem(KEY, JSON.stringify({ version: 1, records: this.records, skipGuide: this.skipGuide })); } catch {}
    }
    record(model) {
        if (model.status !== 'won' || model.level.id > this.unlocked) return;
        const old = this.records[model.level.id] ?? { stars: 0, score: 0 };
        this.records[model.level.id] = { stars: Math.max(old.stars, model.stars), score: Math.max(old.score, model.score) };
        this.save();
    }
    hideGuide() { this.skipGuide = true; this.save(); }
}
