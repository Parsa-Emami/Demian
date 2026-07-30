import { assertValidEventDefinition, deepFreezeDefinition } from './core/EventDefinitionValidator.js';

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

/** Validates, freezes and caches both bundled and API-provided definitions. */
export default class EventDefinitionLoader {
    constructor({ fetcher = globalThis.fetch?.bind(globalThis) } = {}) {
        this.fetcher = fetcher;
        this.cache = new Map();
    }

    loadObject(raw, { cacheKey = raw?.id, force = false } = {}) {
        if (!force && cacheKey && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        const definition = deepFreezeDefinition(assertValidEventDefinition(clone(raw)));
        if (cacheKey) this.cache.set(cacheKey, definition);
        this.cache.set(definition.id, definition);
        return definition;
    }

    async loadRemote(url, {
        signal,
        force = false,
        select = (payload) => payload?.data ?? payload,
    } = {}) {
        if (!force && this.cache.has(url)) return this.cache.get(url);
        if (!this.fetcher) throw new Error('No fetch implementation is available.');
        const response = await this.fetcher(url, {
            signal,
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`Event definition request failed (${response.status}).`);
        }
        const raw = select(await response.json());
        const definition = this.loadObject(raw, { cacheKey: url, force });
        this.cache.set(definition.id, definition);
        return definition;
    }

    get(key) {
        return this.cache.get(key) ?? null;
    }

    clear() {
        this.cache.clear();
    }
}
