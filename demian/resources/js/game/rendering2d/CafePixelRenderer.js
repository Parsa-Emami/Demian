import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';
import {
    CAFE_ROOMS, CAFE_WALLS, CAFE_FIXTURES, CAFE_RUGS, CAFE_DECOR, CAFE_DOORS,
    CAFE_LIGHTS, CAFE_CEILING, CAFE_GAMEPLAY_SCALE,
} from '../shared/cafe/CafeWalkthroughScene.js';
import { CAFE_MATERIALS as M } from './CafeWalkthroughPalette.js';
import { paintCafeItem } from './CafeWalkthroughPainter.js';
import { paintSimpleCafeItem } from './SimpleCafePainter.js';

const visualById = new Map([...CAFE_WALLS, ...CAFE_FIXTURES].map((entry) => [entry.id, entry]));
function rectangle(camera, bounds) {
    return camera.worldRect(
        { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
        { x: (bounds.maxX - bounds.minX) / 2, z: (bounds.maxZ - bounds.minZ) / 2 },
    );
}
function fill(ctx, r, color) {
    ctx.fillStyle = color; ctx.fillRect(Math.round(r.x), Math.round(r.y), Math.ceil(r.width), Math.ceil(r.height));
}

/** Reference-authored cutaway. No network asset is needed for its first frame. */
export default class CafePixelRenderer {
    constructor({ bounds = CAFE_BOUNDS, colliders = CAFE_STATIC_COLLIDERS } = {}) {
        this.bounds = bounds;
        this.colliders = colliders;
        this.items = colliders.map((entry) => ({ ...entry, ...(visualById.get(entry.id) ?? {}) }))
            .sort((a, b) => a.position.z - b.position.z || a.id.localeCompare(b.id));
        this.simpleItems = [...CAFE_RUGS, ...this.items, ...CAFE_DECOR, ...CAFE_DOORS];
    }

    draw(ctx, camera, { atmosphere = 'day', grid = false, detail = false, ceiling = false, simple = true } = {}) {
        if (simple) {
            ctx.save();
            this.drawFloor(ctx, camera, { grid: false });
            for (const entry of this.simpleItems) paintSimpleCafeItem(ctx, camera, entry);
            this.drawStructure(ctx, camera);
            if (ceiling) this.drawCeiling(ctx, camera);
            if (atmosphere === 'night') {
                ctx.fillStyle = 'rgba(17,24,31,.18)';
                for (const room of CAFE_ROOMS) {
                    const r = rectangle(camera, room.bounds); ctx.fillRect(r.x, r.y, r.width, r.height);
                }
            }
            ctx.restore();
            return;
        }
        ctx.save();
        this.drawExterior(ctx, camera);
        this.drawFloor(ctx, camera, { grid });
        this.drawDecor(ctx, camera);
        for (const entry of this.items) paintCafeItem(ctx, camera, entry);
        if (detail) {
            for (const entry of CAFE_DECOR) paintCafeItem(ctx, camera, entry);
            this.drawLightPixels(ctx, camera, atmosphere);
        }
        this.drawDoorAndWindows(ctx, camera);
        this.drawStructure(ctx, camera);
        if (ceiling) this.drawCeiling(ctx, camera);
        if (atmosphere === 'night') {
            ctx.fillStyle = 'rgba(17,24,31,.18)';
            for (const room of CAFE_ROOMS) {
                const r = rectangle(camera, room.bounds); ctx.fillRect(r.x, r.y, r.width, r.height);
            }
        }
        ctx.restore();
    }

    drawFloor(ctx, camera, { grid = true } = {}) {
        const tileSize = 2.2;
        const viewA = camera.screenToWorld({ x: -4, y: -4 });
        const viewB = camera.screenToWorld({ x: camera.viewportWidth + 4, y: camera.viewportHeight + 4 });
        for (const room of CAFE_ROOMS) {
            const b = room.bounds;
            if (b.maxX < viewA.x || b.minX > viewB.x || b.maxZ < viewA.z || b.minZ > viewB.z) continue;
            const base = room.floor === 'charcoal-stone' ? M.charcoalStone : room.floor === 'light-stone' ? M.lightStone : M.stone;
            const alternate = room.floor === 'charcoal-stone' ? M.charcoalAlternate : room.floor === 'light-stone' ? '#c1c8c1' : M.stoneAlternate;
            const roomRect = rectangle(camera, b);
            fill(ctx, roomRect, base);
            if (!grid) continue;
            ctx.save(); ctx.beginPath(); ctx.rect(roomRect.x, roomRect.y, roomRect.width, roomRect.height); ctx.clip();
            // World-anchored tiles do not swim when following a moving character.
            const startX = Math.floor((Math.max(b.minX, viewA.x) + 12) / tileSize);
            const endX = Math.ceil((Math.min(b.maxX, viewB.x) + 12) / tileSize);
            const startZ = Math.floor((Math.max(b.minZ, viewA.z) + 66) / tileSize);
            const endZ = Math.ceil((Math.min(b.maxZ, viewB.z) + 66) / tileSize);
            for (let iz = startZ; iz <= endZ; iz += 1) {
                for (let ix = startX; ix <= endX; ix += 1) {
                    const pos = { x: -12 + (ix + .5) * tileSize, z: -66 + (iz + .5) * tileSize };
                    const r = camera.worldRect(pos, { x: tileSize / 2, z: tileSize / 2 });
                    const hash = Math.abs(Math.imul(ix + 21, 17171) ^ Math.imul(iz + 81, 27961));
                    fill(ctx, r, hash % 4 === 0 ? alternate : base);
                    ctx.strokeStyle = room.floor === 'charcoal-stone' ? '#525652' : M.grout;
                    ctx.lineWidth = Math.max(.7, camera.pixelsPerUnit * .025);
                    ctx.strokeRect(r.x + .5, r.y + .5, r.width, r.height);
                    if (camera.pixelsPerUnit >= 9) {
                        ctx.globalAlpha = .2; ctx.fillStyle = room.floor === 'charcoal-stone' ? '#8b9187' : '#9da398';
                        for (let k = 0; k < 4; k += 1) {
                            const xx = r.x + ((hash >> (k * 3)) % 19 + 1) / 22 * r.width;
                            const yy = r.y + ((hash >> (k * 2)) % 17 + 2) / 22 * r.height;
                            ctx.fillRect(Math.round(xx), Math.round(yy), Math.max(1, camera.pixelsPerUnit * .05), 1);
                        }
                        ctx.globalAlpha = 1;
                    }
                }
            }
            ctx.restore();
        }
    }

    drawDecor(ctx, camera) {
        for (const rug of CAFE_RUGS) paintCafeItem(ctx, camera, rug);
    }

    drawDoorAndWindows(ctx, camera) {
        for (const door of CAFE_DOORS) paintCafeItem(ctx, camera, door);
    }

    drawLightPixels(ctx, camera, atmosphere) {
        for (const entry of CAFE_LIGHTS) {
            if (atmosphere === 'night' && entry.kind === 'linear-light') continue;
            paintCafeItem(ctx, camera, entry);
        }
    }

    drawExterior(ctx, camera) {
        const scale = CAFE_GAMEPLAY_SCALE;
        const r = rectangle(camera, { minX: -12 * scale, maxX: 12 * scale, minZ: 18 * scale, maxZ: 23 * scale });
        if (r.y > camera.viewportHeight || r.y + r.height < 0) return;
        fill(ctx, r, '#b3b5a9');
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip();
        const unit = camera.pixelsPerUnit;
        ctx.strokeStyle = '#9b9e92'; ctx.lineWidth = Math.max(.7, unit * .025);
        for (let x = -12; x < 12; x += .7) {
            const p = camera.worldToScreen({ x, z: 18 });
            ctx.beginPath(); ctx.moveTo(p.x, r.y); ctx.lineTo(p.x, r.y + r.height); ctx.stroke();
        }
        for (const [x, halfX] of [[-7, 4.5], [7, 4.5]]) {
            const bed = camera.worldRect({ x, z: 22.2 }, { x: halfX, z: .65 });
            fill(ctx, bed, '#7c8577');
            for (let i = 0; i < halfX * 3; i += 1) {
                paintCafeItem(ctx, camera, { id: `bamboo-${x}-${i}`, kind: 'plant', style: 'palm', position: { x: x - halfX + .3 + i * .62, z: 22.1 }, halfExtents: { x: .36, z: .36 } });
            }
        }
        ctx.restore();
    }

    drawStructure(ctx, camera) {
        const s = CAFE_GAMEPLAY_SCALE;
        const beam = camera.worldRect({ x: 0, z: -7.85 * s }, { x: 11.6 * s, z: .12 * s });
        if (beam.y + 10 >= 0 && beam.y < camera.viewportHeight) {
            ctx.fillStyle = 'rgba(93,96,92,.12)'; ctx.fillRect(beam.x, beam.y, beam.width, Math.max(1, beam.height));
        }
        const flag = CAFE_CEILING[1].flag;
        const p = camera.worldToScreen(flag); const u = camera.pixelsPerUnit;
        ctx.save(); ctx.globalAlpha = .83;
        flag.colors.forEach((color, i) => {
            ctx.fillStyle = color; ctx.fillRect(p.x + (i - 1.5) * u * .46, p.y - u * 1.35, u * .46, u * .82);
        });
        ctx.restore();
    }

    drawCeiling(ctx, camera) {
        const b = CAFE_CEILING[0].bounds; const step = CAFE_CEILING[0].tileSize;
        const r = rectangle(camera, b);
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip();
        ctx.globalAlpha = .35; ctx.strokeStyle = '#f7f4e7'; ctx.lineWidth = 1;
        for (let x = b.minX; x <= b.maxX; x += step) {
            const a = camera.worldToScreen({ x, z: b.minZ }), d = camera.worldToScreen({ x, z: b.maxZ });
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
        for (let z = b.minZ; z <= b.maxZ; z += step) {
            const a = camera.worldToScreen({ x: b.minX, z }), d = camera.worldToScreen({ x: b.maxX, z });
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
        ctx.restore();
    }
}
