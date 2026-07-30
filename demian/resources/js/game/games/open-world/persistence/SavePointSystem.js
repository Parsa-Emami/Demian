export default class SavePointSystem {
    constructor({ manifest, discovery, store, eventBus = null, stateProvider = () => ({}) } = {}) {
        if (!manifest || !discovery || !store) throw new TypeError('SavePointSystem requires manifest, discovery and store.');
        this.manifest = manifest;
        this.discovery = discovery;
        this.store = store;
        this.eventBus = eventBus;
        this.stateProvider = stateProvider;
        this.lastSavePointId = null;
        this.lastSavedAt = null;
    }

    restore() {
        const state = this.store.load({ worldId: this.manifest.id, maxWorldVersion: this.manifest.version });
        if (!state) return null;
        this.discovery.import(state.discovery ?? {});
        this.lastSavePointId = state.lastSavePointId ?? null;
        this.lastSavedAt = state.savedAt ?? null;
        this.eventBus?.emit('world:save-restored', { state });
        return state;
    }

    activate(savePointId, extra = {}) {
        const point = this.manifest.savePoint(savePointId);
        if (!point) throw new Error(`Unknown save point: ${savePointId}`);
        this.discovery.unlockSavePoint(point.id);
        this.discovery.discoverChunk(point.chunkId);
        this.lastSavePointId = point.id;
        return this.save({ reason: 'save-point', savePoint: point, ...extra });
    }

    save(extra = {}) {
        const state = {
            worldId: this.manifest.id,
            worldVersion: this.manifest.version,
            ...this.stateProvider(),
            discovery: this.discovery.export(),
            lastSavePointId: this.lastSavePointId,
            savedAt: new Date().toISOString(),
            ...extra,
        };
        const envelope = this.store.save(state);
        this.lastSavedAt = envelope.savedAt;
        this.eventBus?.emit('world:saved', { state, envelope });
        return envelope;
    }

    snapshot() {
        return Object.freeze({ lastSavePointId: this.lastSavePointId, lastSavedAt: this.lastSavedAt });
    }
}
