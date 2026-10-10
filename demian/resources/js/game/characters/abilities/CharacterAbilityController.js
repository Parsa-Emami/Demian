/** Small, renderer-independent lifecycle for authored character abilities. */
export default class CharacterAbilityController {
    constructor(atlas = {}) {
        this.abilities = Object.freeze((Array.isArray(atlas.abilities) ? atlas.abilities : [])
            .filter((ability) => ability?.id && atlas.animations?.[ability.animation]
                && Number.isFinite(Number(ability.duration)) && Number(ability.duration) > 0
                && Number.isFinite(Number(ability.cooldown)) && Number(ability.cooldown) >= Number(ability.duration))
            .map((ability) => Object.freeze({ ...ability })));
        this.cooldowns = new Map();
        this.active = null;
        this.elapsed = 0;
    }

    get primary() { return this.abilities[0] ?? null; }

    remaining(id = this.primary?.id) { return this.cooldowns.get(id) ?? 0; }

    activate({ id = this.primary?.id, grounded = true, locked = false } = {}) {
        const ability = this.abilities.find((entry) => entry.id === id);
        if (!ability || !grounded || locked || this.active || this.remaining(id) > 0) return null;
        this.active = ability;
        this.elapsed = 0;
        this.cooldowns.set(id, Number(ability.cooldown));
        return ability;
    }

    update(deltaTime) {
        const dt = Number(deltaTime);
        if (!Number.isFinite(dt) || dt <= 0) return;
        for (const [id, remaining] of this.cooldowns) {
            const next = Math.max(0, remaining - dt);
            if (next === 0) this.cooldowns.delete(id);
            else this.cooldowns.set(id, next);
        }
        if (this.active) {
            this.elapsed += dt;
            if (this.elapsed >= Number(this.active.duration)) this.active = null;
        }
    }

    visualState() {
        return this.active ? { ability: this.active, elapsed: this.elapsed,
            progress: Math.min(1, this.elapsed / Number(this.active.duration)) } : null;
    }

    cancel() { this.active = null; this.elapsed = 0; }
}
