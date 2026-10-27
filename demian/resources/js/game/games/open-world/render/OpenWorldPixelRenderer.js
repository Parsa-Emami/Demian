import CharacterFollowRig from '../../../rendering2d/CharacterFollowRig.js';
import PixelCamera2D from '../../../rendering2d/PixelCamera2D.js';
import CafePixelRenderer from '../../../rendering2d/CafePixelRenderer.js';
import StaticSceneCache from '../../../rendering2d/StaticSceneCache.js';
import PixelRenderQueue from '../../../rendering2d/PixelRenderQueue.js';
import { drawSpriteCharacter, drawCharacterSpeech } from '../../../rendering2d/PixelActorRenderer.js';
import { PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';
import { drawPixelSceneEffects } from '../../../rendering2d/PixelSceneEffects.js';
import { CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';
import { CAFE_RENDER_BOUNDS } from '../../../shared/cafe/CafeWalkthroughScene.js';
import { characterRenderPose } from '../../../characters/CharacterRenderState.js';

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
            pixelSnap: false,
        });
        this.cafe = new CafePixelRenderer({ bounds: manifest.bounds, colliders: CAFE_STATIC_COLLIDERS,
            detail: context.services?.performanceProfile?.tier === 'high' });
        this.sceneCache = new StaticSceneCache((ctx, camera, atmosphere) => this.cafe.draw(ctx, camera, { atmosphere }),
            { maxPixels: context.services?.performanceProfile?.tier === 'high' ? 3200000 : 2200000 });
        this.queue = new PixelRenderQueue();
        this.followRig = new CharacterFollowRig();
        this.followEntity = null;
        this.mode = 'OVERVIEW';
        this.camera.fitBounds(CAFE_RENDER_BOUNDS, 10);
    }

    setMode(mode, target, { immediate = false } = {}) {
        this.mode = mode === 'FOLLOW' ? 'FOLLOW' : 'OVERVIEW';
        this.followRig.reset(target);
        if (this.mode === 'FOLLOW') {
            this.camera.setZoom(this.followZoom(), { immediate });
            this.camera.follow(target, { immediate });
        } else {
            const logical = this.context.renderer.logicalDimensions();
            this.camera.resize(logical.width, logical.height).fitBounds(CAFE_RENDER_BOUNDS, 10);
        }
        return this.mode;
    }

    resize() {
        const logical = this.context.renderer.logicalDimensions();
        this.camera.resize(logical.width, logical.height);
        if (this.mode === 'OVERVIEW') this.camera.fitBounds(CAFE_RENDER_BOUNDS, 10);
        else this.camera.setZoom(this.followZoom(), { immediate: true });
    }

    followZoom() {
        const logical = this.context.renderer.logicalDimensions();
        const css = this.context.renderer.dimensions();
        // Keep a 90 CSS-pixel body at every canvas density and orientation.
        return 24 * logical.width / Math.max(1, css.width);
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

    render({ characterManager, loadedChunks, activeChunkIds, discovery, deltaTime = 0, alpha = 1 }) {
        const logical = this.context.renderer.logicalDimensions();
        const scale = this.camera.targetPixelsPerUnit;
        const padX = this.mode === 'FOLLOW' ? logical.width * .15 / scale : 0;
        const padZ = this.mode === 'FOLLOW' ? logical.height * .30 / scale : 0;
        const b = this.mode === 'OVERVIEW' ? CAFE_RENDER_BOUNDS : this.manifest.bounds;
        this.camera.bounds = { minX: b.minX - padX, maxX: b.maxX + padX, minZ: b.minZ - padZ, maxZ: b.maxZ + padZ };
        this.camera.resize(logical.width, logical.height);
        const focus = characterManager?.activeEntity
            ? characterRenderPose(characterManager.activeEntity, alpha)
            : characterManager?.position?.() ?? this.manifest.spawn;
        if (this.mode === 'FOLLOW') {
            if (this.followEntity !== characterManager?.activeEntity) {
                this.followRig.reset(focus); this.followEntity = characterManager?.activeEntity;
                this.camera.follow(focus, { immediate: true });
            }
            const target = this.followRig.sample(focus, deltaTime, { reducedMotion: this.context.settings?.resolvedReducedMotion?.() ?? false });
            this.camera.follow(target, { immediate: target.immediate });
        }
        this.camera.update(deltaTime);

        const ctx = this.context.renderer.beginFrame(P.voidBlue);
        this.sceneCache.draw(ctx, this.camera, `day:${this.cafe.revision}`);
        if (this.context.app?.options?.debug) this.drawChunks(ctx, loadedChunks, activeChunkIds);
        this.drawSavePoints(ctx, discovery);
        const feedback = characterManager?.activeEntity?.feedback;
        const reducedMotion = this.context.settings?.resolvedReducedMotion?.() ?? false;
        feedback?.draw(ctx, this.camera, { reducedMotion });

        for (const [id, entity] of characterManager?.entities ?? []) {
            if (entity?.group?.visible === false) continue;
            const position = characterRenderPose(entity, alpha);
            this.queue.add({
                layer: 20,
                y: position?.z ?? 0,
                draw: () => drawSpriteCharacter(ctx, this.camera, entity, {
                    player: entity === characterManager.activeEntity,
                    alpha,
                    label: entity === characterManager.activeEntity ? '' : (entity.character?.name ?? entity.character?.slug ?? id),
                }),
            });
        }
        this.queue.flush(ctx);
        const cssScale = logical.width / Math.max(1, this.context.renderer.dimensions().width);
        for (const entity of characterManager?.entities?.values?.() ?? []) {
            if (entity?.group?.visible !== false) drawCharacterSpeech(ctx, this.camera, entity, { alpha, cssScale });
        }
        feedback?.draw(ctx, this.camera, { foreground: true, reducedMotion });
        drawPixelSceneEffects(ctx, logical.width, logical.height, {
            scanlines: false,
            frame: false,
            vignette: false,
        });
        return this.context.renderer.present();
    }

    dispose() { this.sceneCache.dispose(); this.queue.items.length = 0; }
}
