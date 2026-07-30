export default class ChunkUnloader {
    constructor({ eventBus = null } = {}) {
        this.eventBus = eventBus;
    }

    async unload(handle, definition = null) {
        if (!handle) return false;
        const chunkId = definition?.id ?? handle.id ?? 'unknown';
        await handle.dispose?.();
        this.eventBus?.emit('world:chunk-unloaded', { chunkId });
        return true;
    }
}
