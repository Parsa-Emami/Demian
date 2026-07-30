function abortError() {
    const error = new Error('Chunk loading aborted.');
    error.name = 'AbortError';
    return error;
}

export default class ChunkLoader {
    constructor({ factory, eventBus = null } = {}) {
        if (!factory?.create) throw new TypeError('ChunkLoader requires a factory with create().');
        this.factory = factory;
        this.eventBus = eventBus;
    }

    async load(definition, { signal = null, tier = 'active' } = {}) {
        if (signal?.aborted) throw abortError();
        this.eventBus?.emit('world:chunk-load-started', { chunkId: definition.id, tier });
        await Promise.resolve();
        if (signal?.aborted) throw abortError();
        const handle = await this.factory.create(definition, { signal, tier });
        if (signal?.aborted) {
            await handle?.dispose?.();
            throw abortError();
        }
        this.eventBus?.emit('world:chunk-loaded', { chunkId: definition.id, tier, handle });
        return handle;
    }
}
