import PixelCamera2D from './PixelCamera2D.js';

const MAX_PIXELS = 2200000;

/** One bounded, scrollable scene raster. Moving actors never enter this cache. */
export default class StaticSceneCache {
    constructor(draw, { canvasFactory = () => globalThis.document?.createElement('canvas'), maxPixels = MAX_PIXELS } = {}) {
        this.drawScene = draw;
        this.canvasFactory = canvasFactory;
        this.maxPixels = Math.min(3200000, Math.max(MAX_PIXELS, Number(maxPixels) || MAX_PIXELS));
        this.canvas = null;
        this.pose = null;
        this.key = null;
        this.builds = 0;
        this.hits = 0;
    }

    draw(ctx, camera, key = 'day') {
        const ppu = camera.pixelsPerUnit;
        const scale = this.pose ? ppu / this.pose.ppu : 1;
        const dx = this.pose ? (this.pose.x - camera.position.x) * ppu : 0;
        const dy = this.pose ? (this.pose.z - camera.position.z) * ppu : 0;
        const covered = this.pose && Math.abs(dx) + camera.viewportWidth / 2 <= this.canvas.width * scale / 2
            && Math.abs(dy) + camera.viewportHeight / 2 <= this.canvas.height * scale / 2;
        if (!covered || this.key !== key || scale < .88 || scale > 1.12) {
            this.canvas ??= this.canvasFactory();
            const cacheContext = this.canvas?.getContext('2d', { alpha: true });
            if (!cacheContext) { this.drawScene(ctx, camera, key); return; }
            const pad = Math.max(0, Math.min(96,
                (Math.sqrt((camera.viewportWidth - camera.viewportHeight) ** 2 + 4 * this.maxPixels)
                    - camera.viewportWidth - camera.viewportHeight) / 4));
            this.canvas.width = Math.floor(camera.viewportWidth + pad * 2);
            this.canvas.height = Math.floor(camera.viewportHeight + pad * 2);
            const cachedCamera = new PixelCamera2D({ bounds: camera.bounds,
                viewportWidth: this.canvas.width, viewportHeight: this.canvas.height, pixelsPerUnit: ppu,
                pixelSnap: camera.pixelSnap });
            // Camera clamping must not change the cached world origin at edges.
            cachedCamera.position = { ...camera.position };
            cacheContext.imageSmoothingEnabled = camera.pixelSnap === false;
            cacheContext.imageSmoothingQuality = 'high';
            this.drawScene(cacheContext, cachedCamera, key);
            this.pose = { x: camera.position.x, z: camera.position.z, ppu };
            this.key = key;
            this.builds += 1;
        } else this.hits += 1;
        const ratio = ppu / this.pose.ppu;
        const width = this.canvas.width * ratio, height = this.canvas.height * ratio;
        const x = camera.viewportWidth / 2 - width / 2 + (this.pose.x - camera.position.x) * ppu;
        const y = camera.viewportHeight / 2 - height / 2 + (this.pose.z - camera.position.z) * ppu;
        const snap = camera.pixelSnap === false ? (value) => value : Math.round;
        ctx.drawImage(this.canvas, snap(x), snap(y), snap(width), snap(height));
    }

    stats() { return { builds: this.builds, hits: this.hits, bytes: (this.canvas?.width ?? 0) * (this.canvas?.height ?? 0) * 4 }; }
    dispose() {
        if (this.canvas) { this.canvas.width = 1; this.canvas.height = 1; }
        this.canvas = null; this.pose = null;
    }
}
