export default class InteractionPrompt {
    constructor({ host, eventBus, animation = null } = {}) {
        this.host = host;
        this.eventBus = eventBus;
        this.animation = animation;
        this.element = null;
        this.unsubscribe = null;
        this.visible = false;
    }

    mount() {
        if (!this.host || this.element) return;
        this.element = document.createElement('div');
        this.element.className = 'interaction-prompt';
        this.element.hidden = true;
        this.element.setAttribute('role', 'status');
        this.element.setAttribute('aria-live', 'polite');
        this.element.innerHTML = `
            <span class="interaction-prompt__key" aria-hidden="true">ENTER</span>
            <span class="interaction-prompt__copy">
                <strong data-interaction-label></strong>
                <small data-interaction-hint></small>
            </span>
        `;
        this.host.appendChild(this.element);
        this.unsubscribe = this.eventBus?.on('interaction:prompt-changed', (payload) => this.update(payload));
    }

    update({ interactable, visible } = {}) {
        if (!this.element) return;
        const shouldShow = Boolean(visible && interactable);
        this.element.querySelector('[data-interaction-label]').textContent = interactable?.label ?? '';
        const hint = this.element.querySelector('[data-interaction-hint]');
        hint.textContent = interactable?.hint ?? '';
        hint.hidden = !interactable?.hint;

        if (shouldShow === this.visible) return;
        this.visible = shouldShow;
        if (shouldShow) {
            this.element.hidden = false;
            this.animation?.reveal?.(this.element, { duration: 180 });
        } else {
            this.element.hidden = true;
        }
    }

    dispose() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.element?.remove();
        this.element = null;
        this.host = null;
        this.eventBus = null;
    }
}
