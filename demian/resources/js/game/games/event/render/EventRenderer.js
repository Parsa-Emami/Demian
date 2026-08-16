import CanvasCharacterRoster from '../../../characters/runtime/CanvasCharacterRoster.js';
import CafeGameRenderer2D from '../../../rendering2d/CafeGameRenderer2D.js';
import { drawPixelActor, drawSpriteCharacter } from '../../../rendering2d/PixelActorRenderer.js';
import { cssColor, PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

export default class EventRenderer extends CafeGameRenderer2D {
    constructor(context, map) {
        super(context, map, { follow: true, atmosphere: 'night', zoom: 11 });
        this.definition = null;
        this.modifiers = {};
        this.characters = new CanvasCharacterRoster(context.services.characterVisuals);
        this.resize();
    }

    async preloadCharacters() {
        await this.characters.preload([
            { key: 'player', actorId: 'player', player: true, index: 0 },
        ]);
    }

    configure(definition, modifiers = {}) {
        this.definition = definition;
        this.modifiers = modifiers;
    }

    sync() {}

    drawCollectible(ctx, item) {
        if (item.collected) return;
        const p = this.camera.worldToScreen(item.position);
        const pulse = 2 + Math.round(Math.sin((item.phase ?? 0) + performance.now() / 220) * 1.5);
        ctx.fillStyle = cssColor(item.color, P.gold);
        ctx.fillRect(p.x - 3 - pulse, p.y - 3 - pulse, 6 + pulse * 2, 6 + pulse * 2);
        ctx.fillStyle = P.white;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    drawZone(ctx, zone) {
        const p = this.camera.worldToScreen(zone.position);
        const radius = Math.max(5, Math.round((zone.radius ?? 1) * this.camera.pixelsPerUnit));
        ctx.strokeStyle = zone.reached ? '#4ade80' : P.gold;
        ctx.globalAlpha = zone.reached ? 0.28 : 0.65;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
        ctx.globalAlpha = 1;
    }

    drawPlayer(ctx, player, deltaTime) {
        const avatar = this.characters.sync('player', player, deltaTime);
        if (avatar) {
            drawSpriteCharacter(ctx, this.camera, avatar, { player: true });
            return;
        }
        drawPixelActor(ctx, this.camera, player, { color: P.cyan, player: true, label: '' });
    }

    render(world, deltaTime = 0) {
        if (!world?.player) return;
        const ctx = this.begin({ target: world.player.position, deltaTime, atmosphere: 'night' });
        for (const zone of world.zones?.values?.() ?? []) this.drawZone(ctx, zone);
        for (const item of world.collectibles?.values?.() ?? []) this.drawCollectible(ctx, item);
        for (const enemy of world.enemies?.values?.() ?? []) {
            if (enemy.defeated) continue;
            this.queue.add({
                layer: 20,
                y: enemy.position.z,
                draw: () => drawPixelActor(ctx, this.camera, enemy, {
                    color: P.red,
                    label: enemy.health > 1 ? `${enemy.health}` : '',
                    size: 0.92,
                }),
            });
        }
        this.queue.add({
            layer: 21,
            y: world.player.position.z,
            draw: () => this.drawPlayer(ctx, world.player, deltaTime),
        });
        this.end(ctx);
    }

    dispose() {
        this.characters.dispose();
        super.dispose();
    }
}
