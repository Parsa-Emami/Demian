/** Data-only chunk factory. Canvas rendering reads loaded chunk records. */
export default class OpenWorldChunkRenderer {
    constructor({ manifest, environment } = {}) {
        this.manifest = manifest;
        this.environment = environment;
        this.handles = new Map();
    }

    async create(definition, options = {}) {
        const tier = typeof options === 'string' ? options : options?.tier ?? 'preload';
        const signal = typeof options === 'object' ? options?.signal : null;
        if (signal?.aborted) throw Object.assign(new Error('Chunk load aborted.'), { name: 'AbortError' });
        const handle = {
            id: definition.id,
            definition,
            tier,
            setTier(value) { this.tier = value; },
            dispose: () => this.handles.delete(definition.id),
        };
        this.handles.set(definition.id, handle);
        return handle;
    }

    dispose() { this.handles.clear(); }
}
