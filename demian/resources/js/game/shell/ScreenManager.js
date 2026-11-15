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
        this.syncAccessibility();
        this.eventBus?.emit('screen:changed', { id: next.id, layer: 'primary' });
        return next;
    }

    async presentModal(next, payload) {
        const currentId = this.modalStack.at(-1);
        if (currentId === next.id) {
            this.syncAccessibility();
            return next.refresh(payload);
        }

        // Reopening a covered modal reveals the existing instance rather than
        // duplicating it in the stack (which would strand focus on close).
        if (this.modalStack.includes(next.id)) {
            while (this.modalStack.at(-1) !== next.id) {
                await this.closeTopModalNow('reveal');
            }
            this.syncAccessibility();
            return next.refresh(payload);
        }

        this.modalStack.push(next.id);
        try {
            await next.open(payload);
        } catch (error) {
            this.modalStack.pop();
            this.syncAccessibility();
            throw error;
        }
        this.syncAccessibility();
        this.eventBus?.emit('screen:changed', { id: next.id, layer: 'modal' });
        return next;
    }

    // A single topmost dialog is operable; covered dialogs and menu screens
    // remain visible for transitions but are absent from keyboard/AT traversal.
    syncAccessibility() {
        const topId = this.modalStack.at(-1);
        for (const screen of this.screens.values()) {
            if (!screen.active || !screen.element) continue;
            const operable = screen.layer === 'modal'
                ? screen.id === topId
                : screen.id === this.primaryId && !topId;
            screen.element.inert = !operable;
            screen.element.setAttribute('aria-hidden', String(!operable));
            if (screen.layer === 'modal' && screen.element.style) {
                // A top dialog may appear earlier in the DOM than a covered
                // dialog (e.g. motion comparison vs pause); tokenized visual
                // stacking must follow the accessibility stack, not DOM order.
                screen.element.style.zIndex = operable
                    ? 'var(--z-shell-modal)' : 'var(--z-shell-screen)';
            }
        }
    }

    async closeTopModalNow(reason) {
        const id = this.modalStack.at(-1);
        if (!id) return null;
        const screen = this.get(id);
        const restoreFocus = screen.returnFocusTarget;
        await screen.close(reason);
        this.modalStack.pop();
        this.syncAccessibility();

        const nextId = this.modalStack.at(-1) ?? this.primaryId;
        const next = nextId ? this.get(nextId) : null;
        if (restoreFocus?.isConnected
            && next?.element?.contains?.(restoreFocus)) {
            restoreFocus.focus?.({ preventScroll: true });
        } else if (next?.active) {
            next.focusInitialElement?.();
        }
        return screen;
    }

    close(id, reason = 'dismiss') {
        return this.enqueue(async () => {
            const screen = this.get(id);
            if (screen.layer === 'modal' && this.modalStack.includes(id)) {
                // Closing a covered modal also dismisses all descendants.
                while (this.modalStack.includes(id)) {
                    await this.closeTopModalNow(reason);
                }
            } else {
                await screen.close(reason);
                if (screen.layer === 'primary' && this.primaryId === id) {
                    this.primaryId = null;
                }
                this.syncAccessibility();
            }
            return screen;
        });
    }

    closeTopModal(reason = 'dismiss') {
        return this.enqueue(() => this.closeTopModalNow(reason));
    }

    async closeModals(reason = 'dismiss') {
        while (this.modalStack.length > 0) {
            await this.closeTopModalNow(reason);
        }
    }

    hideAll(reason = 'playing') {
        return this.enqueue(async () => {
            await this.closeModals(reason);
            if (this.primaryId) {
                await this.get(this.primaryId).close(reason);
                this.primaryId = null;
            }
            this.syncAccessibility();
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
