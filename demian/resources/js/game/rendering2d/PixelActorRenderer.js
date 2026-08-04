import { cssColor, PIXEL_PALETTE as P } from './PixelPalette.js';

function actorPosition(actor) {
    const position = actor?.position ?? actor?.group?.position ?? actor;
    return { x: Number(position?.x) || 0, z: Number(position?.z) || 0 };
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
    if (!image || !frame || !image.complete) {
        drawPixelActor(ctx, camera, entity, { player, label, color: entity?.character?.settings?.accent_color ?? P.cyan, size: 1.15 });
        return false;
    }

    const screen = camera.worldToScreen(actorPosition(entity));
    const worldHeight = Math.max(2.8, Number(entity?.visualHeight?.()) || 3.4);
    const targetHeight = Math.max(22, Math.round(worldHeight * camera.pixelsPerUnit));
    const targetWidth = Math.max(14, Math.round(targetHeight * frame.w / frame.h));
    const bob = Math.round((Number(entity?.visual?.bob) || 0) * camera.pixelsPerUnit);

    ctx.fillStyle = 'rgba(20, 14, 12, 0.36)';
    ctx.fillRect(screen.x - Math.round(targetWidth * 0.33), screen.y + 1, Math.round(targetWidth * 0.66), Math.max(2, Math.round(targetHeight * 0.09)));
    if (player) {
        ctx.strokeStyle = P.cyan;
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x - Math.round(targetWidth * 0.48), screen.y - Math.round(targetHeight * 0.12), Math.round(targetWidth * 0.96), Math.round(targetHeight * 0.18));
    }
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, screen.x - Math.round(targetWidth / 2), screen.y - targetHeight + bob, targetWidth, targetHeight);
    if (label) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = P.white;
        ctx.fillText(label, screen.x, screen.y - targetHeight - 6);
    }
    return true;
}
