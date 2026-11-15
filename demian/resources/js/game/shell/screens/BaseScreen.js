const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function visibleFocusable(element) {
    return [...element.querySelectorAll(FOCUSABLE_SELECTOR)].filter(candidate =>
        candidate.getAttribute('aria-disabled') !== 'true'
        && !candidate.closest('[hidden], [inert], [aria-hidden="true"]')
        && (typeof candidate.getClientRects !== 'function' || candidate.getClientRects().length > 0)
    );
}

import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';

export default class BaseScreen {
    constructor({ id, element, animation, layer = 'primary' }) {
        if (!id || !element) {
            throw new Error('Screen requires an id and root element.');
        }

        this.id = id;
        this.element = element;
        this.animation = animation;
        this.layer = layer;
        assignUiLayer(
            this.element,
            layer === 'modal' ? UI_LAYER.SHELL_MODAL : UI_LAYER.SHELL_SCREEN
        );
        this.active = false;
        this.payload = null;
        this.returnFocusTarget = null;
        this.onModalKeyDown = this.onModalKeyDown.bind(this);
    }

    async open(payload = {}) {
        this.payload = payload;
        if (this.layer === 'modal') {
            this.returnFocusTarget = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        }

        await this.beforeOpen(payload);
        this.element.hidden = false;
        this.element.setAttribute('aria-hidden', 'false');
        this.element.dataset.screenState = 'entering';
        this.active = true;
        if (this.layer === 'modal') {
            this.element.addEventListener('keydown', this.onModalKeyDown);
        }

        const motion = this.animation?.animate(this.element, {
            opacity: [0, 1],
            y: [12, 0],
            // Boot/loading indicator transitions never add fixed waits
            // after all critical assets are already ready.
            duration: this.layer === 'modal' ? 220
                : ['boot', 'loading'].includes(this.id) ? 0 : 160,
            ease: 'out(4)',
        });
        await this.animation?.finished?.(motion);
        this.element.dataset.screenState = 'active';
        await this.afterOpen(payload);
        this.focusInitialElement();
        return this;
    }

    async refresh(payload = {}) {
        this.payload = payload;
        await this.beforeOpen(payload);
        await this.afterOpen(payload);
        this.focusInitialElement();
        return this;
    }

    async close(reason = 'replace') {
        if (!this.active) {
            return this;
        }

        await this.beforeClose(reason);
        this.element.dataset.screenState = 'leaving';
        const motion = this.animation?.animate(this.element, {
            opacity: [1, 0],
            y: [0, this.layer === 'modal' ? 8 : -8],
            duration: this.layer === 'modal' ? 160 : 0,
            ease: 'in(2)',
        });
        await this.animation?.finished?.(motion);
        this.element.hidden = true;
        this.element.setAttribute('aria-hidden', 'true');
        this.element.dataset.screenState = 'hidden';
        this.active = false;
        if (this.layer === 'modal') {
            this.element.removeEventListener('keydown', this.onModalKeyDown);
        }
        await this.afterClose(reason);

        if (this.layer === 'modal' && this.returnFocusTarget?.isConnected) {
            this.returnFocusTarget.focus?.({ preventScroll: true });
        }
        this.returnFocusTarget = null;
        return this;
    }

    focusInitialElement() {
        const candidates = visibleFocusable(this.element);
        const target = candidates.find(element => element.hasAttribute('data-screen-autofocus'))
            ?? candidates[0];
        if (target) {
            target.focus({ preventScroll: true });
        } else if (this.layer === 'modal') {
            // Keep keyboard focus inside an informational dialog with no actions.
            const fallback = this.element.querySelector('[role="dialog"]') ?? this.element;
            fallback.setAttribute('tabindex', '-1');
            fallback.focus?.({ preventScroll: true });
        }
    }

    onModalKeyDown(event) {
        if (!this.active || event.key !== 'Tab' || event.defaultPrevented) return;
        const candidates = visibleFocusable(this.element);
        if (candidates.length === 0) {
            event.preventDefault();
            this.focusInitialElement();
            return;
        }
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || !this.element.contains(current))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (current === last || !this.element.contains(current))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
        }
    }

    async beforeOpen(_payload) {}
    async afterOpen(_payload) {}
    async beforeClose(_reason) {}
    async afterClose(_reason) {}
    dispose() {
        if (this.layer === 'modal') {
            this.element.removeEventListener('keydown', this.onModalKeyDown);
        }
        this.returnFocusTarget = null;
    }
}
