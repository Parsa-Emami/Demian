import CafeGameRenderer2D from '../../rendering2d/CafeGameRenderer2D.js';
import { drawSpriteCharacter } from '../../rendering2d/PixelActorRenderer.js';
import { CAFE_STATIC_COLLIDERS } from '../../shared/cafe/CafeReferenceLayout.js';
import { RECIPES, RUSH_BOUNDS, RUSH_SPOTS, VIP_AT, rushObjective } from './CafeRushMap.js';

const BOARD = {
    position: { x: 0, z: (RUSH_BOUNDS.minZ + RUSH_BOUNDS.maxZ) / 2 },
    extents: { x: RUSH_BOUNDS.maxX, z: (RUSH_BOUNDS.maxZ - RUSH_BOUNDS.minZ) / 2 },
};
const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const UI_FONT = 'Vazirmatn, system-ui, sans-serif';

export default class CafeRushRenderer {
    constructor(context) {
        this.context = context;
        this.scene = new CafeGameRenderer2D(context, {
            bounds: RUSH_BOUNDS, staticColliders: CAFE_STATIC_COLLIDERS,
        }, { follow: false });
    }

    resize() {
        const ratio = this.context.services.performanceProfile?.maxPixelRatio ?? 1.35;
        this.context.renderer.setPresentationMode('smooth', { maxPixelRatio: ratio });
        this.scene.resize(ratio);
    }

    render(model, avatars, cue, alpha, dt) {
        const camera = this.scene.camera;
        const ctx = this.scene.begin({ clear: '#29201c', deltaTime: dt });
        const board = camera.worldRect(BOARD.position, BOARD.extents);
        const backdrop = ctx.createLinearGradient(0, 0, 0, camera.viewportHeight);
        backdrop.addColorStop(0, '#413026');
        backdrop.addColorStop(.54, '#2a201c');
        backdrop.addColorStop(1, '#1b1716');
        ctx.save();
        ctx.fillStyle = backdrop;
        ctx.beginPath();
        ctx.rect(0, 0, camera.viewportWidth, camera.viewportHeight);
        ctx.rect(board.x, board.y, board.width, board.height);
        ctx.fill('evenodd');
        ctx.strokeStyle = '#c99363';
        ctx.lineWidth = 1;
        ctx.strokeRect(board.x, board.y, board.width, board.height);
        ctx.beginPath();
        ctx.rect(board.x, board.y, board.width, board.height);
        ctx.clip();
        ctx.fillStyle = 'rgba(249, 196, 125, .12)';
        ctx.fillRect(board.x, board.y, board.width, board.height);
        model.puddles.forEach((point) => this.drawPuddle(ctx, camera, point));
        ctx.restore();

        const cast = [avatars.player, avatars.setayesh];
        if (model.elapsed >= VIP_AT) cast.push(avatars.uzudi);
        cast.sort((first, second) => first.position.z - second.position.z);
        for (const avatar of cast) drawSpriteCharacter(ctx, camera, avatar, { alpha, player: false });
        const carried = model.carriedOrder;
        if (carried) this.drawTray(ctx, camera, model, carried);
        const objective = rushObjective(model);
        for (const spot of RUSH_SPOTS) this.drawSign(ctx, camera, spot, spot.id === objective.id ? objective.marker : '', model);
        if (cue) this.drawCue(ctx, camera, model.elapsed, cue);
        this.scene.end(ctx);
    }

    drawPuddle(ctx, camera, point) {
        const at = camera.worldToScreen(point);
        const radius = camera.pixelsPerUnit * 1.35;
        ctx.save();
        ctx.fillStyle = '#a34f36a6';
        ctx.strokeStyle = '#ffe3a6';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#fff1cbcc';
        for (const offset of [-.37, .05, .47]) {
            ctx.beginPath();
            ctx.moveTo(at.x - radius * .43, at.y + radius * offset);
            ctx.lineTo(at.x + radius * .43, at.y + radius * (offset - .21));
            ctx.stroke();
        }
        ctx.restore();
    }

    drawTray(ctx, camera, model, order) {
        const at = camera.worldToScreen(model.player.position);
        const side = model.player.forward.x < -.2 ? -1 : 1;
        const scale = camera.pixelsPerUnit;
        ctx.save();
        ctx.translate(at.x + side * scale * .78, at.y - scale * 1.48);
        ctx.rotate(model.tray.lean * .39);
        ctx.fillStyle = '#4d2924';
        ctx.strokeStyle = '#ffeac6';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, scale * .69, scale * .24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const items = RECIPES[order.recipe].kind === 'pair' ? ['tea', 'espresso'] : [order.recipe];
        for (const [index, id] of items.entries()) {
            const recipe = RECIPES[id];
            const x = (index - (items.length - 1) / 2) * scale * .57;
            const size = scale * .24;
            ctx.fillStyle = recipe.color;
            ctx.beginPath();
            if (recipe.kind === 'cake') {
                ctx.moveTo(x - size * 1.4, 0);
                ctx.lineTo(x, -size * 1.7);
                ctx.lineTo(x + size * 1.4, 0);
                ctx.closePath();
            } else {
                ctx.ellipse(x, -size * .55, size, size * .8, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fill();
        }
        ctx.restore();
        const balance = 1 - model.tray.risk;
        const x = at.x + side * scale * .78;
        const y = at.y - scale * 2.1;
        ctx.save();
        ctx.fillStyle = '#201b18';
        ctx.fillRect(x - 19, y - 5, 38, 9);
        ctx.fillStyle = balance < .34 ? '#ff9b8d' : balance < .68 ? '#ffdc84' : '#b9e8ad';
        ctx.fillRect(x - 17, y - 3, 34 * balance, 5);
        if (balance < .68) {
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(balance < .34 ? '!' : '△', x, y - 8);
        }
        ctx.restore();
    }

    drawSign(ctx, camera, spot, active, model) {
        const at = camera.worldToScreen(spot);
        const size = Math.max(10, Math.min(14, camera.pixelsPerUnit * .73));
        const pending = spot.kind === 'station' ? model.stationOrder(spot.id) : null;
        const label = active ? `◆ ${active}` : spot.kind === 'table' ? spot.label : `${spot.sign}  ${spot.label}`;
        ctx.save();
        ctx.font = `800 ${size}px ${UI_FONT}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.direction = 'rtl';
        const width = ctx.measureText(label).width + 19;
        const y = at.y + size * .97;
        ctx.strokeStyle = active ? '#fbce82' : '#996c51';
        ctx.fillStyle = active ? '#4b2821' : '#382823';
        ctx.lineWidth = active ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(at.x - width / 2, y - size * .75, width, size * 1.52, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = active ? '#fff2cf' : '#ebc6a4';
        ctx.fillText(label, at.x, y);
        if (pending) {
            const recipe = RECIPES[pending.recipe];
            const fraction = pending.state === 'ready' ? 1 : Math.max(0, 1 - (pending.readyAt - model.elapsed) / recipe.time);
            ctx.fillStyle = '#50362f';
            ctx.fillRect(at.x - width / 2, y + size, width, 3);
            ctx.fillStyle = '#a8d7a1';
            ctx.fillRect(at.x - width / 2, y + size, width * fraction, 3);
        }
        if (spot.table === 2 && model.elapsed >= VIP_AT && !model.vipServed) {
            ctx.fillStyle = '#5a3029';
            ctx.fillRect(at.x - 17, y + size * 1.13, 34, 14);
            ctx.font = 'bold 9px ui-monospace, monospace';
            ctx.fillStyle = '#ffcd88';
            ctx.fillText('VIP', at.x, y + size * 1.13 + 7);
        }
        ctx.restore();
    }

    drawCue(ctx, camera, time, cue) {
        const age = time - cue.time;
        if (age > 1.1) return;
        const reduce = this.context.settings.resolvedReducedMotion();
        const at = camera.worldToScreen(cue.point);
        const label = cue.points ? `+${digits.format(cue.points)}` : cue.type === 'spill' ? 'ریخت!' : 'میز اشتباه';
        ctx.save();
        ctx.globalAlpha = reduce ? 1 : Math.min(1, (1.1 - age) * 3.4);
        ctx.fillStyle = cue.points ? '#fcf1ba' : '#ffd7c4';
        ctx.strokeStyle = '#3c2923';
        ctx.lineWidth = 3;
        ctx.font = `900 17px ${UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.direction = 'ltr';
        const y = at.y - 17 - (reduce ? 0 : age * 23);
        ctx.strokeText(label, at.x, y);
        ctx.fillText(label, at.x, y);
        ctx.restore();
    }

    dispose() { this.scene.dispose(); }
}
