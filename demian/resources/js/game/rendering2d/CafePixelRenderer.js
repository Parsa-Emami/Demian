import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';
import { PIXEL_PALETTE as P } from './PixelPalette.js';

function insetRect(rect, amount) {
    return { x: rect.x + amount, y: rect.y + amount, width: Math.max(1, rect.width - amount * 2), height: Math.max(1, rect.height - amount * 2) };
}

function fillRect(ctx, rect, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height));
}

function drawTable(ctx, rect, round = false) {
    ctx.fillStyle = P.shadow;
    if (round) {
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.width / 2 + 2, rect.y + rect.height / 2 + 3, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.woodLight;
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.woodDark;
        ctx.lineWidth = 2;
        ctx.stroke();
    } else {
        fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
        fillRect(ctx, rect, P.woodLight);
        fillRect(ctx, insetRect(rect, 2), P.wood);
    }
}

function drawPlant(ctx, rect) {
    const cx = Math.round(rect.x + rect.width / 2);
    const cy = Math.round(rect.y + rect.height / 2);
    ctx.fillStyle = P.woodDark;
    ctx.fillRect(cx - 4, cy + 1, 8, 6);
    ctx.fillStyle = P.plantDark;
    ctx.fillRect(cx - 6, cy - 5, 5, 8);
    ctx.fillRect(cx + 1, cy - 7, 6, 10);
    ctx.fillStyle = P.plant;
    ctx.fillRect(cx - 3, cy - 9, 5, 7);
    ctx.fillRect(cx + 4, cy - 4, 4, 6);
}

function drawSofa(ctx, rect) {
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, P.sofaDark);
    const inner = insetRect(rect, 3);
    fillRect(ctx, inner, P.sofa);
    ctx.strokeStyle = P.cream;
    ctx.globalAlpha = 0.25;
    ctx.strokeRect(inner.x + 0.5, inner.y + 0.5, Math.max(0, inner.width - 1), Math.max(0, inner.height - 1));
    ctx.globalAlpha = 1;
}

function drawCounter(ctx, rect) {
    fillRect(ctx, { ...rect, x: rect.x + 3, y: rect.y + 4 }, P.shadow);
    fillRect(ctx, rect, P.counter);
    const top = { x: rect.x, y: rect.y, width: rect.width, height: Math.max(3, Math.round(rect.height * 0.28)) };
    fillRect(ctx, top, P.counterTop);
    ctx.fillStyle = P.cream;
    for (let x = rect.x + 5; x < rect.x + rect.width - 2; x += 12) ctx.fillRect(Math.round(x), Math.round(rect.y + rect.height - 4), 2, 2);
}

function drawFixture(ctx, rect, kind) {
    if (kind === 'plant') return drawPlant(ctx, rect);
    if (kind === 'sofa') return drawSofa(ctx, rect);
    if (kind === 'counter') return drawCounter(ctx, rect);
    if (kind === 'table') return drawTable(ctx, rect, rect.width <= rect.height * 1.45 && rect.height <= rect.width * 1.45);
    const color = kind === 'wall' ? P.wall : kind === 'column' ? P.wallTrim : kind === 'display' ? P.glass : kind === 'shelf' ? P.wood : P.metal;
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, color);
    if (kind === 'display') fillRect(ctx, insetRect(rect, 3), P.cream);
}

/** Draws the canonical café as a top-down pixel scene from shared collision data. */
export default class CafePixelRenderer {
    constructor({ bounds = CAFE_BOUNDS, colliders = CAFE_STATIC_COLLIDERS } = {}) {
        this.bounds = bounds;
        this.colliders = colliders;
    }

    draw(ctx, camera, { atmosphere = 'day', grid = true, detail = true } = {}) {
        const a = camera.worldToScreen({ x: this.bounds.minX, z: this.bounds.minZ });
        const b = camera.worldToScreen({ x: this.bounds.maxX, z: this.bounds.maxZ });
        const floor = { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
        fillRect(ctx, floor, atmosphere === 'night' ? '#b7b0a4' : P.floorA);

        const tile = Math.max(4, Math.round(camera.pixelsPerUnit * 2));
        if (grid) {
            ctx.fillStyle = P.floorB;
            for (let y = Math.floor(floor.y / tile) * tile; y < floor.y + floor.height; y += tile) {
                for (let x = Math.floor(floor.x / tile) * tile; x < floor.x + floor.width; x += tile) {
                    if ((((x / tile) | 0) + ((y / tile) | 0)) % 2 === 0) ctx.fillRect(x, y, tile, tile);
                }
            }
            ctx.strokeStyle = P.grout;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1;
            for (let x = floor.x; x <= floor.x + floor.width; x += tile) { ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, floor.y); ctx.lineTo(Math.round(x) + 0.5, floor.y + floor.height); ctx.stroke(); }
            for (let y = floor.y; y <= floor.y + floor.height; y += tile) { ctx.beginPath(); ctx.moveTo(floor.x, Math.round(y) + 0.5); ctx.lineTo(floor.x + floor.width, Math.round(y) + 0.5); ctx.stroke(); }
            ctx.globalAlpha = 1;
        }

        if (detail) this.drawDecor(ctx, camera);

        const sorted = [...this.colliders].sort((left, right) => (left.position.z - right.position.z) || left.id.localeCompare(right.id));
        for (const collider of sorted) {
            const rect = camera.worldRect(collider.position, collider.halfExtents);
            drawFixture(ctx, rect, collider.kind);
        }

        this.drawDoorAndWindows(ctx, camera);
        if (atmosphere === 'night') {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
            ctx.fillRect(floor.x, floor.y, floor.width, floor.height);
        }
    }

    drawDecor(ctx, camera) {
        const rug = camera.worldRect({ x: 5.6, z: -2.0 }, { x: 5.7, z: 4.2 });
        fillRect(ctx, rug, P.rug);
        const inner = insetRect(rug, Math.max(2, Math.round(camera.pixelsPerUnit * 0.35)));
        ctx.strokeStyle = P.rugDetail;
        ctx.lineWidth = 2;
        ctx.strokeRect(inner.x + 0.5, inner.y + 0.5, Math.max(0, inner.width - 1), Math.max(0, inner.height - 1));

        const arcade = camera.worldRect({ x: 17.8, z: -9.4 }, { x: 1.25, z: 1.55 });
        fillRect(ctx, { ...arcade, x: arcade.x + 2, y: arcade.y + 3 }, P.shadow);
        fillRect(ctx, arcade, '#2f2940');
        fillRect(ctx, insetRect(arcade, 4), '#3d7f89');
        ctx.fillStyle = P.pink;
        ctx.fillRect(Math.round(arcade.x + arcade.width / 2 - 2), Math.round(arcade.y + arcade.height - 5), 4, 3);

        const chalk = camera.worldRect({ x: 16.4, z: -15.8 }, { x: 4.7, z: 0.35 });
        fillRect(ctx, chalk, '#26332d');
        ctx.fillStyle = P.cream;
        ctx.globalAlpha = 0.65;
        for (let x = chalk.x + 5; x < chalk.x + chalk.width - 4; x += 9) ctx.fillRect(Math.round(x), Math.round(chalk.y + chalk.height / 2), 5, 1);
        ctx.globalAlpha = 1;
    }

    drawDoorAndWindows(ctx, camera) {
        const entrance = camera.worldRect({ x: 0, z: 17.6 }, { x: 5.1, z: 0.25 });
        fillRect(ctx, entrance, P.glass);
        ctx.fillStyle = P.wallTrim;
        ctx.fillRect(Math.round(entrance.x + entrance.width / 2 - 1), entrance.y, 2, entrance.height);

        const northWindows = [
            { x: -15, z: -17.7 }, { x: -5, z: -17.7 }, { x: 5, z: -17.7 }, { x: 15, z: -17.7 },
        ];
        northWindows.forEach((position) => {
            const rect = camera.worldRect(position, { x: 3.2, z: 0.22 });
            fillRect(ctx, rect, P.glass);
            ctx.fillStyle = P.white;
            ctx.globalAlpha = 0.28;
            ctx.fillRect(rect.x + 2, rect.y + 1, Math.max(1, rect.width / 3), Math.max(1, rect.height - 2));
            ctx.globalAlpha = 1;
        });
    }
}
