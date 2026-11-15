/** Data-only chunk factory. Canvas rendering reads loaded chunk records. */
import { generateWorldFind } from '../world/WorldFindCollection.js';

export default class OpenWorldChunkRenderer {
    constructor({ manifest, environment, navigationGrid } = {}) {
        this.manifest = manifest;
        this.environment = environment;
        this.navigationGrid = navigationGrid;
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
            find: generateWorldFind(definition, this.manifest, this.navigationGrid),
            setTier(value) { this.tier = value; },
            dispose: () => this.handles.delete(definition.id),
        };
        this.handles.set(definition.id, handle);
        return handle;
    }

    dispose() { this.handles.clear(); }
}
