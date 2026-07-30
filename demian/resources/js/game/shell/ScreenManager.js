/**
 * Serialized screen state machine with one primary screen and a modal stack.
 * Screen transitions cannot overlap, preventing focus and visibility races.
 */
export default class ScreenManager {
    constructor({ eventBus } = {}) {
        this.eventBus = eventBus;
        this.screens = new Map();
        this.primaryId = null;
        this.modalStack = [];
        this.queue = Promise.resolve();
        this.disposed = false;
    }

    register(screen) {
        if (!screen?.id) {
            throw new TypeError('A registered screen must expose an id.');
        }
        if (this.screens.has(screen.id)) {
            throw new Error(`Screen "${screen.id}" is already registered.`);
        }
        this.screens.set(screen.id, screen);
        return this;
    }

    get(id) {
        const screen = this.screens.get(id);
        if (!screen) {
            throw new Error(`Screen "${id}" is not registered.`);
        }
        return screen;
    }

    show(id, payload = {}) {
        return this.enqueue(async () => {
            const next = this.get(id);
            return next.layer === 'modal'
                ? this.presentModal(next, payload)
                : this.replacePrimary(next, payload);
        });
    }

    async replacePrimary(next, payload) {
        await this.closeModals('primary-change');
        const previous = this.primaryId ? this.get(this.primaryId) : null;
        if (previous?.id === next.id) {
            return previous.refresh(payload);
        }
        if (previous) {
            await previous.close('replace');
        }
        this.primaryId = next.id;
        await next.open(payload);
        this.eventBus?.emit('screen:changed', { id: next.id, layer: 'primary' });
        return next;
    }

    async presentModal(next, payload) {
        const currentId = this.modalStack.at(-1);
        if (currentId === next.id) {
            return next.refresh(payload);
        }
        this.modalStack.push(next.id);
        await next.open(payload);
        this.eventBus?.emit('screen:changed', { id: next.id, layer: 'modal' });
        return next;
    }

    close(id, reason = 'dismiss') {
        return this.enqueue(async () => {
            const screen = this.get(id);
            await screen.close(reason);
            if (screen.layer === 'primary' && this.primaryId === id) {
                this.primaryId = null;
            }
            this.modalStack = this.modalStack.filter((screenId) => screenId !== id);
            return screen;
        });
    }

    closeTopModal(reason = 'dismiss') {
        return this.enqueue(async () => {
            const id = this.modalStack.pop();
            if (!id) {
                return null;
            }
            const screen = this.get(id);
            await screen.close(reason);
            return screen;
        });
    }

    async closeModals(reason = 'dismiss') {
        while (this.modalStack.length > 0) {
            const id = this.modalStack.pop();
            await this.get(id).close(reason);
        }
    }

    hideAll(reason = 'playing') {
        return this.enqueue(async () => {
            await this.closeModals(reason);
            if (this.primaryId) {
                await this.get(this.primaryId).close(reason);
                this.primaryId = null;
            }
        });
    }

    enqueue(operation) {
        const task = this.queue.then(() => {
            if (this.disposed) {
                throw new Error('Disposed ScreenManager cannot transition.');
            }
            return operation();
        });
        this.queue = task.catch(() => undefined);
        return task;
    }

    async dispose() {
        if (this.disposed) {
            return;
        }
        await this.hideAll('dispose').catch(() => undefined);
        this.disposed = true;
        this.screens.forEach((screen) => screen.dispose?.());
        this.screens.clear();
    }
}
