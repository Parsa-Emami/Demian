import { PIXEL_PALETTE as P } from './PixelPalette.js';

/**
 * Cheap deterministic screen-space effects for a premium 8-bit finish.
 * Everything is hard-edged Canvas2D geometry: no blur, no image smoothing,
 * no shader/WebGL dependency and no temporal noise.
 */
export function drawPixelSceneEffects(ctx, width, height, {
    scanlines = true,
    frame = true,
    vignette = true,
} = {}) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (scanlines) {
        ctx.fillStyle = 'rgba(4, 8, 18, 0.035)';
        for (let y = 1; y < h; y += 4) {
            ctx.fillRect(0, y, w, 1);
        }
    }

    if (vignette) {
        const steps = Math.max(3, Math.min(7, Math.floor(Math.min(w, h) / 90)));
        for (let i = 0; i < steps; i += 1) {
            const alpha = 0.018 + i * 0.012;
            const inset = i * 2;
            ctx.fillStyle = `rgba(3, 6, 16, ${alpha.toFixed(3)})`;
            ctx.fillRect(inset, inset, Math.max(1, w - inset * 2), 1);
            ctx.fillRect(inset, h - inset - 1, Math.max(1, w - inset * 2), 1);
            ctx.fillRect(inset, inset, 1, Math.max(1, h - inset * 2));
            ctx.fillRect(w - inset - 1, inset, 1, Math.max(1, h - inset * 2));
        }
    }

    if (frame) {
        const corner = Math.max(8, Math.min(18, Math.round(Math.min(w, h) * 0.035)));
        ctx.fillStyle = 'rgba(67, 230, 233, 0.52)';
        ctx.fillRect(4, 4, corner, 1);
        ctx.fillRect(4, 4, 1, corner);
        ctx.fillRect(w - corner - 4, 4, corner, 1);
        ctx.fillRect(w - 5, 4, 1, corner);
        ctx.fillRect(4, h - 5, corner, 1);
        ctx.fillRect(4, h - corner - 4, 1, corner);
        ctx.fillRect(w - corner - 4, h - 5, corner, 1);
        ctx.fillRect(w - 5, h - corner - 4, 1, corner);

        ctx.fillStyle = 'rgba(255, 209, 102, 0.48)';
        ctx.fillRect(6, 6, 3, 1);
        ctx.fillRect(w - 9, h - 7, 3, 1);

        ctx.fillStyle = P.ink;
        ctx.globalAlpha = 0.38;
        ctx.fillRect(0, 0, w, 1);
        ctx.fillRect(0, h - 1, w, 1);
        ctx.fillRect(0, 0, 1, h);
        ctx.fillRect(w - 1, 0, 1, h);
    }

    ctx.restore();
}

export default drawPixelSceneEffects;
