import PixelCamera2D from './PixelCamera2D.js';
import CafePixelRenderer from './CafePixelRenderer.js';
import PixelRenderQueue from './PixelRenderQueue.js';

export default class CafeGameRenderer2D {
    constructor(context, map, { follow = true, atmosphere = 'day', zoom = 10 } = {}) {
        this.context = context;
        this.map = map;
        this.pixelRatio = 1;
        this.followEnabled = follow;
        this.atmosphere = atmosphere;
        this.zoom = zoom;
        const dimensions = context.renderer.logicalDimensions();
        this.camera = new PixelCamera2D({
            bounds: map?.bounds,
            viewportWidth: dimensions.width,
            viewportHeight: dimensions.height,
            pixelsPerUnit: zoom,
        });
        this.cafe = new CafePixelRenderer({ bounds: map?.bounds, colliders: map?.staticColliders });
        this.queue = new PixelRenderQueue();
        if (!follow) this.camera.fitBounds(map?.bounds);
    }

    begin({ clear = '#17130f', target = null, deltaTime = 0, atmosphere = this.atmosphere } = {}) {
        const { width, height } = this.context.renderer.logicalDimensions();
        this.camera.resize(width, height);
        if (target && this.followEnabled) this.camera.follow(target);
        this.camera.update(deltaTime);
        const ctx = this.context.renderer.beginFrame(clear);
        this.cafe.draw(ctx, this.camera, { atmosphere });
        return ctx;
    }

    end(ctx) {
        this.queue.flush(ctx);
        return this.context.renderer.present();
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = Math.max(0.75, Number(pixelRatio) || 1);
        const dimensions = this.context.renderer.resize(this.pixelRatio);
        this.camera.resize(dimensions.logicalWidth, dimensions.logicalHeight);
        if (!this.followEnabled) this.camera.fitBounds(this.map?.bounds);
        return dimensions;
    }

    setPixelRatio(value) { return this.resize(value); }
    dispose() { this.queue.items.length = 0; }
}
