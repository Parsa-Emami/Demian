import * as THREE from 'three';
import BaseGame from '../../contracts/BaseGame.js';
import CameraController from '../../core/CameraController.js';
import PostProcessingPipeline from '../../core/PostProcessingPipeline.js';
import CharacterRepository from '../../data/CharacterRepository.js';
import CharacterManager from '../../managers/CharacterManager.js';
import ArcadeWorld from '../../world/ArcadeWorld.js';
import { findGameCatalogEntry } from '../../catalog/GameCatalog.js';
import InteractionPrompt from '../../shared/interaction/ui/InteractionPrompt.js';
import { COLLISION_LAYERS } from '../../shared/collision/CollisionLayers.js';
import { createOpenWorldCollisionManifest } from '../../world/OpenWorldManifest.js';
import DEMIAN_CITY_MANIFEST from './data/DemianCityManifest.js';
import WorldPartition from './world/WorldPartition.js';
import EnvironmentSystem from './world/EnvironmentSystem.js';
import ChunkLoader from './streaming/ChunkLoader.js';
import ChunkUnloader from './streaming/ChunkUnloader.js';
import ChunkManager from './streaming/ChunkManager.js';
import OpenWorldChunkRenderer from './render/OpenWorldChunkRenderer.js';
import AiBudgetScheduler from './entities/AiBudgetScheduler.js';
import WorldDiscovery from './world/WorldDiscovery.js';
import OpenWorldSaveStore from './persistence/OpenWorldSaveStore.js';
import SavePointSystem from './persistence/SavePointSystem.js';
import OpenWorldHud from './ui/OpenWorldHud.js';

function worldSpawnPoints(manifest) {
    const points = [manifest.spawn];
    const offsets = [
        { x: -7, z: 3 },
        { x: 8, z: -4 },
        { x: -12, z: -7 },
        { x: 13, z: 8 },
        { x: -20, z: 12 },
    ];
    offsets.forEach((offset) => points.push({ x: manifest.spawn.x + offset.x, z: manifest.spawn.z + offset.z }));
    return points;
}

export default class OpenWorldGame extends BaseGame {
    constructor() {
        super();
        this.context = null;
        this.scene = null;
        this.camera = null;
        this.cameraController = null;
        this.world = null;
        this.environment = null;
        this.repository = null;
        this.characterManager = null;
        this.pipeline = null;
        this.manifest = DEMIAN_CITY_MANIFEST;
        this.partition = new WorldPartition(this.manifest);
        this.collisionScope = null;
        this.interactionScope = null;
        this.navigationScope = null;
        this.navigationGrid = null;
        this.interactionPrompt = null;
        this.interactionActorId = null;
        this.staticColliders = [];
        this.chunkManager = null;
        this.chunkRenderer = null;
        this.aiBudget = new AiBudgetScheduler({ maxUpdatesPerFrame: 6 });
        this.discovery = new WorldDiscovery();
        this.saveStore = new OpenWorldSaveStore();
        this.savePoints = null;
        this.hud = null;
        this.currentChunk = null;
        this.currentDistrict = null;
        this.sessionRestored = false;
        this.mapOpen = false;
        this.lastStreamingUpdate = { x: Infinity, z: Infinity };
        this.unsubscribeCharacterSelected = null;
        this.currentCharacterLabel = 'کاراکتر';
        this.coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.pixelRatio = 1;
        this.maxPixelRatio = 1.5;
        this.minimumPixelRatio = 0.8;
        this.qualityAccumulator = 0;
        this.qualityFrames = 0;
        this.qualityCooldown = 0;

        this.onCameraToggle = this.onCameraToggle.bind(this);
        this.onCameraReset = this.onCameraReset.bind(this);
        this.onKeyboardShortcut = this.onKeyboardShortcut.bind(this);
    }

    async preload() {
        return this.manifest;
    }

    async enter(context) {
        this.context = context;
        const { renderer } = context.renderer;
        const { performanceProfile } = context.services;
        this.maxPixelRatio = performanceProfile.maxPixelRatio;
        this.minimumPixelRatio = performanceProfile.minimumPixelRatio;
        this.pixelRatio = Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio);
        this.qualityPreference = context.settings?.snapshot?.().quality ?? 'auto';
        context.container.dataset.performanceTier = performanceProfile.tier;
        context.root?.setAttribute('data-performance-tier', performanceProfile.tier);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050714);
        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 220);
        this.cameraController = new CameraController(this.camera, context.renderer.canvas);
        this.world = new ArcadeWorld(this.scene, { performanceProfile, streamingMode: true });
        this.setupWorldServices();
        this.environment = new EnvironmentSystem({ scene: this.scene, performanceProfile });
        this.setupStreaming();

        this.discovery.discoverChunk(this.partition.chunkAt(this.manifest.spawn)?.id);
        this.discovery.unlockSavePoint('save-cafe');
        await this.chunkManager.ensureAround(this.manifest.spawn);

        this.repository = new CharacterRepository({
            baseUrl: context.options.apiBase,
            csrfToken: context.options.csrfToken,
        });
        this.characterManager = new CharacterManager({
            scene: this.scene,
            repository: this.repository,
            eventBus: context.eventBus,
            performanceProfile,
            collisionScope: this.collisionScope,
            navigationGrid: this.navigationGrid,
            worldBounds: this.manifest.bounds,
            spawnPoints: worldSpawnPoints(this.manifest),
            aiBudget: this.aiBudget,
        });
        this.pipeline = new PostProcessingPipeline(
            renderer,
            this.scene,
            this.camera,
            context.container.clientWidth,
            context.container.clientHeight,
            performanceProfile
        );

        this.savePoints = new SavePointSystem({
            manifest: this.manifest,
            discovery: this.discovery,
            store: this.saveStore,
            eventBus: context.eventBus,
            stateProvider: () => this.buildSaveState(),
        });

        this.bindCameraControls();
        await this.characterManager.boot();
        this.characterManager.setPosition(this.manifest.spawn);
        this.registerWorldInteractions();
        this.mountUi();
        this.resize();
        this.updateStreaming(true);

        context.eventBus.emit('studio:quality', {
            pixelRatio: this.pixelRatio,
            label: performanceProfile.tier.toUpperCase(),
        });

        if (this.coarsePointer || globalThis.innerWidth <= 900) {
            this.focusCharacter({ close: true, follow: true });
        } else {
            this.cameraController.overview({ immediate: true });
            this.updateCameraButtons('OVERVIEW');
            context.eventBus.emit('camera:mode', 'OVERVIEW');
        }
    }

    setupWorldServices() {
        const { collision, interaction, navigation } = this.context.services;
        this.collisionScope = collision.createScope('open-world');
        this.interactionScope = interaction.createScope('open-world');
        this.navigationScope = navigation.createScope('open-world');
        this.interactionActorId = `${this.interactionScope.owner}:player`;

        const legacyManifest = createOpenWorldCollisionManifest(this.world.cabinets);
        this.staticColliders = legacyManifest.staticColliders
            .filter((definition) => definition.metadata.kind !== 'boundary')
            .map((definition) => this.collisionScope.addStaticAabb(
                definition.id,
                definition.position,
                definition.halfExtents,
                {
                    layer: COLLISION_LAYERS.WORLD,
                    mask: COLLISION_LAYERS.CHARACTER,
                    userData: definition.metadata,
                }
            ));

        const bounds = this.manifest.bounds;
        const thickness = 0.8;
        const boundaryDefinitions = [
            { id: 'city-north', position: { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ - thickness / 2 }, halfExtents: { x: (bounds.maxX - bounds.minX) / 2 + 1, z: thickness / 2 } },
            { id: 'city-south', position: { x: (bounds.minX + bounds.maxX) / 2, z: bounds.maxZ + thickness / 2 }, halfExtents: { x: (bounds.maxX - bounds.minX) / 2 + 1, z: thickness / 2 } },
            { id: 'city-west', position: { x: bounds.minX - thickness / 2, z: (bounds.minZ + bounds.maxZ) / 2 }, halfExtents: { x: thickness / 2, z: (bounds.maxZ - bounds.minZ) / 2 + 1 } },
            { id: 'city-east', position: { x: bounds.maxX + thickness / 2, z: (bounds.minZ + bounds.maxZ) / 2 }, halfExtents: { x: thickness / 2, z: (bounds.maxZ - bounds.minZ) / 2 + 1 } },
        ];
        boundaryDefinitions.forEach((definition) => {
            this.staticColliders.push(this.collisionScope.addStaticAabb(
                definition.id,
                definition.position,
                definition.halfExtents,
                { layer: COLLISION_LAYERS.WORLD, mask: COLLISION_LAYERS.CHARACTER, userData: { kind: 'world-boundary' } }
            ));
        });

        this.navigationGrid = this.navigationScope.createGrid('demian-city', {
            ...bounds,
            cellSize: 2,
            allowDiagonal: true,
        });
        this.navigationGrid.rasterizeColliders(this.staticColliders, { padding: 0.72 });
        this.context.eventBus.emit('world:spatial-services-ready', {
            collision: this.context.services.collision.stats(),
            navigation: this.navigationGrid.stats(),
        });
    }

    setupStreaming() {
        this.chunkRenderer = new OpenWorldChunkRenderer({
            scene: this.scene,
            collisionScope: this.collisionScope,
            navigationGrid: this.navigationGrid,
            environment: this.environment,
            manifest: this.manifest,
            eventBus: this.context.eventBus,
        });
        const loader = new ChunkLoader({ factory: this.chunkRenderer, eventBus: this.context.eventBus });
        const unloader = new ChunkUnloader({ eventBus: this.context.eventBus });
        const metadata = this.manifest.serialize().metadata;
        this.chunkManager = new ChunkManager({
            manifest: this.manifest,
            partition: this.partition,
            loader,
            unloader,
            eventBus: this.context.eventBus,
            activeRadius: metadata.activeRadius,
            preloadRadius: metadata.preloadRadius,
            maxLoadedChunks: metadata.maxLoadedChunks,
            concurrency: this.context.services.performanceProfile.tier === 'low' ? 1 : 2,
        });
    }

    registerWorldInteractions() {
        this.world.cabinets.forEach((cabinet) => {
            const game = findGameCatalogEntry(cabinet.gameId);
            const collider = this.collisionScope.get(cabinet.id);
            this.interactionScope.register({
                id: cabinet.id,
                position: cabinet.interaction,
                radius: cabinet.interaction.radius,
                label: game?.available ? `اجرای ${game.title}` : game?.title ?? 'دستگاه آرکید',
                hint: game?.available ? 'ENTER · شروع بازی' : `در فاز ${game?.phase ?? 'بعدی'} فعال می‌شود`,
                priority: game?.id === 'tetris' ? 2 : 1,
                occluderId: collider?.id ?? null,
                metadata: { cabinet, game },
                action: async () => {
                    if (!game) return false;
                    if (!game.available) {
                        this.context.app.shell.toast(`${game.title} هنوز فعال نیست.`, 'info');
                        return false;
                    }
                    if (game.id === 'open-world') {
                        this.context.app.shell.toast('هم‌اکنون در Open World هستی.', 'success');
                        return true;
                    }
                    await this.context.app.launchGame(game.id, { source: 'arcade-cabinet', cabinetId: cabinet.id });
                    return true;
                },
            });
        });

        this.manifest.savePoints.forEach((point) => {
            this.interactionScope.register({
                id: `world-${point.id}`,
                position: point.position,
                radius: 2.6,
                label: `ذخیره در ${point.label}`,
                hint: 'ENTER · ذخیره و فعال‌سازی سفر سریع',
                priority: 3,
                metadata: { kind: 'save-point', point },
                action: () => {
                    this.savePoints.activate(point.id);
                    this.context.app.shell.toast(`${point.label} فعال و بازی ذخیره شد.`, 'success');
                    return true;
                },
            });
        });
    }

    mountUi() {
        const host = this.context.root?.querySelector('[data-game-hud-host]');
        this.interactionPrompt = new InteractionPrompt({
            host,
            eventBus: this.context.eventBus,
            animation: this.context.animation,
        });
        this.interactionPrompt.mount();
        this.hud = new OpenWorldHud({
            host,
            manifest: this.manifest,
            discovery: this.discovery,
            onFastTravel: (point) => this.fastTravel(point),
            onMapClosed: () => { this.mapOpen = false; },
        });
        this.hud.mount();
    }

    async fastTravel(point) {
        if (!this.discovery.isSavePointUnlocked(point.id)) return false;
        await this.chunkManager.ensureAround(point.position);
        this.characterManager.setPosition(point.position);
        this.updateStreaming(true);
        this.focusCharacter({ close: true, follow: true });
        this.savePoints.lastSavePointId = point.id;
        this.savePoints.save({ reason: 'fast-travel' });
        this.context.app.shell.toast(`سفر سریع به ${point.label}`, 'success');
        return true;
    }

    buildSaveState() {
        const position = this.characterManager?.position?.() ?? this.manifest.spawn;
        return {
            worldId: this.manifest.id,
            worldVersion: this.manifest.version,
            characterId: this.characterManager?.activeRecord?.id ?? null,
            position: { x: position.x, y: position.y ?? 0, z: position.z },
            currentChunkId: this.currentChunk?.id ?? null,
            currentDistrictId: this.currentDistrict?.id ?? null,
            discovery: this.discovery.export(),
        };
    }

    async restoreSession() {
        if (this.sessionRestored) return;
        this.sessionRestored = true;
        const state = this.savePoints.restore();
        if (!state) {
            this.characterManager.setPosition(this.manifest.spawn);
            return;
        }
        if (state.characterId && this.characterManager.characters.some((record) => String(record.id) === String(state.characterId))) {
            await this.characterManager.select(state.characterId).catch(() => undefined);
        }
        const target = this.partition.clampPosition(state.position ?? this.manifest.spawn);
        await this.chunkManager.ensureAround(target);
        this.characterManager.setPosition(target);
        this.updateStreaming(true);
    }

    updateInteraction(input) {
        const sessionIsPlaying = this.context?.app?.sessionState === 'playing' && !this.mapOpen;
        if (!sessionIsPlaying) {
            this.context?.services.interaction.clearActor(this.interactionActorId);
            return;
        }
        this.context.services.interaction.updateActor({
            actorId: this.interactionActorId,
            position: this.characterManager.position(),
            forward: this.characterManager.forward(),
        });
        if (input.interact) {
            this.context.services.interaction
                .interact(this.interactionActorId, { game: this })
                .catch((error) => this.context.app.shell.toast(error.message, 'error'));
        }
    }

    updateStreaming(force = false) {
        if (!this.characterManager || !this.chunkManager) return;
        const position = this.characterManager.position();
        const moved = Math.hypot(position.x - this.lastStreamingUpdate.x, position.z - this.lastStreamingUpdate.z);
        if (!force && moved < 2.5) return;
        this.lastStreamingUpdate = { x: position.x, z: position.z };
        this.chunkManager.update(position);
        const chunk = this.partition.chunkAt(position);
        if (chunk?.id !== this.currentChunk?.id) {
            const previousDistrict = this.currentDistrict?.id;
            this.currentChunk = chunk;
            this.currentDistrict = chunk ? this.manifest.district(chunk.districtId) : null;
            if (chunk) {
                const newlyDiscovered = this.discovery.discoverChunk(chunk.id);
                if (newlyDiscovered) this.context.eventBus.emit('world:chunk-discovered', { chunk });
                if (this.context.app.sessionState === 'playing' && previousDistrict && previousDistrict !== this.currentDistrict?.id) {
                    this.context.app.shell.toast(`ورود به ${this.currentDistrict.label}`, 'info');
                }
            }
        }
    }

    bindCameraControls() {
        this.cameraToggleButton = document.querySelector('[data-camera-toggle]');
        this.cameraResetButton = document.querySelector('[data-camera-reset]');
        this.cameraToggleButton?.addEventListener('click', this.onCameraToggle);
        this.cameraResetButton?.addEventListener('click', this.onCameraReset);
        globalThis.addEventListener('keydown', this.onKeyboardShortcut);
        this.unsubscribeCharacterSelected = this.context.eventBus.on('character:selected', ({ record }) => {
            this.currentCharacterLabel = this.shortCharacterName(record);
            this.updateCameraButtons(this.cameraController.mode);
            requestAnimationFrame(() => {
                if (this.cameraController?.mode === 'FOLLOW') this.focusCharacter({ close: true });
            });
        });
    }

    onCameraToggle() { this.toggleCamera(); }
    onCameraReset() { this.focusCharacter({ close: true }); }

    onKeyboardShortcut(event) {
        if (this.context?.app?.sessionState !== 'playing') return;
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
        if (isTyping || event.repeat) return;
        const key = event.key.toLowerCase();
        if (key === 'f') this.toggleCamera();
        if (key === 'r') this.focusCharacter({ close: true });
    }

    toggleCamera() {
        const mode = this.cameraController.toggle(this.characterManager.focusPoint());
        this.updateCameraButtons(mode);
        this.context.eventBus.emit('camera:mode', mode);
    }

    focusCharacter({ close = true, follow = true } = {}) {
        const mode = this.cameraController.focus(this.characterManager.focusPoint(), { close, follow });
        this.updateCameraButtons(mode);
        this.context.eventBus.emit('camera:mode', mode);
    }

    shortCharacterName(record) {
        const parts = String(record?.name ?? record?.slug ?? 'کاراکتر').split('/').map((part) => part.trim()).filter(Boolean);
        return parts[1] ?? parts[0] ?? 'کاراکتر';
    }

    updateCameraButtons(mode) {
        if (!this.cameraToggleButton) return;
        this.cameraToggleButton.textContent = mode === 'FOLLOW' ? 'نمای کامل · F' : `دنبال‌کردن ${this.currentCharacterLabel} · F`;
    }

    fixedUpdate(deltaTime, input) {
        if (input.toggleMap) {
            this.hud.toggleMap();
            this.mapOpen = this.hud.isMapOpen();
        }
        if (input.quickSave && this.context?.app?.sessionState === 'playing') {
            this.savePoints.save({ reason: 'quick-save' });
            this.context.app.shell.toast('پیشرفت Open World ذخیره شد.', 'success');
        }
        const basis = this.cameraController.movementBasis();
        const gameplayInput = this.context?.app?.sessionState === 'playing' && !this.mapOpen ? input : {};
        this.characterManager.update(deltaTime, gameplayInput, basis);
        this.updateInteraction(gameplayInput);
        this.updateStreaming();
        this.world.update(deltaTime);
        this.environment.update(deltaTime, this.characterManager.position());
        this.chunkManager.loaded.forEach((record) => record.handle?.update?.(deltaTime));
    }

    update(deltaTime) {
        this.updateAdaptiveQuality(deltaTime);
        this.cameraController.update(this.characterManager.focusPoint(), deltaTime);
        const position = this.characterManager.position();
        const chunkStats = this.chunkManager.stats();
        const activeChunkIds = [...this.chunkManager.loaded]
            .filter(([, record]) => record.tier === 'active')
            .map(([chunkId]) => chunkId);
        this.hud.update({
            position,
            forward: this.characterManager.forward(),
            chunkStats,
            aiStats: this.aiBudget.stats(),
            district: this.currentDistrict,
            activeChunkIds,
        });
        this.context.eventBus.emit('studio:frame', {
            state: this.characterManager.state(),
            speed: this.characterManager.speed(),
            position,
            cameraMode: this.cameraController.mode,
            chunkStats,
            districtId: this.currentDistrict?.id ?? null,
        });
    }

    render(_alpha, deltaTime) { this.pipeline.render(deltaTime); }

    updateAdaptiveQuality(deltaTime) {
        if (this.qualityPreference !== 'auto') return;
        const { performanceProfile } = this.context.services;
        this.qualityCooldown = Math.max(0, this.qualityCooldown - deltaTime);
        this.qualityAccumulator += deltaTime;
        this.qualityFrames += 1;
        if (this.qualityFrames < 90 || this.qualityCooldown > 0) return;
        const averageFrame = this.qualityAccumulator / this.qualityFrames;
        const deviceRatio = Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio);
        let nextRatio = this.pixelRatio;
        const slowFrame = 1 / Math.max(performanceProfile.targetFps - 9, 36);
        const fastFrame = 1 / Math.max(performanceProfile.targetFps - 2, 48);
        if (averageFrame > slowFrame && this.pixelRatio > this.minimumPixelRatio) nextRatio = Math.max(this.minimumPixelRatio, this.pixelRatio - 0.18);
        else if (averageFrame < fastFrame && this.pixelRatio < deviceRatio) nextRatio = Math.min(deviceRatio, this.pixelRatio + 0.1);
        this.qualityAccumulator = 0;
        this.qualityFrames = 0;
        if (Math.abs(nextRatio - this.pixelRatio) < 0.01) return;
        this.pixelRatio = nextRatio;
        this.qualityCooldown = 3;
        this.resize();
        this.context.eventBus.emit('studio:quality', {
            pixelRatio: this.pixelRatio,
            label: this.pixelRatio >= 1.45 ? 'HIGH' : this.pixelRatio >= 1.1 ? 'BALANCED' : 'PERFORMANCE',
        });
    }

    resize() {
        if (!this.context || !this.cameraController || !this.pipeline) return;
        const { width, height } = this.context.renderer.resize(this.pixelRatio);
        this.cameraController.resize(width, height);
        this.pipeline.resize(width, height, this.pixelRatio);
        if (this.hud?.isMapOpen()) this.hud.worldMap.draw();
    }

    synchronizeUi() {
        if (!this.characterManager || !this.context) return;
        this.context.eventBus.emit('characters:changed', this.characterManager.characters);
        this.characterManager.emitRosterChanged();
        if (this.characterManager.activeRecord) {
            this.context.eventBus.emit('character:selected', {
                record: this.characterManager.activeRecord,
                position: this.characterManager.position().clone(),
                height: this.characterManager.visualHeight(),
            });
        }
        this.context.eventBus.emit('camera:mode', this.cameraController.mode);
        this.context.eventBus.emit('studio:quality', {
            pixelRatio: this.pixelRatio,
            label: this.context.services.performanceProfile.tier.toUpperCase(),
        });
    }

    async startSession() {
        await this.restoreSession();
        this.mapOpen = false;
        this.hud.closeMap();
        this.updateStreaming(true);
        if (this.coarsePointer || globalThis.innerWidth <= 900) this.focusCharacter({ close: true, follow: true });
    }

    pause() {
        this.context?.services.interaction.clearActor(this.interactionActorId);
        this.savePoints?.save({ reason: 'pause' });
    }

    resume() { this.updateInteraction({}); }

    enterMenuMode() {
        this.context?.services.interaction.clearActor(this.interactionActorId);
        this.hud?.closeMap();
        this.mapOpen = false;
        this.characterManager?.setPosition(this.manifest.spawn);
        this.updateStreaming(true);
        if (!this.cameraController) return;
        this.cameraController.overview({ immediate: false });
        this.updateCameraButtons('OVERVIEW');
        this.context?.eventBus.emit('camera:mode', 'OVERVIEW');
    }

    applySettings(settings = {}) {
        if (!this.context) return;
        const profile = this.context.services.performanceProfile;
        this.qualityPreference = settings.quality ?? 'auto';
        const presets = {
            performance: { max: 1, min: 0.72, label: 'PERFORMANCE' },
            balanced: { max: 1.35, min: 0.82, label: 'BALANCED' },
            high: { max: 1.75, min: 1, label: 'HIGH' },
            auto: { max: profile.maxPixelRatio, min: profile.minimumPixelRatio, label: profile.tier.toUpperCase() },
        };
        const preset = presets[this.qualityPreference] ?? presets.auto;
        this.maxPixelRatio = preset.max;
        this.minimumPixelRatio = preset.min;
        this.pixelRatio = Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio);
        this.qualityAccumulator = 0;
        this.qualityFrames = 0;
        this.resize();
        this.context.eventBus.emit('studio:quality', { pixelRatio: this.pixelRatio, label: preset.label });
    }

    async exit() {
        if (this.sessionRestored) this.savePoints?.save({ reason: 'exit' });
        this.context?.eventBus.emit('game:exiting', { gameId: 'open-world' });
    }

    dispose() {
        this.cameraToggleButton?.removeEventListener('click', this.onCameraToggle);
        this.cameraResetButton?.removeEventListener('click', this.onCameraReset);
        globalThis.removeEventListener('keydown', this.onKeyboardShortcut);
        this.unsubscribeCharacterSelected?.();
        this.unsubscribeCharacterSelected = null;
        this.context?.services.interaction.clearActor(this.interactionActorId);
        this.interactionPrompt?.dispose();
        this.hud?.dispose();
        this.cameraController?.dispose();
        this.characterManager?.dispose();
        void this.chunkManager?.dispose();
        this.world?.dispose();
        this.environment?.dispose();
        this.pipeline?.dispose();
        this.interactionScope?.dispose();
        this.navigationScope?.dispose();
        this.collisionScope?.dispose();
        this.aiBudget.clear();

        this.cameraController = null;
        this.characterManager = null;
        this.chunkManager = null;
        this.chunkRenderer = null;
        this.world = null;
        this.environment = null;
        this.pipeline = null;
        this.collisionScope = null;
        this.interactionScope = null;
        this.navigationScope = null;
        this.navigationGrid = null;
        this.interactionPrompt = null;
        this.hud = null;
        this.interactionActorId = null;
        this.staticColliders = [];
        this.scene = null;
        this.camera = null;
        this.context = null;
    }
}
