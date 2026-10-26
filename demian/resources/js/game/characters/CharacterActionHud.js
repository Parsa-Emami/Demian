import { keyLabel } from '../input/InputBindingStore.js';
const PAD_LABELS = { jump: 'A', dash: 'X', dodge: 'B', slide: 'L3', wave: 'LT', ability: 'LB', interact: 'Y', run: 'RB', celebrate: 'RT', speak: 'R3', toggleMap: 'View', quickSave: '—' };
const ACTION_NAMES = { dash: 'دش', dodge: 'جاخالی', slide: 'اسلاید', takeoff: 'پرش', jump: 'پرش', fall: 'فرود', land: 'فرود', run: 'دویدن', sprint: 'دویدن', wave: 'سلام', celebrate: 'شادی' };
export default class CharacterActionHud {
    constructor(root, input) {
        this.root = root; this.input = input; this.element = root?.querySelector('[data-action-status]');
        this.buttons = [...root.querySelectorAll('[data-input-press="dash"], [data-input-press="dodge"], [data-input-press="slide"]')];
        this.refreshPrompts = this.refreshPrompts.bind(this);
        document.addEventListener('input:device-changed', this.refreshPrompts); document.addEventListener('input:bindings-changed', this.refreshPrompts); this.refreshPrompts();
    }
    refreshPrompts() {
        const device = this.input?.device ?? 'keyboard';
        for (const label of this.root.querySelectorAll('[data-action-key]')) {
            const action = label.dataset.actionKey;
            label.textContent = device === 'gamepad' ? PAD_LABELS[action] ?? '' : keyLabel(this.input?.bindings.bindings[action] ?? ''); label.hidden = device === 'touch';
        }
    }
    update(entity) {
        if (!entity) return;
        const remaining = Math.max(0, entity.actionCooldown ?? 0);
        for (const button of this.buttons) {
            const unavailable = remaining > .12; button.disabled = unavailable; button.setAttribute('aria-disabled', String(unavailable));
            button.style.setProperty('--action-ready', String(1 - Math.min(1, remaining / ((entity.actionDuration || .62) + .16))));
        }
        if (!this.element) return;
        const text = remaining > .01 ? `${ACTION_NAMES[entity.state] ?? 'حرکت'} · ${remaining.toFixed(1)}ث` : ACTION_NAMES[entity.state] ?? 'آمادهٔ حرکت';
        if (this.element.textContent !== text) this.element.textContent = text; this.element.dataset.busy = String(remaining > 0);
    }
    dispose() {
        document.removeEventListener('input:device-changed', this.refreshPrompts); document.removeEventListener('input:bindings-changed', this.refreshPrompts);
        for (const button of this.buttons) { button.disabled = false; button.removeAttribute('aria-disabled'); }
    }
}
