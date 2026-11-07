import CafeGameRenderer2D from '../../rendering2d/CafeGameRenderer2D.js';
import { drawSpriteCharacter } from '../../rendering2d/PixelActorRenderer.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../../shared/cafe/CafeReferenceLayout.js';
import { CIRCUITS, SHIFT_BOUNDS, distance } from './AfterHoursMap.js';

function sceneRect(camera, minZ, maxZ) {
    return camera.worldRect({ x: 0, z: (minZ + maxZ) / 2 }, {
        x: CAFE_BOUNDS.maxX, z: (maxZ - minZ) / 2,
    });
}

function halo(ctx, x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export default class AfterHoursRenderer {
    constructor(context) {
        this.context = context;
        this.scene = new CafeGameRenderer2D(context, {
            bounds: SHIFT_BOUNDS, staticColliders: CAFE_STATIC_COLLIDERS,
        }, { atmosphere: 'night' });
    }

    resize(position) {
        const ratio = this.context.services.performanceProfile?.maxPixelRatio ?? 1.35;
        this.context.renderer.setPresentationMode('smooth', { maxPixelRatio: ratio });
        const size = this.scene.resize(ratio);
        const { logicalWidth: width, logicalHeight: height } = size;
        const zoom = width < height
            ? Math.max(width / 32, height / 65)
            : Math.max(width / 62, height / 49);
        this.scene.camera.setZoom(zoom, { immediate: true, minimum: 6 });
        if (position) this.scene.camera.jumpTo(position);
    }

    render(model, avatar, alpha, dt) {
        const camera = this.scene.camera;
        const player = model.player.position;
        const ctx = this.scene.begin({ clear: '#090e19', target: player, deltaTime: dt });
        this.drawLighting(ctx, camera, model);
        this.drawNoise(ctx, camera, model);
        for (const target of model.targets()) {
            if (!target.collected) this.drawMarker(ctx, camera, target, model);
        }
        const shadow = model.shadow;
        if (distance(player, shadow.position) < 45) this.drawShadow(ctx, camera, shadow, alpha);
        drawSpriteCharacter(ctx, camera, avatar, { alpha, player: false });
        this.scene.end(ctx);
    }

    drawLighting(ctx, camera, model) {
        const bounds = sceneRect(camera, SHIFT_BOUNDS.minZ, SHIFT_BOUNDS.maxZ);
        ctx.save();
        const backdrop = ctx.createLinearGradient(0, 0, 0, camera.viewportHeight);
        backdrop.addColorStop(0, '#17243a');
        backdrop.addColorStop(.58, '#10192a');
        backdrop.addColorStop(1, '#090e19');
        ctx.fillStyle = backdrop;
        ctx.beginPath();
        ctx.rect(0, 0, camera.viewportWidth, camera.viewportHeight);
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.fill('evenodd');
        ctx.beginPath();
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.clip();
        for (const circuit of CIRCUITS) {
            const rect = sceneRect(camera, circuit.minZ, circuit.maxZ);
            const dark = circuit.id === model.darkCircuit;
            ctx.fillStyle = dark ? 'rgba(8, 15, 38, .73)' : 'rgba(15, 21, 34, .27)';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            ctx.fillStyle = dark ? 'rgba(116, 156, 218, .34)' : 'rgba(254, 191, 109, .25)';
            ctx.fillRect(rect.x, rect.y, rect.width, 2);
        }
        const interior = camera.worldRect({ x: 0, z: 0 }, { x: SHIFT_BOUNDS.maxX, z: 1 });
        const left = ctx.createLinearGradient(bounds.x, 0, interior.x, 0);
        left.addColorStop(0, '#142035');
        left.addColorStop(1, 'transparent');
        ctx.fillStyle = left;
        ctx.fillRect(bounds.x, bounds.y, interior.x - bounds.x, bounds.height);
        const innerRight = interior.x + interior.width;
        const outerRight = bounds.x + bounds.width;
        const right = ctx.createLinearGradient(innerRight, 0, outerRight, 0);
        right.addColorStop(0, 'transparent');
        right.addColorStop(1, '#142035');
        ctx.fillStyle = right;
        ctx.fillRect(innerRight, bounds.y, outerRight - innerRight, bounds.height);
        const screen = camera.worldToScreen(model.player.position);
        ctx.globalCompositeOperation = 'screen';
        halo(ctx, screen.x, screen.y, camera.pixelsPerUnit * 9.2, 'rgba(235, 157, 78, .27)');
        ctx.restore();
    }

    drawNoise(ctx, camera, model) {
        const noise = model.noise;
        if (!noise) return;
        const age = model.elapsed - noise.time;
        if (age > 0.84) return;
        const reduce = this.context.settings.resolvedReducedMotion();
        const at = camera.worldToScreen(noise);
        const radius = noise.radius * camera.pixelsPerUnit;
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = `rgba(255, 194, 121, ${(1 - age / .84) * .59})`;
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (!reduce) {
            ctx.beginPath();
            ctx.arc(at.x, at.y, radius * (.25 + .75 * age / .84), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawMarker(ctx, camera, target, model) {
        const { x, y } = camera.worldToScreen(target);
        if (x < -30 || y < -30 || x > camera.viewportWidth + 30 || y > camera.viewportHeight + 30) return;
        const size = Math.max(7, Math.min(camera.pixelsPerUnit * .8, 18));
        const color = target.kind === 'card' ? '#83e4ea'
            : target.kind === 'exit' && model.exitReady ? '#94e2ab' : '#ffca83';
        const symbol = target.kind === 'card' ? (target.id === 'card-1' ? '1' : '2')
            : target.kind === 'panel' ? 'ϟ' : target.kind === 'exit' ? '↗' : model.relic ? '✓' : '◇';

        ctx.save();
        halo(ctx, x, y, size * 3, target.kind === 'card' ? 'rgba(97, 219, 232, .28)' : 'rgba(254, 172, 78, .23)');
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.fillStyle = '#152033';
        ctx.beginPath();
        ctx.roundRect(x - size, y - size * 1.18, size * 2, size * 1.8, size * .34);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(11, Math.round(size * 1.25))}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, x, y - size * .19);
        ctx.restore();
    }

    drawShadow(ctx, camera, shadow, alpha) {
        const point = {
            x: shadow.previous.x + (shadow.position.x - shadow.previous.x) * alpha,
            z: shadow.previous.z + (shadow.position.z - shadow.previous.z) * alpha,
        };
        const { x, y } = camera.worldToScreen(point);
        const scale = camera.pixelsPerUnit;
        const alert = shadow.mode === 'chase' || shadow.sightTime > 0;
        const edge = alert ? '#ff9b8d' : shadow.mode === 'investigate' ? '#ffd096' : '#8fa5d3';
        ctx.save();
        halo(ctx, x, y - scale * .85, scale * 2.9, alert ? 'rgba(246, 102, 102, .26)' : 'rgba(80, 110, 166, .23)');
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = 'rgba(6, 8, 16, .56)';
        ctx.beginPath();
        ctx.ellipse(0, .05, 1.1, .27, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b101f';
        ctx.strokeStyle = edge;
        ctx.lineWidth = .065;
        ctx.beginPath();
        ctx.moveTo(-.97, 0);
        ctx.lineTo(-.64, -1.36);
        ctx.lineTo(-.43, -1.72);
        ctx.lineTo(-.44, -2.21);
        ctx.lineTo(0, -2.5);
        ctx.lineTo(.43, -2.21);
        ctx.lineTo(.47, -1.71);
        ctx.lineTo(.75, -1.3);
        ctx.lineTo(.97, 0);
        ctx.lineTo(.47, -.22);
        ctx.lineTo(0, .05);
        ctx.lineTo(-.49, -.21);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = edge;
        const glance = shadow.forward.x * .09;
        ctx.fillRect(-.29 + glance, -1.99, .16, .095);
        ctx.fillRect(.11 + glance, -1.99, .16, .095);
        if (alert || shadow.mode === 'investigate') {
            ctx.font = 'bold .8px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(alert ? '!' : '?', 0, -2.82);
        }
        ctx.restore();
    }

    dispose() { this.scene.dispose(); }
}
