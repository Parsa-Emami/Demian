import NavigationGrid from './NavigationGrid.js';

class NavigationScope {
    constructor(service, owner) {
        this.service = service;
        this.owner = owner;
        this.grids = new Map();
        this.disposed = false;
    }

    createGrid(id, options) {
        if (this.disposed) throw new Error('Navigation scope is disposed.');
        const qualified = `${this.owner}:${id}`;
        const grid = this.service.createGrid(qualified, options);
        this.grids.set(qualified, grid);
        return grid;
    }

    get(id) {
        return this.service.get(`${this.owner}:${id}`);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.grids.forEach((_grid, id) => this.service.remove(id));
        this.grids.clear();
    }
}

export default class NavigationService {
    constructor({ eventBus = null } = {}) {
        this.eventBus = eventBus;
        this.grids = new Map();
        this.scopeCounter = 0;
    }

    createScope(owner = 'navigation') {
        const normalized = String(owner || 'navigation').replace(/[^a-z0-9_-]+/gi, '-');
        this.scopeCounter += 1;
        return new NavigationScope(this, `${normalized}-${this.scopeCounter}`);
    }

    createGrid(id, options) {
        if (this.grids.has(id)) throw new Error(`Navigation grid already exists: ${id}`);
        const grid = new NavigationGrid(options);
        this.grids.set(id, grid);
        this.eventBus?.emit('navigation:grid-created', { id, grid });
        return grid;
    }

    get(id) {
        return this.grids.get(id) ?? null;
    }

    remove(id) {
        const grid = this.grids.get(id);
        if (!grid) return false;
        this.grids.delete(id);
        this.eventBus?.emit('navigation:grid-removed', { id, grid });
        return true;
    }

    dispose() {
        this.grids.clear();
        this.eventBus = null;
    }
}
