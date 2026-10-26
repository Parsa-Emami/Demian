import { BINDING_LABELS, keyLabel, keyboardToken } from './InputBindingStore.js';
export default class ControlBindingPanel {
    constructor(element, input) {
        this.element = element; this.input = input; this.pending = null; this.status = element?.querySelector('[data-binding-status]');
        this.onClick = event => {
            const action = event.target.closest('[data-bind-action]')?.dataset.bindAction;
            if (action) { this.cancel(); this.pending = action; this.render(); this.say('کلید دلخواه را بزن؛ Escape برای لغو.'); }
            if (event.target.closest('[data-bind-reset]')) {
                this.cancel(); const result = this.input.bindings.reset(); this.input.onBlur(); this.render();
                this.say(result.persisted ? 'کلیدهای پیش‌فرض ذخیره شدند.' : 'کلیدها بازنشانی شدند؛ ذخیره‌سازی مرورگر در دسترس نیست.');
            }
        };
        this.onKeyDown = event => {
            if (!this.pending || !this.element.closest('[data-screen]')?.matches(':not([hidden])')) return;
            event.preventDefault(); event.stopImmediatePropagation(); if (event.repeat) return;
            if (event.key === 'Escape') { this.cancel(); this.say('تغییر کلید لغو شد.'); return; }
            if (event.ctrlKey || event.metaKey || event.altKey) { this.say('یک کلید بدون Ctrl، Alt یا Command انتخاب کن.'); return; }
            const result = this.input.bindings.set(this.pending, keyboardToken(event));
            if (!result.ok) { this.say(result.reason); return; }
            this.input.onBlur(); this.cancel(); this.say(result.persisted ? 'کلید جدید ذخیره شد.' : 'کلید اعمال شد؛ پس از بستن مرورگر ماندگار نیست.');
        };
        element?.addEventListener('click', this.onClick); window.addEventListener('keydown', this.onKeyDown, true); this.render();
    }
    say(text) { if (this.status) this.status.textContent = text; }
    cancel() { this.pending = null; this.render(); }
    render() {
        const host = this.element?.querySelector('[data-binding-list]'); if (!host || !this.input) return;
        if (!host.children.length) for (const [action, label] of Object.entries(BINDING_LABELS)) {
            const row = document.createElement('div'); row.className = 'control-binding';
            const name = document.createElement('span'); name.textContent = label;
            const button = document.createElement('button'); button.type = 'button'; button.dataset.bindAction = action;
            row.append(name, button); host.append(row);
        }
        for (const button of host.querySelectorAll('[data-bind-action]')) {
            const action = button.dataset.bindAction; button.textContent = action === this.pending ? '…' : keyLabel(this.input.bindings.bindings[action]);
            button.setAttribute('aria-label', `${BINDING_LABELS[action]}: ${button.textContent}؛ تغییر کلید`); button.setAttribute('aria-pressed', String(action === this.pending));
        }
        document.dispatchEvent(new CustomEvent('input:bindings-changed'));
    }
    dispose() { this.element?.removeEventListener('click', this.onClick); window.removeEventListener('keydown', this.onKeyDown, true); }
}
