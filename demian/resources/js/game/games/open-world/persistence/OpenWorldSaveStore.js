import { CAFE_WORLD_ID } from '../../../shared/cafe/CafeEnvironmentContract.js';

const SAVE_VERSION = 1;
const DEFAULT_KEY = 'demian.open-world.save.v1';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function checksum(value) {
    const source = canonical(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

export default class OpenWorldSaveStore {
    constructor({ storage = globalThis.localStorage, key = DEFAULT_KEY, now = () => new Date().toISOString() } = {}) {
        this.storage = storage;
        this.key = key;
        this.now = now;
    }

    save(state) {
        const envelope = {
            version: SAVE_VERSION,
            worldId: String(state.worldId ?? CAFE_WORLD_ID),
            worldVersion: Number(state.worldVersion ?? 1),
            savedAt: this.now(),
            state: clone(state),
        };
        envelope.checksum = checksum({
            version: envelope.version,
            worldId: envelope.worldId,
            worldVersion: envelope.worldVersion,
            savedAt: envelope.savedAt,
            state: envelope.state,
        });
        this.storage?.setItem?.(this.key, JSON.stringify(envelope));
        return Object.freeze(clone(envelope));
    }

    load({ worldId = null, maxWorldVersion = Infinity } = {}) {
        const raw = this.storage?.getItem?.(this.key);
        if (!raw) return null;
        try {
            const envelope = JSON.parse(raw);
            const expected = checksum({
                version: envelope.version,
                worldId: envelope.worldId,
                worldVersion: envelope.worldVersion,
                savedAt: envelope.savedAt,
                state: envelope.state,
            });
            if (envelope.version !== SAVE_VERSION || envelope.checksum !== expected) return null;
            if (worldId && envelope.worldId !== worldId) return null;
            if (Number(envelope.worldVersion) > Number(maxWorldVersion)) return null;
            return Object.freeze(clone(envelope.state));
        } catch {
            return null;
        }
    }

    clear() {
        this.storage?.removeItem?.(this.key);
    }
}

export { SAVE_VERSION as OPEN_WORLD_SAVE_VERSION, checksum as openWorldSaveChecksum };
