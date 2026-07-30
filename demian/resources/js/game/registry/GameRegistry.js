function assertDefinition(id, definition) {
    if (!id || typeof id !== 'string') {
        throw new TypeError('Game id must be a non-empty string.');
    }

    if (!definition || typeof definition.loader !== 'function') {
        throw new TypeError(`Game "${id}" must provide a lazy loader function.`);
    }
}

function normalizeDefinition(id, definition) {
    return Object.freeze({
        id,
        title: definition.title ?? id,
        inputContext: definition.inputContext ?? 'MENU',
        orientation: definition.orientation ?? 'any',
        loader: definition.loader,
        metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
    });
}

/**
 * Lazy game catalogue. Modules are cached after their first import, while a
 * fresh game instance is created for every launch.
 */
export default class GameRegistry {
    constructor(definitions = {}) {
        this.definitions = new Map();
        this.moduleCache = new Map();

        Object.entries(definitions).forEach(([id, definition]) => {
            this.register(id, definition);
        });
    }

    register(id, definition) {
        assertDefinition(id, definition);

        if (this.definitions.has(id)) {
            throw new Error(`Game "${id}" is already registered.`);
        }

        this.definitions.set(id, normalizeDefinition(id, definition));
        return this;
    }

    has(id) {
        return this.definitions.has(id);
    }

    get(id) {
        const definition = this.definitions.get(id);

        if (!definition) {
            throw new Error(`Game "${id}" is not registered.`);
        }

        return definition;
    }

    list() {
        return [...this.definitions.values()];
    }

    async load(id) {
        const definition = this.get(id);

        if (!this.moduleCache.has(id)) {
            this.moduleCache.set(id, Promise.resolve().then(() => definition.loader()));
        }

        try {
            return await this.moduleCache.get(id);
        } catch (error) {
            this.moduleCache.delete(id);
            throw error;
        }
    }

    async create(id) {
        const module = await this.load(id);
        const GameClass = module?.default ?? module?.Game;

        if (typeof GameClass !== 'function') {
            throw new TypeError(`Game module "${id}" does not export a game class.`);
        }

        const game = new GameClass();
        const lifecycleMethods = [
            'preload',
            'enter',
            'startSession',
            'applySettings',
            'fixedUpdate',
            'update',
            'render',
            'pause',
            'resume',
            'exit',
            'dispose',
        ];

        lifecycleMethods.forEach((method) => {
            if (typeof game[method] !== 'function') {
                throw new TypeError(`Game "${id}" is missing lifecycle method ${method}().`);
            }
        });

        return game;
    }
}
