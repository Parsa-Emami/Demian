import PixelCamera2D from '../../rendering2d/PixelCamera2D.js';
import { drawSpriteCharacter } from '../../rendering2d/PixelActorRenderer.js';
import drawPixelSceneEffects from '../../rendering2d/PixelSceneEffects.js';
import { PIXEL_PALETTE as P } from '../../rendering2d/PixelPalette.js';

export const ARCADE_BOUNDS = Object.freeze({ minX: -16, maxX: 16, minZ: -9, maxZ: 9 });

function star(ctx, x, y, radius = 2, color = P.gold) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - radius), Math.round(y), radius * 2 + 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y - radius), 1, radius * 2 + 1);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export default class ArcadeMiniGameRenderer {
    constructor(context, config) {
        this.context = context;
        this.config = config;
        const dimensions = context.renderer.logicalDimensions();
        this.camera = new PixelCamera2D({
            bounds: ARCADE_BOUNDS,
            viewportWidth: dimensions.width,
            viewportHeight: dimensions.height,
            pixelsPerUnit: 12,
            smoothing: 18,
        });
        this.camera.fitBounds(ARCADE_BOUNDS, 14);
        this.pixelRatio = 1;
        this.clock = 0;
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = Math.max(0.75, Number(pixelRatio) || 1);
        const dimensions = this.context.renderer.resize(this.pixelRatio);
        this.camera.resize(dimensions.logicalWidth, dimensions.logicalHeight);
        this.camera.fitBounds(ARCADE_BOUNDS, 14);
    }

    begin(deltaTime = 0) {
        this.clock += Math.max(0, deltaTime);
        const { width, height } = this.context.renderer.logicalDimensions();
        this.camera.resize(width, height);
        this.camera.update(deltaTime);
        const ctx = this.context.renderer.beginFrame('#071022');
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = '#081128';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#0d1833';
        for (let y = 0; y < height; y += 24) ctx.fillRect(0, y, width, 1);
        ctx.fillStyle = 'rgba(255,111,181,.08)';
        for (let x = 0; x < width; x += 32) ctx.fillRect(x, 0, 1, height);

        const seed = Math.floor(this.clock * 0.7);
        for (let i = 0; i < 18; i += 1) {
            const x = (i * 83 + seed * 13) % width;
            const y = (i * 47 + 17) % Math.max(1, height - 20);
            star(ctx, x, y, i % 5 === 0 ? 2 : 1, i % 3 === 0 ? P.pink : P.gold);
        }

        ctx.fillStyle = '#101b38';
        ctx.fillRect(0, 0, width, 5);
        ctx.fillStyle = '#f3b24c';
        ctx.fillRect(0, 5, width, 1);
        ctx.fillStyle = '#ff6fb5';
        ctx.fillRect(0, height - 5, width, 1);
        return ctx;
    }

    drawPlayer(ctx, avatar, { label = 'PLAYER 1', opacity = 1 } = {}) {
        if (!avatar) return;
        drawSpriteCharacter(ctx, this.camera, avatar, { label, player: true, opacity });
    }

    finish(ctx) {
        const { width, height } = this.context.renderer.logicalDimensions();
        drawPixelSceneEffects(ctx, width, height, { scanlines: true, frame: true, vignette: true });
        this.context.renderer.present();
    }

    dispose() {}
}
