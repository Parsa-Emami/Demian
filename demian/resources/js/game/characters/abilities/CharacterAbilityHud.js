/** Reuses the world action tray and hides the control for characters without an ability. */
export default class CharacterAbilityHud {
    constructor(root) {
        this.button = root?.querySelector('[data-character-ability]') ?? null;
        this.hint = root?.querySelector('[data-character-ability-hint]') ?? null;
    }

    update(entity) {
        const controller = entity?.abilityController;
        const ability = controller?.primary;
        if (this.hint) this.hint.hidden = !ability;
        if (!this.button) return;
        this.button.hidden = !ability;
        if (!ability) return;
        const remaining = Math.ceil(controller.remaining());
        const text = remaining > 0 ? `${ability.label} · ${remaining}ث` : ability.label;
        if (this.button.textContent !== text) this.button.textContent = text;
        this.button.disabled = remaining > 0 || !entity.grounded || entity.stateLock > 0;
        this.button.setAttribute('aria-label', `${ability.label} · Q${remaining > 0 ? ` · ${remaining} ثانیه انتظار` : ''}`);
        this.button.setAttribute('aria-disabled', String(this.button.disabled));
    }

    dispose() {
        if (this.button) this.button.hidden = true;
        if (this.hint) this.hint.hidden = true;
        this.button = null; this.hint = null;
    }
}
