export default class PixelRenderQueue {
    constructor() { this.items = []; this.serial = 0; }
    add({ layer = 0, y = 0, draw }) { if (typeof draw === 'function') this.items.push({ layer, y, draw, serial: this.serial++ }); }
    flush(context) {
        this.items.sort((a, b) => (a.layer - b.layer) || (a.y - b.y) || (a.serial - b.serial));
        this.items.forEach((item) => item.draw(context));
        this.items.length = 0;
        this.serial = 0;
    }
}
