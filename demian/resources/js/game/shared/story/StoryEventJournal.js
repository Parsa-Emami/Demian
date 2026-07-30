const VERSION = 1;
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
export default class StoryEventJournal {
    constructor({ storage = globalThis.localStorage, key = 'demian.story-journal.v1', limit = 256 } = {}) {
        this.storage = storage;
        this.key = key;
        this.limit = Math.max(16, limit);
        this.sequence = 0;
        this.entries = [];
        this.load();
    }
    append(type, payload = {}) {
        if (!type) throw new TypeError('Story event type is required.');
        const entry = Object.freeze({ id: ++this.sequence, type: String(type), payload: Object.freeze(clone(payload)), at: new Date().toISOString() });
        this.entries.push(entry);
        if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
        this.persist();
        return entry;
    }
    since(cursor = 0, predicate = null) {
        return this.entries.filter((entry) => entry.id > cursor && (!predicate || predicate(entry))).map((entry) => entry);
    }
    latestCursor() { return this.sequence; }
    load() {
        const raw = this.storage?.getItem(this.key);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.version !== VERSION || !Array.isArray(parsed.entries)) return;
            this.sequence = Math.max(0, Number(parsed.sequence) || 0);
            this.entries = parsed.entries.slice(-this.limit).map((entry) => Object.freeze({ ...entry, payload: Object.freeze({ ...(entry.payload ?? {}) }) }));
        } catch { this.entries = []; this.sequence = 0; }
    }
    persist() { this.storage?.setItem(this.key, JSON.stringify({ version: VERSION, sequence: this.sequence, entries: this.entries })); }
    clear() { this.entries = []; this.sequence = 0; this.storage?.removeItem(this.key); }
    snapshot() { return Object.freeze({ version: VERSION, cursor: this.sequence, entries: Object.freeze([...this.entries]) }); }
    dispose() { this.persist(); }
}
