import { drawCafeGroundShadow } from './CafeAtmosphere2D.js';

function drawCompanion(ctx, companion, pose, x, y, size, opacity) {
    const frame = pose.frame;
    if (!frame) return;
    const { x: pivotX, y: pivotY } = companion.atlas.pivot;
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.imageSmoothingEnabled = true;
    drawCafeGroundShadow(ctx, { x, y, bodyWidth: size * .52, bodyHeight: size, elevation: pose.elevation });
    ctx.drawImage(companion.image, frame.x, frame.y, frame.w, frame.h,
        x - pivotX * size, y - pivotY * size - pose.elevation * size / companion.atlas.worldSize,
        size, size);
    ctx.restore();
}

export function drawWorldCompanion(ctx, camera, companion, pose, opacity = 1) {
    if (!pose?.world) return;
    const { x, y } = camera.worldToScreen(pose.world);
    drawCompanion(ctx, companion, pose, x, y, companion.atlas.worldSize * camera.pixelsPerUnit, opacity);
}

export function drawRunnerCompanion(ctx, companion, alpha, playerX, floorY, scale) {
    if (!companion) return;
    const pose = companion.sample(alpha);
    drawCompanion(ctx, companion, pose, playerX + pose.runnerOffset * scale, floorY,
        companion.atlas.runnerSize * scale, 1);
}
