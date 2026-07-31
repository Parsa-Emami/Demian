import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
    })[character]);
}

export default class InventoryPanel {
    constructor({ host, registry, onEquip } = {}) {
        this.host = host;
        this.registry = registry;
        this.onEquip = onEquip;
        this.element = null;
        this.onClick = this.onClick.bind(this);
    }

    mount() {
        if (this.element || !this.host) return;
        const element = document.createElement('aside');
        element.className = 'role-play-side-panel role-play-inventory-panel';
        element.dir = 'rtl';
        element.hidden = true;
        assignUiLayer(element, UI_LAYER.LOCAL_RAISED);
        element.addEventListener('click', this.onClick);
        this.host.appendChild(element);
        this.element = element;
    }

    onClick(event) {
        const button = event.target.closest('[data-rp-equip]');
        if (button) this.onEquip?.(button.dataset.rpEquip);
    }

    show(snapshot, equipment = {}) {
        if (!this.element) this.mount();
        if (!this.element) return;

        this.element.hidden = false;
        this.element.innerHTML = `
            <header><small>INVENTORY</small><strong>کوله‌پشتی</strong><b>◈ ${snapshot.coins}</b></header>
            <div class="role-play-equipment">
                ${Object.entries(equipment).map(([slot, id]) => `
                    <span><small>${escapeHtml(slot)}</small><b>${escapeHtml(id ? this.registry.get(id).title : '—')}</b></span>
                `).join('')}
            </div>
            <div class="role-play-inventory-grid">
                ${snapshot.stacks.map((stack) => {
                    const item = this.registry.get(stack.itemId);
                    return `
                        <button type="button" data-rp-equip="${escapeHtml(stack.itemId)}" ${item.equipSlot ? '' : 'disabled'}>
                            <strong>${escapeHtml(item.title)}</strong><small>× ${stack.quantity}</small><i>${item.equipSlot ? 'تجهیز' : 'آیتم'}</i>
                        </button>
                    `;
                }).join('') || '<p class="is-empty">کوله‌پشتی خالی است.</p>'}
            </div>
        `;
    }

    hide() { if (this.element) this.element.hidden = true; }
    toggle(snapshot, equipment) { this.element?.hidden === false ? this.hide() : this.show(snapshot, equipment); }

    dispose() {
        this.element?.removeEventListener('click', this.onClick);
        this.element?.remove();
        this.element = null;
    }
}
