import { cellsFor } from './Tetrominoes.js';

export default class Piece {
    constructor(type, { x = 0, y = 0, rotation = 0 } = {}) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.rotation = ((rotation % 4) + 4) % 4;
    }

    clone(overrides = {}) {
        return new Piece(overrides.type ?? this.type, {
            x: overrides.x ?? this.x,
            y: overrides.y ?? this.y,
            rotation: overrides.rotation ?? this.rotation,
        });
    }

    cells() {
        return cellsFor(this.type, this.rotation).map(({ x, y }) => ({
            x: this.x + x,
            y: this.y + y,
        }));
    }

    moved(dx, dy) {
        return this.clone({ x: this.x + dx, y: this.y + dy });
    }

    rotated(direction = 1) {
        return this.clone({ rotation: this.rotation + direction });
    }
}
