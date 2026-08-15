import PixelCamera2D from '../../../rendering2d/PixelCamera2D.js';
import CafePixelRenderer from '../../../rendering2d/CafePixelRenderer.js';
import PixelRenderQueue from '../../../rendering2d/PixelRenderQueue.js';
import { drawSpriteCharacter } from '../../../rendering2d/PixelActorRenderer.js';
import { PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';
import { drawPixelSceneEffects } from '../../../rendering2d/PixelSceneEffects.js';
import { CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';

export default class OpenWorldPixelRenderer {
    constructor(context, manifest) {
        this.context = context;
        this.manifest = manifest;
        const logical = context.renderer.logicalDimensions();
        this.camera = new PixelCamera2D({
            bounds: manifest.bounds,
            viewportWidth: logical.width,
            viewportHeight: logical.height,
            pixelsPerUnit: 9,
            smoothing: 8,
        });
        this.cafe = new CafePixelRenderer({ bounds: manifest.bounds, colliders: CAFE_STATIC_COLLIDERS });
        this.queue = new PixelRenderQueue();
        this.mode = 'OVERVIEW';
        this.camera.fitBounds(manifest.bounds, 10);
    }

    setMode(mode, target, { immediate = false } = {}) {
        this.mode = mode === 'FOLLOW' ? 'FOLLOW' : 'OVERVIEW';
        if (this.mode === 'FOLLOW') {
            this.camera.setZoom(15, { immediate });
            this.camera.follow(target, { immediate });
        } else {
            const logical = this.context.renderer.logicalDimensions();
            this.camera.resize(logical.width, logical.height).fitBounds(this.manifest.bounds, 10);
        }
        return this.mode;
    }

    resize() {
        const logical = this.context.renderer.logicalDimensions();
        this.camera.resize(logical.width, logical.height);
        if (this.mode === 'OVERVIEW') this.camera.fitBounds(this.manifest.bounds, 10);
    }

    drawChunks(ctx, loadedChunks = new Map(), activeChunkIds = []) {
        const active = new Set(activeChunkIds);
        for (const [chunkId, record] of loadedChunks) {
            const chunk = this.manifest.chunk(chunkId);
            if (!chunk) continue;
            const center = this.camera.worldToScreen(chunk.center);
            const size = Math.round(this.manifest.chunkSize * this.camera.pixelsPerUnit);
            ctx.strokeStyle = active.has(chunkId) ? P.cyan : '#8b735f';
            ctx.globalAlpha = active.has(chunkId) ? 0.42 : record.tier === 'preload' ? 0.18 : 0.1;
            ctx.lineWidth = active.has(chunkId) ? 2 : 1;
            ctx.strokeRect(center.x - size / 2 + 0.5, center.y - size / 2 + 0.5, size - 1, size - 1);
            ctx.globalAlpha = 1;
        }
    }

    drawSavePoints(ctx, discovery) {
        for (const point of this.manifest.savePoints) {
            const p = this.camera.worldToScreen(point.position);
            const unlocked = discovery?.isSavePointUnlocked?.(point.id);
            ctx.strokeStyle = unlocked ? '#4ade80' : '#64748b';
            ctx.lineWidth = unlocked ? 2 : 1;
            ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
            if (unlocked) {
                ctx.fillStyle = '#4ade80';
                ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
            }
        }
    }

    render({ characterManager, loadedChunks, activeChunkIds, discovery, deltaTime = 0 }) {
        const logical = this.context.renderer.logicalDimensions();
        this.camera.resize(logical.width, logical.height);
        const focus = characterManager?.position?.() ?? this.manifest.spawn;
        if (this.mode === 'FOLLOW') this.camera.follow(focus);
        this.camera.update(deltaTime);

        const ctx = this.context.renderer.beginFrame(P.voidBlue);
        this.cafe.draw(ctx, this.camera, { atmosphere: 'day' });
        this.drawChunks(ctx, loadedChunks, activeChunkIds);
        this.drawSavePoints(ctx, discovery);

        for (const [id, entity] of characterManager?.entities ?? []) {
            if (entity?.group?.visible === false) continue;
            const position = entity?.group?.position;
            this.queue.add({
                layer: 20,
                y: position?.z ?? 0,
                draw: () => drawSpriteCharacter(ctx, this.camera, entity, {
                    player: entity === characterManager.activeEntity,
                    label: entity === characterManager.activeEntity ? '' : (entity.character?.name ?? entity.character?.slug ?? id),
                }),
            });
        }
        this.queue.flush(ctx);
        drawPixelSceneEffects(ctx, logical.width, logical.height, {
            scanlines: true,
            frame: true,
            vignette: true,
        });
        return this.context.renderer.present();
    }

    dispose() { this.queue.items.length = 0; }
}
