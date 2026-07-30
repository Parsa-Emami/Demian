export default class BaseScreen {
    constructor({ id, element, animation, layer = 'primary' }) {
        if (!id || !element) {
            throw new Error('Screen requires an id and root element.');
        }

        this.id = id;
        this.element = element;
        this.animation = animation;
        this.layer = layer;
        this.active = false;
        this.payload = null;
        this.returnFocusTarget = null;
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

        const motion = this.animation?.animate(this.element, {
            opacity: [0, 1],
            y: [12, 0],
            duration: this.layer === 'modal' ? 220 : 320,
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
            duration: 160,
            ease: 'in(2)',
        });
        await this.animation?.finished?.(motion);
        this.element.hidden = true;
        this.element.setAttribute('aria-hidden', 'true');
        this.element.dataset.screenState = 'hidden';
        this.active = false;
        await this.afterClose(reason);

        if (this.layer === 'modal' && this.returnFocusTarget?.isConnected) {
            this.returnFocusTarget.focus?.({ preventScroll: true });
        }
        this.returnFocusTarget = null;
        return this;
    }

    focusInitialElement() {
        const target = this.element.querySelector(
            '[data-screen-autofocus], button:not([disabled]):not([aria-disabled="true"]), [href], input, select'
        );
        target?.focus?.({ preventScroll: true });
    }

    async beforeOpen(_payload) {}
    async afterOpen(_payload) {}
    async beforeClose(_reason) {}
    async afterClose(_reason) {}
    dispose() {
        this.returnFocusTarget = null;
    }
}
