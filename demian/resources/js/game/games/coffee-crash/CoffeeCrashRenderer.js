import CafeGameRenderer2D from '../../rendering2d/CafeGameRenderer2D.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../../shared/cafe/CafeReferenceLayout.js';

export default class CoffeeCrashRenderer {
    constructor(context) {
        this.context = context;
        this.scene = new CafeGameRenderer2D(context, { bounds: CAFE_BOUNDS, staticColliders: CAFE_STATIC_COLLIDERS }, { follow: false });
    }
    resize() { this.scene.resize(); this.frameKey = null; }
    render(dt) {
        const { width, height } = this.context.renderer.logicalDimensions();
        this.scene.cafe.prepare(this.scene.camera);
        const key = `${width}:${height}:${this.scene.cafe.revision}:${this.context.renderer.surfaceRevision}`;
        if (key === this.frameKey) return;
        const ctx = this.scene.begin({ clear: '#273b30', deltaTime: dt, atmosphere: 'day' });
        ctx.fillStyle = '#273b30cc';
        ctx.fillRect(0, 0, width, height);
        this.scene.end(ctx);
        this.frameKey = key;
    }
    dispose() { this.scene.dispose(); }
}
