import CafeGameRenderer2D from '../../rendering2d/CafeGameRenderer2D.js';
import { CAFE_STATIC_COLLIDERS } from '../../shared/cafe/CafeReferenceLayout.js';

const WINDOW_ROOM = {
    bounds: { minX: -14.7, maxX: 14.7, minZ: -26, maxZ: -7 },
    staticColliders: CAFE_STATIC_COLLIDERS,
};

export default class CafeCrittersRenderer {
    constructor(context) {
        this.context = context;
        this.scene = new CafeGameRenderer2D(context, WINDOW_ROOM, { follow: false });
    }

    resize() {
        this.scene.resize();
        this.frameKey = null;
    }

    render(light, dt) {
        const { width, height } = this.context.renderer.logicalDimensions();
        this.scene.cafe.prepare(this.scene.camera);
        const key = `${width}:${height}:${light}:${this.scene.cafe.revision}:${this.context.renderer.surfaceRevision}`;
        if (key === this.frameKey) return;
        const ctx = this.scene.begin({ clear: '#172a27', deltaTime: dt, atmosphere: light === 'moon' ? 'night' : 'day' });
        if (!this.shade || this.shadeHeight !== height) {
            this.shadeHeight = height;
            this.shade = ctx.createLinearGradient(0, 0, 0, height);
            this.shade.addColorStop(0, '#172e28e8');
            this.shade.addColorStop(.58, '#172e28be');
            this.shade.addColorStop(1, '#122620f2');
        }
        ctx.fillStyle = this.shade;
        ctx.fillRect(0, 0, width, height);
        this.scene.end(ctx);
        this.frameKey = key;
    }

    dispose() { this.scene.dispose(); }
}
