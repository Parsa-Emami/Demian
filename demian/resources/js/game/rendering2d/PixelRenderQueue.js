export default class PixelRenderQueue {
    constructor() { this.items = []; this.serial = 0; }
    add({ layer = 0, y = 0, draw }) {
        if (typeof draw !== 'function') return false;
        // Invalid body positions must not corrupt stable painter ordering.
        this.items.push({ layer: Number.isFinite(layer) ? layer : 0,
            y: Number.isFinite(y) ? y : 0, draw, serial: this.serial++ });
        return true;
    }
    flush(context) {
        this.items.sort((a, b) => (a.layer - b.layer) || (a.y - b.y) || (a.serial - b.serial));
        this.items.forEach((item) => item.draw(context));
        this.items.length = 0;
        this.serial = 0;
    }
}
