export const DEFAULT_BINDINGS = Object.freeze({
    moveUp: 'w', moveDown: 's', moveLeft: 'a', moveRight: 'd', run: 'shift', jump: 'space', dash: 'x', dodge: 'c', slide: 'g',
    wave: 'v', celebrate: 'o', ability: 'q', interact: 'enter', speak: 'h', toggleMap: 'm', quickSave: 'f6',
});
export const BINDING_LABELS = Object.freeze({
    moveUp: 'حرکت بالا', moveDown: 'حرکت پایین', moveLeft: 'حرکت چپ', moveRight: 'حرکت راست', run: 'دویدن', jump: 'پرش', dash: 'دش', dodge: 'جاخالی', slide: 'اسلاید',
    wave: 'سلام', celebrate: 'شادی', ability: 'توانایی ویژه', interact: 'تعامل', speak: 'گفتگو', toggleMap: 'نقشه', quickSave: 'ذخیره سریع',
});
export function keyboardToken(event) {
    const code = String(event.code ?? '');
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (code.startsWith('Shift')) return 'shift';
    if (code === 'Space' || event.key === ' ') return 'space';
    return String(code || event.key || '').toLowerCase();
}
export function keyLabel(key) { return ({ space: 'Space', shift: 'Shift', enter: 'Enter' })[key] ?? key.toUpperCase(); }
function availableStorage() { try { return globalThis.localStorage; } catch { return null; } }
export default class InputBindingStore {
    constructor(storage = availableStorage()) {
        this.storage = storage; this.key = 'demian.controls.v1'; this.bindings = { ...DEFAULT_BINDINGS };
        try {
            const saved = JSON.parse(storage?.getItem(this.key) ?? 'null');
            if (saved && Object.keys(DEFAULT_BINDINGS).every(name => this.valid(saved[name])) && new Set(Object.values(saved)).size === Object.keys(DEFAULT_BINDINGS).length)
                this.bindings = Object.fromEntries(Object.keys(DEFAULT_BINDINGS).map(name => [name, saved[name]]));
        } catch {}
    }
    valid(key) { return typeof key === 'string' && !['f', 'r'].includes(key) && /^(?:[a-z0-9]|space|shift|enter|f[1-4]|f[6-9]|f10)$/.test(key); }
    set(action, key) {
        if (!(action in DEFAULT_BINDINGS) || !this.valid(key)) return { ok: false, reason: 'کلید دیگری انتخاب کن؛ جهت‌ها، Escape و F / R برای پیمایش و دوربین محفوظ‌اند.' };
        const conflict = Object.keys(this.bindings).find(name => name !== action && this.bindings[name] === key);
        if (conflict) return { ok: false, reason: `این کلید برای «${BINDING_LABELS[conflict]}» استفاده می‌شود.` };
        this.bindings[action] = key; return this.persist();
    }
    persist() {
        try { this.storage?.setItem(this.key, JSON.stringify(this.bindings)); return { ok: true, persisted: Boolean(this.storage) }; }
        catch { return { ok: true, persisted: false }; }
    }
    reset() { this.bindings = { ...DEFAULT_BINDINGS }; return this.persist(); }
    context(name, original) {
        if (!['OPEN_WORLD', 'DINO_RUN'].includes(name)) return original;
        const remap = (keys, action) => !(action in this.bindings) ? keys
            : [...new Set(keys.filter(key => key !== DEFAULT_BINDINGS[action]).concat(this.bindings[action]))];
        const actions = Object.fromEntries(Object.entries(original.actions ?? {}).map(([name, definition]) => [name, {
            ...definition, keys: remap(definition.keys, name === 'jumpHeld' ? 'jump' : name === 'duck' ? 'moveDown' : name),
        }]));
        const axes = original.axes && {
            x: { negative: remap(original.axes.x.negative, 'moveLeft'), positive: remap(original.axes.x.positive, 'moveRight') },
            z: { negative: remap(original.axes.z.negative, 'moveUp'), positive: remap(original.axes.z.positive, 'moveDown') },
        };
        return { ...original, actions, axes };
    }
}
