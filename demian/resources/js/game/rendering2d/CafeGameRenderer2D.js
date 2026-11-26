import PixelCamera2D from './PixelCamera2D.js';
import CafePixelRenderer from './CafePixelRenderer.js';
import PixelRenderQueue from './PixelRenderQueue.js';
import { drawCafeAmbientMotes } from './CafeAtmosphere2D.js';

export default class CafeGameRenderer2D {
    constructor(context, map, { follow = true, atmosphere = 'day', zoom = 10 } = {}) {
        this.context = context;
        this.map = map;
        this.followEnabled = follow;
        this.atmosphere = atmosphere;
        this.zoom = zoom;
        const dimensions = context.renderer.logicalDimensions();
        this.camera = new PixelCamera2D({
            bounds: map?.bounds,
            viewportWidth: dimensions.width,
            viewportHeight: dimensions.height,
            pixelsPerUnit: zoom,
            pixelSnap: context.renderer.presentationMode !== 'smooth',
        });
        this.cafe = new CafePixelRenderer({ bounds: map?.bounds, colliders: map?.staticColliders,
            quality: context.settings?.snapshot?.().quality, detected: context.services?.performanceProfile?.tier });
        this.queue = new PixelRenderQueue();
        this.visualElapsed = 0;
        if (!follow) this.camera.fitBounds(map?.bounds);
    }

    begin({ clear = '#17130f', target = null, deltaTime = 0, atmosphere = this.atmosphere } = {}) {
        const { width, height } = this.context.renderer.logicalDimensions();
        this.camera.resize(width, height);
        this.camera.pixelSnap = this.context.renderer.presentationMode !== 'smooth';
        if (target && this.followEnabled) this.camera.follow(target);
        this.camera.update(deltaTime);
        const ctx = this.context.renderer.beginFrame(clear);
        this.cafe.draw(ctx, this.camera, { atmosphere });
        // Decorative-only light motes; no physics, collisions, player RNG or scores.
        this.visualElapsed += Number.isFinite(deltaTime) ? Math.min(.05, Math.max(0, deltaTime)) : 0;
        drawCafeAmbientMotes(ctx, this.camera, { time: this.visualElapsed, atmosphere,
            quality: this.cafe.stream.profile.quality,
            reducedMotion: this.context.settings?.resolvedReducedMotion?.() ?? false });
        return ctx;
    }

    end(ctx) {
        this.queue.flush(ctx);
        return this.context.renderer.present();
    }

    resize() {
        this.cafe.setQuality(this.context.renderer.quality?.quality);
        const dimensions = this.context.renderer.resizeSmooth();
        this.camera.resize(dimensions.logicalWidth, dimensions.logicalHeight);
        if (!this.followEnabled) this.camera.fitBounds(this.map?.bounds);
        return dimensions;
    }

    dispose() { this.cafe.dispose(); this.queue.items.length = 0; }
}
