import { cssColor, PIXEL_PALETTE as P } from './PixelPalette.js';

function actorPosition(actor) {
    const position = actor?.position ?? actor?.group?.position ?? actor;
    return { x: Number(position?.x) || 0, z: Number(position?.z) || 0 };
}

function pixel(value) {
    return Math.round(Number(value) || 0);
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
        3.0,
        Number(display.worldHeight) || Number(entity?.visualHeight?.()) || 3.75
    );
    const bodyHeightRatio = Math.min(1, Math.max(0.55, Number(render.referenceBodyHeightRatio) || 0.86));
    const bodyHeight = Math.max(26, worldHeight * camera.pixelsPerUnit);
    const fullFrameHeight = bodyHeight / bodyHeightRatio;
    const baseScale = fullFrameHeight / Math.max(1, frame.h);
    const scaleX = baseScale * (Number(visual.width) || 1);
    const scaleY = baseScale * (Number(visual.height) || 1);

    // Integer destination dimensions are important for pixel art. Fractional
    // draw sizes cause a different source texel to be chosen as the actor moves.
    const frameWidth = Math.max(1, pixel(frame.w * scaleX));
    const frameHeight = Math.max(1, pixel(frame.h * scaleY));
    const worldOffsetX = (Number(visual.x) || 0) * camera.pixelsPerUnit;
    const worldOffsetY = ((Number(visual.bob) || 0) + (Number(visual.y) || 0)) * camera.pixelsPerUnit;

    return {
        screen: { x: pixel(screen.x), y: pixel(screen.y) },
        pivotX: Math.min(1, Math.max(0, Number(pivot.x) || 0.5)),
        pivotY: Math.min(1, Math.max(0, Number(pivot.y) || 0.96)),
        frameWidth,
        frameHeight,
        anchorX: pixel(screen.x + worldOffsetX),
        anchorY: pixel(screen.y - worldOffsetY),
        rotation: Number(visual.tilt) || 0,
        labelY: pixel(screen.y - bodyHeight - 9),
    };
}

function drawPixelShadow(ctx, x, y, width) {
    const shadowWidth = Math.max(10, pixel(width * 0.5));
    const half = Math.floor(shadowWidth / 2);
    ctx.fillStyle = 'rgba(8, 10, 18, 0.55)';
    ctx.fillRect(pixel(x) - half, pixel(y) + 1, shadowWidth, 3);
    ctx.fillStyle = 'rgba(8, 10, 18, 0.3)';
    ctx.fillRect(pixel(x) - Math.max(1, half - 3), pixel(y), Math.max(2, shadowWidth - 6), 1);
}

function drawPlayerMarker(ctx, screen, width) {
    const half = Math.max(7, pixel(width * 0.32));
    const y = screen.y + 2;
    ctx.fillStyle = P.cyanDark;
    ctx.fillRect(screen.x - half, y + 4, 3, 1);
    ctx.fillRect(screen.x + half - 2, y + 4, 3, 1);
    ctx.fillRect(screen.x - half + 2, y + 6, 3, 1);
    ctx.fillRect(screen.x + half - 4, y + 6, 3, 1);
    ctx.fillStyle = P.cyan;
    ctx.fillRect(screen.x - half, y + 3, 3, 1);
    ctx.fillRect(screen.x + half - 2, y + 3, 3, 1);
}

function drawPixelLabel(ctx, label, x, y) {
    if (!label) return;
    ctx.save();
    ctx.font = '700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.ceil(ctx.measureText(label).width) + 8;
    const left = pixel(x - width / 2);
    const top = pixel(y - 5);

    ctx.fillStyle = P.shadow;
    ctx.fillRect(left + 2, top + 2, width, 10);
    ctx.fillStyle = P.ink;
    ctx.fillRect(left, top, width, 10);
    ctx.fillStyle = P.cyanDark;
    ctx.fillRect(left, top, width, 1);
    ctx.fillRect(left, top + 9, width, 1);
    ctx.fillStyle = P.white;
    ctx.fillText(label, pixel(x), top + 5);
    ctx.restore();
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
    const scale = Math.max(10, pixel(camera.pixelsPerUnit * 1.34 * size));
    const bodyColor = eliminated ? '#4b5563' : cssColor(color);
    const skin = '#dca373';
    const hair = '#221b1d';
    const leg = '#252a36';

    ctx.save();
    ctx.globalAlpha = hidden ? 0.42 : 1;
    drawPixelShadow(ctx, screen.x, screen.y, scale);
    if (player) drawPlayerMarker(ctx, screen, scale);

    // High-detail built-in fallback: a tiny 8-bit character rather than a
    // featureless block. It remains readable if network sprite loading fails.
    const left = pixel(screen.x - scale * 0.33);
    const bodyTop = pixel(screen.y - scale * 0.14);
    const bodyW = Math.max(6, pixel(scale * 0.66));
    const bodyH = Math.max(6, pixel(scale * 0.62));

    ctx.fillStyle = P.shadow;
    ctx.fillRect(left - 1, bodyTop - 1, bodyW + 2, bodyH + 2);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left, bodyTop, bodyW, bodyH);
    ctx.fillStyle = P.inkSoft;
    ctx.fillRect(left + 1, bodyTop + bodyH - 2, Math.max(2, pixel(bodyW * 0.35)), 4);
    ctx.fillRect(left + bodyW - Math.max(3, pixel(bodyW * 0.35)) - 1, bodyTop + bodyH - 2, Math.max(2, pixel(bodyW * 0.35)), 4);

    const headW = Math.max(6, pixel(scale * 0.52));
    const headH = Math.max(6, pixel(scale * 0.43));
    const headX = pixel(screen.x - headW / 2);
    const headY = pixel(screen.y - scale * 0.51);
    ctx.fillStyle = hair;
    ctx.fillRect(headX - 1, headY - 2, headW + 2, headH + 3);
    ctx.fillStyle = skin;
    ctx.fillRect(headX, headY, headW, headH);
    ctx.fillStyle = hair;
    ctx.fillRect(headX, headY, headW, Math.max(2, pixel(headH * 0.26)));
    ctx.fillRect(headX, headY, 2, Math.max(3, pixel(headH * 0.55)));

    const forward = actor?.forward ?? actor?.lastMoveDirection ?? { x: 0, z: 1 };
    const eyeDirection = Math.sign(Number(forward.x) || 0);
    ctx.fillStyle = P.ink;
    ctx.fillRect(pixel(screen.x - 3 + eyeDirection), pixel(headY + headH * 0.54), 2, 2);
    ctx.fillRect(pixel(screen.x + 2 + eyeDirection), pixel(headY + headH * 0.54), 2, 2);
    ctx.fillStyle = P.white;
    ctx.fillRect(pixel(screen.x - 2 + eyeDirection), pixel(headY + headH * 0.54), 1, 1);
    ctx.fillRect(pixel(screen.x + 3 + eyeDirection), pixel(headY + headH * 0.54), 1, 1);

    drawPixelLabel(ctx, label, screen.x, screen.y - pixel(scale * 0.88));
    ctx.restore();
}

function drawSpriteFrame(ctx, image, frame, metrics, offsetX = 0, offsetY = 0) {
    ctx.drawImage(
        image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        pixel(-metrics.pivotX * metrics.frameWidth + offsetX),
        pixel(-metrics.pivotY * metrics.frameHeight + offsetY),
        metrics.frameWidth,
        metrics.frameHeight
    );
}

export function drawSpriteCharacter(ctx, camera, entity, { label = '', player = entity?.isPlayerControlled } = {}) {
    const image = entity?.texture?.image ?? entity?.texture?.source?.data;
    const frameName = entity?.animator?.currentFrameName?.();
    const frame = entity?.atlas?.frames?.[frameName];
    if (!isDrawableImage(image) || !frame) {
        drawPixelActor(ctx, camera, entity, {
            player,
            label,
            color: entity?.character?.settings?.accent_color ?? P.cyan,
            size: 1.18,
        });
        return false;
    }

    const metrics = spriteDrawMetrics(camera, entity, frame);
    drawPixelShadow(ctx, metrics.screen.x, metrics.screen.y, metrics.frameWidth);
    if (player) drawPlayerMarker(ctx, metrics.screen, metrics.frameWidth);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.translate(metrics.anchorX, metrics.anchorY);
    ctx.rotate(metrics.rotation);

    // A one-logical-pixel dark contour separates detailed sprites from busy
    // floor tiles. Canvas filter is progressive enhancement; unsupported
    // browsers simply render the original sprite with no loss of function.
    if ('filter' in ctx) {
        const previousFilter = ctx.filter;
        ctx.filter = 'brightness(0) saturate(100%) opacity(0.72)';
        drawSpriteFrame(ctx, image, frame, metrics, -1, 0);
        drawSpriteFrame(ctx, image, frame, metrics, 1, 0);
        drawSpriteFrame(ctx, image, frame, metrics, 0, -1);
        drawSpriteFrame(ctx, image, frame, metrics, 0, 1);
        ctx.filter = previousFilter || 'none';
    }

    drawSpriteFrame(ctx, image, frame, metrics);
    ctx.restore();

    drawPixelLabel(ctx, label, metrics.screen.x, metrics.labelY);
    return true;
}
