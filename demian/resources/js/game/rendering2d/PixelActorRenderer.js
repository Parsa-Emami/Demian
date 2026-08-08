import { cssColor, PIXEL_PALETTE as P } from './PixelPalette.js';

function actorPosition(actor) {
    const position = actor?.position ?? actor?.group?.position ?? actor;
    return { x: Number(position?.x) || 0, z: Number(position?.z) || 0 };
}

export function isDrawableImage(image) {
    if (!image) return false;
    if ('complete' in image && image.complete === false) return false;
    const width = Number(image.naturalWidth ?? image.videoWidth ?? image.width ?? 0);
    const height = Number(image.naturalHeight ?? image.videoHeight ?? image.height ?? 0);
    return width > 0 && height > 0;
}

export function spriteDrawMetrics(camera, entity, frame) {
    const screen = camera.worldToScreen(actorPosition(entity));
    const atlas = entity?.atlas ?? {};
    const pivot = atlas.pivot ?? { x: 0.5, y: 0.96 };
    const display = atlas.display ?? {};
    const render = atlas.render ?? {};
    const visual = entity?.visual ?? {};
    const worldHeight = Math.max(
        2.8,
        Number(display.worldHeight) || Number(entity?.visualHeight?.()) || 3.4
    );
    const bodyHeightRatio = Math.min(1, Math.max(0.55, Number(render.referenceBodyHeightRatio) || 0.86));
    const bodyHeight = Math.max(22, worldHeight * camera.pixelsPerUnit);
    const fullFrameHeight = bodyHeight / bodyHeightRatio;
    const baseScale = fullFrameHeight / Math.max(1, frame.h);
    const scaleX = baseScale * (Number(visual.width) || 1);
    const scaleY = baseScale * (Number(visual.height) || 1);
    const frameWidth = frame.w * scaleX;
    const frameHeight = frame.h * scaleY;
    const worldOffsetX = (Number(visual.x) || 0) * camera.pixelsPerUnit;
    const worldOffsetY = ((Number(visual.bob) || 0) + (Number(visual.y) || 0)) * camera.pixelsPerUnit;

    return {
        screen,
        pivotX: Math.min(1, Math.max(0, Number(pivot.x) || 0.5)),
        pivotY: Math.min(1, Math.max(0, Number(pivot.y) || 0.96)),
        frameWidth,
        frameHeight,
        anchorX: screen.x + worldOffsetX,
        anchorY: screen.y - worldOffsetY,
        rotation: Number(visual.tilt) || 0,
        labelY: screen.y - bodyHeight - 8,
    };
}

export function drawPixelActor(ctx, camera, actor, {
    color = actor?.color ?? P.cyan,
    player = false,
    eliminated = false,
    hidden = false,
    label = '',
    size = 1,
} = {}) {
    const screen = camera.worldToScreen(actorPosition(actor));
    const scale = Math.max(8, Math.round(camera.pixelsPerUnit * 1.25 * size));
    const bodyColor = eliminated ? '#4b5563' : cssColor(color);
    ctx.globalAlpha = hidden ? 0.42 : 1;
    ctx.fillStyle = 'rgba(20, 14, 12, 0.35)';
    ctx.fillRect(screen.x - Math.round(scale * 0.45), screen.y + Math.round(scale * 0.28), Math.round(scale * 0.9), Math.max(2, Math.round(scale * 0.22)));
    if (player) {
        ctx.strokeStyle = P.cyan;
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x - Math.round(scale * 0.55), screen.y - Math.round(scale * 0.38), Math.round(scale * 1.1), Math.round(scale * 0.95));
    }
    ctx.fillStyle = bodyColor;
    ctx.fillRect(screen.x - Math.round(scale * 0.34), screen.y - Math.round(scale * 0.12), Math.round(scale * 0.68), Math.round(scale * 0.68));
    ctx.fillStyle = '#e8c8ac';
    ctx.fillRect(screen.x - Math.round(scale * 0.25), screen.y - Math.round(scale * 0.48), Math.round(scale * 0.5), Math.round(scale * 0.42));
    ctx.fillStyle = '#33251f';
    ctx.fillRect(screen.x - Math.round(scale * 0.28), screen.y - Math.round(scale * 0.52), Math.round(scale * 0.56), Math.max(2, Math.round(scale * 0.13)));
    const forward = actor?.forward ?? actor?.lastMoveDirection ?? { x: 0, z: 1 };
    ctx.fillStyle = P.white;
    ctx.fillRect(screen.x + Math.sign(Number(forward.x) || 0) * Math.round(scale * 0.22) - 1, screen.y - Math.round(scale * 0.3), 2, 2);
    if (label) {
        ctx.font = `${Math.max(8, Math.round(scale * 0.42))}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1c1917';
        ctx.fillText(label, screen.x + 1, screen.y - Math.round(scale * 0.82) + 1);
        ctx.fillStyle = P.white;
        ctx.fillText(label, screen.x, screen.y - Math.round(scale * 0.82));
    }
    ctx.globalAlpha = 1;
}

export function drawSpriteCharacter(ctx, camera, entity, { label = '', player = entity?.isPlayerControlled } = {}) {
    const image = entity?.texture?.image ?? entity?.texture?.source?.data;
    const frameName = entity?.animator?.currentFrameName?.();
    const frame = entity?.atlas?.frames?.[frameName];
    if (!isDrawableImage(image) || !frame) {
        drawPixelActor(ctx, camera, entity, { player, label, color: entity?.character?.settings?.accent_color ?? P.cyan, size: 1.15 });
        return false;
    }

    const metrics = spriteDrawMetrics(camera, entity, frame);
    const shadowWidth = Math.max(12, metrics.frameWidth * 0.52);
    const shadowHeight = Math.max(2, metrics.frameHeight * 0.055);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(20, 14, 12, 0.34)';
    ctx.beginPath();
    ctx.ellipse(metrics.screen.x, metrics.screen.y + 1, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (player) {
        ctx.strokeStyle = P.cyan;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(metrics.screen.x, metrics.screen.y + 1, shadowWidth * 0.58, Math.max(3, shadowHeight * 0.9), 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.translate(metrics.anchorX, metrics.anchorY);
    ctx.rotate(metrics.rotation);
    ctx.drawImage(
        image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -metrics.pivotX * metrics.frameWidth,
        -metrics.pivotY * metrics.frameHeight,
        metrics.frameWidth,
        metrics.frameHeight
    );
    ctx.restore();

    if (label) {
        ctx.save();
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1c1917';
        ctx.fillText(label, metrics.screen.x + 1, metrics.labelY + 1);
        ctx.fillStyle = P.white;
        ctx.fillText(label, metrics.screen.x, metrics.labelY);
        ctx.restore();
    }
    return true;
}
