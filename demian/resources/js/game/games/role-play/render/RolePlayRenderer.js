import CanvasCharacterRoster from '../../../characters/runtime/CanvasCharacterRoster.js';
import CafeGameRenderer2D from '../../../rendering2d/CafeGameRenderer2D.js';
import { drawPixelActor, drawSpriteCharacter } from '../../../rendering2d/PixelActorRenderer.js';
import { cssColor, PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

export default class RolePlayRenderer extends CafeGameRenderer2D {
    constructor(context, map) {
        super(context, map, { follow: true, atmosphere: 'day', zoom: 11 });
        this.world = null;
        this.deltaTime = 0;
        this.characters = new CanvasCharacterRoster(context.services.characterVisuals);
        this.pickupVisibility = new Map(map.pickups.map((entry) => [entry.id, true]));
        this.resize();
    }

    async preloadCharacters() {
        await this.characters.preload([
            { key: 'player', actorId: 'player', player: true, index: 0 },
            ...this.map.npcs.map((npc, index) => ({
                key: `npc:${npc.id}`,
                actorId: npc.id,
                player: false,
                index,
            })),
        ]);
    }

    sync(world, dt = 0) {
        this.world = world;
        this.deltaTime = dt;
    }

    setPickupVisible(id, visible) { this.pickupVisibility.set(id, Boolean(visible)); }

    drawMarkers(ctx) {
        for (const entry of this.map.interactables ?? []) {
            const p = this.camera.worldToScreen(entry.position);
            ctx.strokeStyle = entry.kind === 'save' ? '#4ade80' : P.cyan;
            ctx.globalAlpha = 0.42;
            ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
            ctx.globalAlpha = 1;
        }
        for (const pickup of this.map.pickups ?? []) {
            if (!this.pickupVisibility.get(pickup.id) || this.world?.collectedPickups?.has(pickup.id)) continue;
            const p = this.camera.worldToScreen(pickup.position);
            ctx.fillStyle = cssColor(pickup.color, P.gold);
            ctx.fillRect(p.x - 4, p.y - 6, 8, 8);
            ctx.fillStyle = P.white;
            ctx.fillRect(p.x - 2, p.y - 4, 4, 2);
        }
    }

    renderNpc(ctx, npc) {
        const avatar = this.characters.sync(`npc:${npc.id}`, npc, this.deltaTime);
        if (avatar) {
            drawSpriteCharacter(ctx, this.camera, avatar, { label: npc.name ?? npc.id });
            return;
        }
        drawPixelActor(ctx, this.camera, npc, { color: npc.color, label: npc.name ?? npc.id, size: 0.95 });
    }

    renderPlayer(ctx) {
        const avatar = this.characters.sync('player', this.world.player, this.deltaTime);
        if (avatar) {
            drawSpriteCharacter(ctx, this.camera, avatar, { player: true });
            return;
        }
        drawPixelActor(ctx, this.camera, this.world.player, { color: this.world.player.color, player: true });
    }

    render() {
        if (!this.world?.player) return;
        const ctx = this.begin({ target: this.world.player.position, deltaTime: this.deltaTime, atmosphere: 'day' });
        this.drawMarkers(ctx);
        for (const npc of this.world.npcs?.values?.() ?? []) {
            this.queue.add({
                layer: 20,
                y: npc.position.z,
                draw: () => this.renderNpc(ctx, npc),
            });
        }
        this.queue.add({
            layer: 21,
            y: this.world.player.position.z,
            draw: () => this.renderPlayer(ctx),
        });
        this.end(ctx);
    }

    dispose() {
        this.characters.dispose();
        this.pickupVisibility.clear();
        this.world = null;
        super.dispose();
    }
}
