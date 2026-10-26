export function radialStick(x = 0, z = 0, deadzone = .18) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0, magnitude: 0 };
    const length = Math.hypot(x, z), magnitude = Math.min(1, Math.max(0, (length - deadzone) / (1 - deadzone)));
    return { x: length ? x / length * magnitude : 0, z: length ? z / length * magnitude : 0, magnitude };
}
const WORLD_BUTTONS = { 0: 'jump', 1: 'dodge', 2: 'dash', 3: 'interact', 4: 'ability', 5: 'run', 6: 'wave', 7: 'celebrate', 8: 'toggleMap', 10: 'slide', 11: 'speak' };
export default class GamepadSource {
    constructor() {
        this.held = new Set(); this.pressed = new Set(); this.buttons = new Set(); this.stick = radialStick();
        this.gated = true; this.index = null; this.uiDirection = null; this.uiRepeatAt = 0;
    }
    reset() {
        this.held.clear(); this.pressed.clear(); this.buttons.clear(); this.stick = radialStick(); this.gated = true;
        this.uiDirection = null; this.uiRepeatAt = 0;
    }
    poll(pads, context, now = 0) {
        const available = Array.from(pads ?? []).filter(pad => pad?.connected && pad.mapping === 'standard');
        const pad = available.find(entry => entry.index === this.index) ?? available[0];
        if (!pad) { this.index = null; this.reset(); return { active: false, ui: [] }; }
        if (this.index !== pad.index) { this.reset(); this.index = pad.index; }
        const buttons = new Set(pad.buttons.flatMap((button, index) => button?.pressed || button?.value > .5 ? [index] : []));
        const stick = radialStick(pad.axes[0], pad.axes[1]);
        const active = buttons.size > 0 || stick.magnitude > .05;
        if (this.gated) { if (!active) this.gated = false; return { active: false, ui: [] }; }
        const rising = new Set([...buttons].filter(button => !this.buttons.has(button)));
        this.buttons = buttons; this.stick = stick;
        if (buttons.has(14) || buttons.has(15)) this.stick.x = Number(buttons.has(15)) - Number(buttons.has(14));
        if (buttons.has(12) || buttons.has(13)) this.stick.z = Number(buttons.has(13)) - Number(buttons.has(12));
        const length = Math.hypot(this.stick.x, this.stick.z);
        if (length > 1) { this.stick.x /= length; this.stick.z /= length; }
        this.stick.magnitude = Math.min(1, length); this.held.clear();
        const mapping = context === 'DINO_RUN' ? { 0: 'jump', 12: 'jump', 1: 'duck', 13: 'duck' } : WORLD_BUTTONS;
        for (const [index, action] of Object.entries(mapping)) {
            if (buttons.has(Number(index))) this.held.add(action === 'jump' ? 'jumpHeld' : action);
            if (rising.has(Number(index))) this.pressed.add(action);
        }
        const ui = [];
        if (rising.has(9)) ui.push('pause');
        if (rising.has(0)) ui.push('confirm');
        if (rising.has(1)) ui.push('cancel');
        const direction = Math.abs(this.stick.z) > .55 ? (this.stick.z > 0 ? 'next' : 'previous') : Math.abs(this.stick.x) > .55 ? (this.stick.x > 0 ? 'next' : 'previous') : null;
        if (direction && (direction !== this.uiDirection || now >= this.uiRepeatAt)) { ui.push(direction); this.uiRepeatAt = now + (direction === this.uiDirection ? 150 : 400); }
        this.uiDirection = direction; return { active, ui };
    }
    action(name, mode, consume) {
        if (mode === 'hold') return this.held.has(name);
        const value = this.pressed.has(name); if (consume) this.pressed.delete(name); return value;
    }
}
