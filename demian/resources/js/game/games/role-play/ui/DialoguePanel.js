import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    })[character]);
}

export default class DialoguePanel {
    constructor({ host, onChoice, onClose } = {}) {
        this.host = host;
        this.onChoice = onChoice;
        this.onClose = onClose;
        this.element = null;
        this.onClick = this.onClick.bind(this);
    }

    mount() {
        if (this.element || !this.host) return;

        const element = document.createElement('section');
        element.className = 'role-play-dialogue';
        element.dir = 'rtl';
        element.hidden = true;
        assignUiLayer(element, UI_LAYER.LOCAL_RAISED);
        element.innerHTML = `
            <header>
                <small>CONVERSATION</small>
                <strong data-rp-speaker></strong>
                <button type="button" data-rp-dialogue-close aria-label="بستن">×</button>
            </header>
            <p data-rp-dialogue-text></p>
            <div data-rp-choices></div>
        `;
        element.addEventListener('click', this.onClick);
        this.host.appendChild(element);
        this.element = element;
    }

    onClick(event) {
        const choice = event.target.closest('[data-rp-choice]');
        if (choice) this.onChoice?.(choice.dataset.rpChoice);
        if (event.target.closest('[data-rp-dialogue-close]')) this.onClose?.();
    }

    show(snapshot) {
        if (!this.element) this.mount();
        if (!this.element) return;

        this.element.hidden = false;
        this.element.querySelector('[data-rp-speaker]').textContent = snapshot.speaker ?? '—';
        this.element.querySelector('[data-rp-dialogue-text]').textContent = snapshot.text ?? '';
        this.element.querySelector('[data-rp-choices]').innerHTML = snapshot.choices.map((choice, index) => `
            <button type="button" data-rp-choice="${escapeHtml(choice.id)}">
                <b>${index + 1}</b><span>${escapeHtml(choice.text)}</span>
            </button>
        `).join('');
    }

    hide() {
        if (this.element) this.element.hidden = true;
    }

    dispose() {
        this.element?.removeEventListener('click', this.onClick);
        this.element?.remove();
        this.element = null;
    }
}
