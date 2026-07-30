export default class ItemRegistry {
    constructor(items = []) { this.items = new Map(); items.forEach((item) => this.register(item)); }
    register(item) {
        if (!item?.id || !item?.title) throw new TypeError('Item requires id and title.');
        if (this.items.has(item.id)) throw new Error(`Duplicate item: ${item.id}`);
        const normalized = Object.freeze({ stackSize: 1, weight: 0, value: 0, tags: [], ...item, stackSize: Math.max(1, Math.floor(item.stackSize ?? 1)) });
        this.items.set(normalized.id, normalized); return normalized;
    }
    get(id) { const item=this.items.get(id); if(!item) throw new Error(`Unknown item: ${id}`); return item; }
    has(id) { return this.items.has(id); }
    list() { return [...this.items.values()]; }
}
