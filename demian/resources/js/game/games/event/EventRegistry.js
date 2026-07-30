import cafeRush from './definitions/cafe-rush.json' with { type: 'json' };
import neonCollector from './definitions/neon-collector.json' with { type: 'json' };
import survivalNight from './definitions/survival-night.json' with { type: 'json' };
import EventDefinitionLoader from './EventDefinitionLoader.js';

export const BUILT_IN_EVENT_SOURCES = Object.freeze({
    'cafe-rush': Object.freeze({
        summary: Object.freeze({ id: 'cafe-rush', title: 'Cafe Rush', duration: 75, accent: 'amber' }),
        load: () => cafeRush,
    }),
    'neon-collector': Object.freeze({
        summary: Object.freeze({ id: 'neon-collector', title: 'Neon Collector', duration: 90, accent: 'cyan' }),
        load: () => neonCollector,
    }),
    'survival-night': Object.freeze({
        summary: Object.freeze({ id: 'survival-night', title: 'Survival Night', duration: 48, accent: 'violet' }),
        load: () => survivalNight,
    }),
});

export default class EventRegistry {
    constructor({
        sources = BUILT_IN_EVENT_SOURCES,
        loader = new EventDefinitionLoader(),
        defaultId = 'cafe-rush',
    } = {}) {
        this.sources = new Map(Object.entries(sources));
        this.loader = loader;
        this.defaultId = defaultId;
        this.pending = new Map();
    }

    has(id) {
        return this.sources.has(id) || Boolean(this.loader.get(id));
    }

    list() {
        return [...this.sources.values()].map((entry) => entry.summary);
    }

    registerDefinition(definition) {
        const loaded = this.loader.loadObject(definition);
        if (!this.sources.has(loaded.id)) {
            this.sources.set(loaded.id, Object.freeze({
                summary: Object.freeze({
                    id: loaded.id,
                    title: loaded.title,
                    duration: loaded.duration,
                    accent: 'remote',
                }),
                load: () => loaded,
            }));
        }
        return loaded;
    }

    async load(id = this.defaultId) {
        const cached = this.loader.get(id);
        if (cached) return cached;
        if (!this.sources.has(id)) throw new Error(`Unknown event: ${id}`);

        if (!this.pending.has(id)) {
            const operation = Promise.resolve(this.sources.get(id).load())
                .then((raw) => this.loader.loadObject(raw, { cacheKey: id }))
                .finally(() => this.pending.delete(id));
            this.pending.set(id, operation);
        }
        return this.pending.get(id);
    }

    async loadActive(apiBase, { timeoutMs = 850 } = {}) {
        const base = String(apiBase ?? '').replace(/\/$/, '');
        if (!base) return this.load(this.defaultId);
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const definition = await this.loader.loadRemote(`${base}/active`, {
                signal: controller.signal,
            });
            return this.registerDefinition(definition);
        } finally {
            globalThis.clearTimeout(timeout);
        }
    }

    async preloadAll() {
        return Promise.all([...this.sources.keys()].map((id) => this.load(id)));
    }
}
