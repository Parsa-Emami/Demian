const DEFAULT_STORAGE_KEY = 'demian.platform.settings.v1';

function defaultStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

export const DEFAULT_SETTINGS = Object.freeze({
    version: 1,
    motion: 'system',
    quality: 'auto',
    hudVisible: true,
    hintsVisible: true,
    soundEnabled: true,
    musicEnabled: true,
    interfaceDensity: 'comfortable',
});

const ENUMS = Object.freeze({
    motion: new Set(['system', 'full', 'reduced']),
    quality: new Set(['auto', 'performance', 'balanced', 'high']),
    interfaceDensity: new Set(['comfortable', 'compact']),
});

function clone(value) {
    return { ...value };
}

function normalize(candidate = {}) {
    const next = clone(DEFAULT_SETTINGS);

    Object.entries(ENUMS).forEach(([key, values]) => {
        if (values.has(candidate[key])) {
            next[key] = candidate[key];
        }
    });

    ['hudVisible', 'hintsVisible', 'soundEnabled', 'musicEnabled'].forEach((key) => {
        if (typeof candidate[key] === 'boolean') {
            next[key] = candidate[key];
        }
    });

    return Object.freeze(next);
}

/**
 * Versioned, validated settings store. It has no DOM dependency and can be
 * replaced with a remote/profile-backed adapter later without changing games.
 */
export default class SettingsStore {
    constructor({
        storage = defaultStorage(),
        storageKey = DEFAULT_STORAGE_KEY,
        mediaQuery = typeof window !== 'undefined'
            ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
            : null,
    } = {}) {
        this.storage = storage;
        this.storageKey = storageKey;
        this.mediaQuery = mediaQuery;
        this.listeners = new Set();
        this.state = this.read();
        this.onSystemMotionChanged = this.onSystemMotionChanged.bind(this);
        this.mediaQuery?.addEventListener?.('change', this.onSystemMotionChanged);
    }

    read() {
        try {
            const raw = this.storage?.getItem(this.storageKey);
            return raw ? normalize(JSON.parse(raw)) : normalize();
        } catch {
            return normalize();
        }
    }

    snapshot() {
        return this.state;
    }

    resolvedReducedMotion() {
        if (this.state.motion === 'reduced') {
            return true;
        }

        if (this.state.motion === 'full') {
            return false;
        }

        return Boolean(this.mediaQuery?.matches);
    }

    update(patch = {}) {
        const previous = this.state;
        const next = normalize({ ...previous, ...patch });
        const changed = Object.keys(next).some((key) => next[key] !== previous[key]);

        if (!changed) {
            return next;
        }

        this.state = next;
        this.persist();
        this.emit({ previous, current: next, source: 'user' });
        return next;
    }

    reset() {
        const previous = this.state;
        this.state = normalize();
        this.persist();
        this.emit({ previous, current: this.state, source: 'reset' });
        return this.state;
    }

    subscribe(listener, { immediate = false } = {}) {
        if (typeof listener !== 'function') {
            throw new TypeError('Settings listener must be a function.');
        }

        this.listeners.add(listener);
        if (immediate) {
            listener({ previous: this.state, current: this.state, source: 'initial' });
        }

        return () => this.listeners.delete(listener);
    }

    persist() {
        try {
            this.storage?.setItem(this.storageKey, JSON.stringify(this.state));
        } catch {
            // Private mode and embedded browsers may reject localStorage writes.
        }
    }

    emit(change) {
        this.listeners.forEach((listener) => listener(change));
    }

    onSystemMotionChanged() {
        if (this.state.motion === 'system') {
            this.emit({ previous: this.state, current: this.state, source: 'system' });
        }
    }

    dispose() {
        this.mediaQuery?.removeEventListener?.('change', this.onSystemMotionChanged);
        this.listeners.clear();
    }
}
