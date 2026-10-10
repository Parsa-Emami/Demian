import { cafeItemVisible } from './CafeWalkthroughPainter.js';
import { CAFE_MATERIALS as M } from './CafeWalkthroughPalette.js';

/** Deliberately sparse runtime art: bounded primitives, no grain/tile/prop loops. */
export function paintSimpleCafeItem(ctx, camera, item) {
    if (item.kind === 'void' || !cafeItemVisible(camera, item, 1)) return;
    const r = camera.worldRect(item.position, item.halfExtents);
    const u = camera.pixelsPerUnit;
    const border = Math.max(1, u * .08);
    const color = {
        wall: item.material === 'glass' ? M.glass : item.material === 'green-tile' ? M.greenTile : M.wall,
        column: '#b9bab5', counter: item.style === 'green-tile' ? M.greenTile : '#a8aaa4',
        table: M.woodLight, chair: M.wood, stool: M.wood, sofa: '#5e5d62',
        shelf: item.style === 'mint' ? '#a9c6b5' : M.wood, sideboard: M.wood,
        rug: '#864248', vanity: M.greenTile, 'tile-panel': M.greenTile,
        'glass-door': M.glass, 'panel-door': '#ede9de',
        mirror: item.style === 'coral' ? '#d55e4b' : '#252b2b',
        'arched-mirror': '#dde1d5', basin: '#dc683e', toilet: '#f3f2e9',
        bin: item.style === 'coral' ? '#d55e4b' : '#7c8580',
        'air-conditioner': '#e3e5da', espresso: '#3c4240', speaker: '#292b2c',
        'bottle-shelf': M.wood, portraits: '#292b2c', 'landscape-photos': '#292b2c',
    }[item.kind];
    if (item.kind === 'plant' || item.kind === 'vase') {
        ctx.fillStyle = '#4e6c50'; ctx.beginPath();
        ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width * .6, r.height * .7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#757a6c'; ctx.fillRect(r.x + r.width * .2, r.y + r.height * .6, r.width * .6, r.height * .4);
        return;
    }
    if (color) {
        ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.width, r.height);
        ctx.strokeStyle = item.kind === 'rug' ? '#bd8773' : '#6e7166'; ctx.lineWidth = border;
        ctx.strokeRect(r.x + border / 2, r.y + border / 2, Math.max(1, r.width - border), Math.max(1, r.height - border));
        if (['mirror', 'arched-mirror'].includes(item.kind)) {
            ctx.fillStyle = '#becbc0'; ctx.fillRect(r.x + border * 2, r.y + border * 2,
                Math.max(1, r.width - border * 4), Math.max(1, r.height - border * 4));
        }
        if (item.kind === 'shelf' || item.kind === 'sideboard') {
            ctx.fillStyle = '#eedac0';
            for (let i = 1; i <= 3; i++) ctx.fillRect(r.x + border, r.y + r.height * i / 4, Math.max(1, r.width - 2 * border), border);
        }
        if (item.kind === 'portraits' || item.kind === 'landscape-photos') {
            ctx.fillStyle = '#e6e1d7'; ctx.fillRect(r.x + border, r.y + border, Math.max(1, r.width - 2 * border), Math.max(1, r.height - 2 * border));
        }
    }
    if (item.label || item.kind === 'neon' || item.kind === 'logo') {
        const p = camera.worldToScreen(item.position);
        ctx.font = `600 ${Math.max(8, u * .42)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = item.kind === 'neon' ? '#ff684d' : '#354238';
        ctx.fillText(item.text ?? item.label ?? 'D', p.x, p.y - Math.max(2, u * .4));
    }
}
