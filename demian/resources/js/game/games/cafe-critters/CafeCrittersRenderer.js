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
        const ratio = Math.min(1.25, this.context.services.performanceProfile?.maxPixelRatio ?? 1);
        this.context.renderer.setPresentationMode('smooth', { maxPixelRatio: ratio });
        this.scene.resize(ratio);
        const { viewportWidth: width, viewportHeight: height } = this.scene.camera;
        this.shadeSize = { width, height };
        this.shade = null;
    }

    render(light, dt) {
        const ctx = this.scene.begin({ clear: '#172a27', deltaTime: dt, atmosphere: light === 'moon' ? 'night' : 'day' });
        const { viewportWidth: width, viewportHeight: height } = this.scene.camera;
        if (!this.shade || this.shadeSize.width !== width || this.shadeSize.height !== height) {
            this.shadeSize = { width, height };
            this.shade = ctx.createLinearGradient(0, 0, 0, height);
            this.shade.addColorStop(0, '#172e28e8');
            this.shade.addColorStop(.58, '#172e28be');
            this.shade.addColorStop(1, '#122620f2');
        }
        ctx.fillStyle = this.shade;
        ctx.fillRect(0, 0, width, height);
        this.scene.end(ctx);
    }

    dispose() { this.scene.dispose(); }
}
