import * as THREE from 'three';
import SpriteCharacter from '../characters/SpriteCharacter';
import NpcBrain from '../npc/NpcBrain';
import CharacterAssetLoader from '../characters/runtime/CharacterAssetLoader.js';
import { WORLD_CONFIG } from '../world/WorldConfig';
import { CHARACTER_MOVEMENT_SETTINGS } from '../characters/CharacterLocomotionModel.js';
import {
    characterRuntimeVariants,
} from '../characters/runtime/CharacterRuntimePolicy.js';
import { optionalAssetPolicy } from '../characters/runtime/MobileNetworkPolicy.js';
import { preloadCharacterRoster } from '../performance/CharacterRosterStartup.js';
import {
    BUILTIN_CHARACTER_SLUGS,
    builtinCharacterAssetPair,
    isRetiredCharacter,
    normalizeSpriteVariant,
} from '../characters/CharacterVisualContract.js';

import { BUILTIN_CHARACTER_LABELS as LABELS, characterManifestEntry } from '../characters/manifests/CharacterManifestRegistry.js';
const BUILTIN_DEFINITIONS = Object.freeze(BUILTIN_CHARACTER_SLUGS.map((slug) => Object.freeze({
    id: `builtin-${slug}`, name: LABELS[slug], slug, is_active: slug === 'darya',
    settings: { ...CHARACTER_MOVEMENT_SETTINGS, asset_pack_version: characterManifestEntry(slug).packVersion,
        production_status: characterManifestEntry(slug).productionStatus,
        locomotion_style: characterManifestEntry(slug).locomotionStyle ?? 'ground-runner',
        ...(slug === 'darya' ? { companion: 'pishi', companion_always_visible: true } : {}),
        ...(slug === 'tiam' ? { companion: 'homayoun', companion_always_visible: true } : {}),
        ...(characterManifestEntry(slug).locomotionStyle === 'wing-assisted' ? { signature_action: 'slide' } : {}),
    },
})));

const BUILTIN_SLUGS = new Set(BUILTIN_CHARACTER_SLUGS);
const BUILTIN_DEFINITION_SLUGS = new Set(BUILTIN_DEFINITIONS.map((character) => character.slug));

for (const slug of BUILTIN_CHARACTER_SLUGS) {
    if (!BUILTIN_DEFINITION_SLUGS.has(slug)) {
        throw new Error(`Missing built-in character definition: ${slug}`);
    }
}

function builtinAssetPair(slug, variant = 'mobile') {
    return builtinCharacterAssetPair(slug, variant);
}

function cloneBuiltin(character, spriteVariant = 'mobile') {
    const suffix = normalizeSpriteVariant(spriteVariant);

    const pair = builtinAssetPair(character.slug, suffix);

    return {
        ...character,
        settings: { ...character.settings, scale: 1 },
        sprite_url: pair.spriteUrl,
        atlas_url: pair.atlasUrl,
        is_builtin: true,
    };
}

export default class CharacterManager {
    static preloadRoster(repository, options = {}) {
        return preloadCharacterRoster(repository, options);
    }

    constructor({
        scene,
        repository,
        eventBus,
        performanceProfile = null,
        visualService = null,
        collisionScope = null,
        navigationGrid = null,
        worldBounds = WORLD_CONFIG.bounds,
        spawnPoints = WORLD_CONFIG.spawnPoints,
        aiBudget = null,
    }) {
        this.scene = scene;
        this.repository = repository;
        this.eventBus = eventBus;
        this.performanceProfile = performanceProfile;
        this.visualService = visualService;
        this.selectionGeneration = 0;
        this.collisionScope = collisionScope;
        this.navigationGrid = navigationGrid;
        this.worldBounds = Object.freeze('minX' in worldBounds ? { ...worldBounds } : { minX: -worldBounds.x, maxX: worldBounds.x, minZ: -worldBounds.z, maxZ: worldBounds.z });
        this.spawnPoints = Object.freeze(spawnPoints.map((point) => Object.freeze({ ...point })));
        this.aiBudget = aiBudget;
        this.colliderKeys = new Map();
        this.characterRadius = 0.72;
        this.runtimeVariants = characterRuntimeVariants(performanceProfile);
        this.spriteVariant = this.runtimeVariants.active;
        this.characters = [];
        this.activeRecord = null;
        this.activeEntity = null;
        this.entities = new Map();
        this.brains = new Map();
        this.assetLoader = new CharacterAssetLoader({ visualService, activeVariant: this.runtimeVariants.active });
        this.entityPromises = new Map();
        this.lastBootWarning = null;
        this.disposed = false;
        this.hydrationGeneration = 0;
        this.npcLimit = Math.max(2, Number(performanceProfile?.npcCount ?? 3));
        this.onOptionalNetworkChange = () => {
            const network = optionalAssetPolicy();
            if (network.deferBackground) {
                ++this.hydrationGeneration;
                this.visualService?.cancelBackgroundLoads?.();
                return;
            }
            if (!this.disposed && this.activeRecord) this.startBackgroundHydration();
        };
        globalThis.document?.addEventListener?.('visibilitychange', this.onOptionalNetworkChange);
        globalThis.window?.addEventListener?.('online', this.onOptionalNetworkChange);
        globalThis.window?.addEventListener?.('offline', this.onOptionalNetworkChange);
        globalThis.navigator?.connection?.addEventListener?.('change', this.onOptionalNetworkChange);
    }

    async boot({ preferredSlug = null, initialVariant = this.runtimeVariants.active,
        rosterPromise = null } = {}) {
        // Static and remote rosters share the same settled result contract.
        // The request can already be running while collision/UI initialize.
        const roster = await (rosterPromise ?? CharacterManager.preloadRoster(this.repository));
        this.characters = roster.characters;
        if (roster.error) {
            console.warn('Character API was unavailable; built-in characters were loaded.', roster.error);
            this.lastBootWarning = roster.error;
        }

        this.ensureBuiltinCharacters();

        const active =
            this.characters.find((character) => character.slug === preferredSlug) ??
            this.characters.find((character) => character.is_active) ??
            this.characters[0];

        if (!active) {
            throw new Error('هیچ کاراکتری برای اجرا وجود ندارد.');
        }

        await this.select(active.id, { preservePosition: false, hydrateRoster: false,
            variant: initialVariant });
        this.eventBus.emit('characters:changed', this.characters);
        this.emitRosterChanged();

        if (this.lastBootWarning) {
            this.eventBus.emit('character:warning', {
                message:
                    'ارتباط دیتابیس برقرار نبود؛ همهٔ کاراکترهای داخلی از فایل‌های بسته‌بندی‌شده اجرا شدند.',
            });
        }

        return this.characters;
    }

    ensureBuiltinCharacters() {
        const existingBySlug = new Map(
            this.characters.map((character) => [character.slug, character])
        );

        const builtins = BUILTIN_DEFINITIONS.filter((definition) => BUILTIN_SLUGS.has(definition.slug)).map((definition) => {
            const builtin = cloneBuiltin(definition, this.spriteVariant);
            const existing = existingBySlug.get(builtin.slug);

            if (!existing) {
                return builtin;
            }

            return {
                ...builtin,
                ...existing,
                // Runtime and bundled atlas must always remain a matching pair.
                sprite_url: builtin.sprite_url,
                atlas_url: builtin.atlas_url,
                is_builtin: true,
                settings: {
                    ...builtin.settings,
                    ...(existing.settings ?? {}),
                    // Built-in characters always share one canonical world size.
                    ...CHARACTER_MOVEMENT_SETTINGS,
                    asset_pack_version: builtin.settings.asset_pack_version,
                    production_status: builtin.settings.production_status,
                    locomotion_style: builtin.settings.locomotion_style,
                },
            };
        });

        const customCharacters = this.characters.filter(
            (character) => !character.is_builtin && !isRetiredCharacter(character.slug) && !BUILTIN_DEFINITION_SLUGS.has(character.slug) && character.sprite_url && character.atlas_url
        );

        builtins.sort((a, b) => BUILTIN_CHARACTER_SLUGS.indexOf(a.slug) - BUILTIN_CHARACTER_SLUGS.indexOf(b.slug));
        this.characters = [...builtins, ...customCharacters];
    }

    rosterRecords(activeId = this.activeRecord?.id) {
        const active = this.characters.find(
            (character) => String(character.id) === String(activeId)
        );
        const others = this.characters.filter(
            (character) => String(character.id) !== String(activeId)
        );

        return [active, ...others]
            .filter(Boolean)
            .slice(0, this.npcLimit + 1);
    }

    async populateWorld(activeId, {
        background = false,
        generation = this.hydrationGeneration,
    } = {}) {
        if (this.disposed || generation !== this.hydrationGeneration) return;

        const policy = optionalAssetPolicy();
        // Critical player sprite is always loaded; optional NPCs are deferred on
        // Save-Data, 2G, offline and hidden tabs, or limited to one on 3G.
        const roster = this.rosterRecords(activeId).slice(0,
            1 + Math.min(this.npcLimit, policy.maxBackgroundNpcs));
        const active = roster[0];

        if (active) {
            await this.ensureEntity(active, 0, {
                variant: this.runtimeVariants.active, background,
            });
        }

        if (this.disposed || generation !== this.hydrationGeneration) return;

        for (let index = 1; index < roster.length; index += 1) {
            if (this.disposed || generation !== this.hydrationGeneration) {
                break;
            }

            const record = roster[index];
            try {
                if (background && (optionalAssetPolicy().deferBackground ||
                    generation !== this.hydrationGeneration)) break;
                await this.ensureEntity(record, index, {
                    variant: this.runtimeVariants.npc, background,
                });
                if (background) {
                    this.emitRosterChanged();
                    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
                }
            } catch (error) {
                if (error?.name === 'AbortError') break;
                console.warn('NPC character could not be loaded.', error);
            }
        }
    }

    startBackgroundHydration(activeId = this.activeRecord?.id) {
        const generation = ++this.hydrationGeneration;
        // Invalidate old optional work on rapid character switches and scene
        // transitions without touching a promoted foreground sprite request.
        this.visualService?.cancelBackgroundLoads?.();
        if (optionalAssetPolicy().deferBackground) return;
        const run = async () => {
            if (this.disposed || generation !== this.hydrationGeneration) return;
            await this.populateWorld(activeId, { background: true, generation });
            if (!this.disposed && generation === this.hydrationGeneration) {
                this.pruneRoster(activeId);
                this.emitRosterChanged();
            }
        };

        const schedule = globalThis.requestIdleCallback
            ? (callback) => globalThis.requestIdleCallback(callback, { timeout: 500 })
            : (callback) => globalThis.setTimeout(callback, 0);
        schedule(() => void run());
    }

    async reload() {
        try {
            this.characters = await this.repository.list();
        } catch (error) {
            console.warn('Character list reload failed.', error);
            this.characters = this.characters.filter((character) =>
                BUILTIN_SLUGS.has(character.slug)
            );
        }

        this.ensureBuiltinCharacters();
        const activeId = this.activeRecord?.id ?? this.characters[0]?.id;
        if (activeId) this.startBackgroundHydration(activeId);
        this.eventBus.emit('characters:changed', this.characters);
        this.emitRosterChanged();
        return this.characters;
    }

    async ensureEntity(record, spawnIndex = 0, {
        variant = this.runtimeVariants.npc, background = false,
    } = {}) {
        const key = String(record.id);
        const existing = this.entities.get(key);
        if (existing) return this.ensureEntityVariant(record, existing, variant, { background });

        const pending = this.entityPromises.get(key);
        if (pending) {
            const entity = await pending;
            return this.ensureEntityVariant(record, entity, variant, { background });
        }

        const creation = this.createEntity(record, spawnIndex, variant, key, { background })
            .finally(() => this.entityPromises.delete(key));
        this.entityPromises.set(key, creation);
        return await creation;
    }

    variantRank(variant) {
        return { lite: 1, compact: 2, runtime: 3, mobile: 4, desktop: 5, detail: 6, custom: 6 }[variant] ?? 0;
    }

    async ensureEntityVariant(record, entity, variant, { background = false } = {}) {
        const currentVariant = entity.runtimeSpriteVariant ?? 'compact';
        const downgradeNpc = variant === 'lite' && entity !== this.activeEntity && !entity.isPlayerControlled;
        if (currentVariant === variant || (!downgradeNpc && this.variantRank(variant) <= this.variantRank(currentVariant))) {
            return entity;
        }

        let assets;
        try {
            assets = await this.loadCharacterAssets(record, { preferredVariant: variant, background });
        } catch (error) {
            console.warn('Higher-resolution character asset could not be loaded; keeping current visuals.', {
                slug: record.slug,
                currentVariant,
                requestedVariant: variant,
                error,
            });
            return entity;
        }

        if (this.disposed || this.entities.get(String(record.id)) !== entity || (variant === 'lite' && entity.isPlayerControlled)) {
            assets.texture?.dispose?.();
            return entity;
        }

        entity.replaceVisualAssets(assets.texture, assets.atlas);
        entity.runtimeSpriteVariant = assets.fallback ? 'fallback' : (assets.variant ?? variant);
        return entity;
    }

    async createEntity(record, spawnIndex, variant, key, { background = false } = {}) {
        let assets;
        try {
            assets = await this.loadCharacterAssets(record, { preferredVariant: variant, background });
        } catch (error) {
            if (background && error?.name === 'AbortError') throw error;
            console.warn('Character assets were unavailable; using the built-in pixel fallback.', {
                slug: record.slug,
                error,
            });
            this.lastBootWarning ??= error;
            assets = this.createFallbackCharacterAssets(record);
        }

        if (this.disposed) {
            assets.texture?.dispose?.();
            throw new Error('Character manager was disposed while an asset was loading.');
        }

        const existing = this.entities.get(key);
        if (existing) {
            assets.texture?.dispose?.();
            return existing;
        }

        const { texture, atlas } = assets;
        const entity = new SpriteCharacter({
            scene: this.scene,
            character: record,
            texture,
            atlas,
            controlled: false,
        });
        entity.runtimeSpriteVariant = assets.fallback ? 'fallback' : (assets.variant ?? variant);
        entity.setWorldBounds(this.worldBounds);

        const spawn = this.spawnPoints[spawnIndex % this.spawnPoints.length];
        entity.group.position.set(spawn.x, 0, spawn.z);
        this.scene.add(entity.group);

        this.entities.set(key, entity);
        this.brains.set(key, new NpcBrain(entity, spawnIndex, {
            navigationGrid: this.navigationGrid,
            worldBounds: this.worldBounds,
        }));
        this.attachCollision(key, entity);
        return entity;
    }

    attachCollision(key, entity) {
        if (!this.collisionScope || this.colliderKeys.has(key)) {
            return;
        }

        const localId = `character-${key}`;
        this.collisionScope.addDynamicCircle(
            localId,
            entity.group.position,
            this.characterRadius,
            { userData: { kind: 'character', characterId: key, entity } }
        );
        this.colliderKeys.set(key, localId);
        this.bindMovementResolver(key, entity);
    }

    bindMovementResolver(key, entity) {
        const localId = this.colliderKeys.get(String(key));
        if (!localId || !this.collisionScope || !entity) return;
        entity.setMovementResolver(
            ({ target }) => this.collisionScope.moveCircle(localId, target, {
                collideWithDynamic: true,
                maxSubstep: this.characterRadius * 0.45,
            }),
            { radius: this.characterRadius }
        );
    }

    syncCollision(key, entity) {
        const localId = this.colliderKeys.get(key);
        if (localId && this.collisionScope) {
            this.collisionScope.sync(localId, entity.group.position);
        }
    }

    async select(id, { preservePosition = true, hydrateRoster = true,
        variant = 'lite' } = {}) {
        const generation = ++this.selectionGeneration;
        const record = this.characters.find(
            (character) => String(character.id) === String(id)
        );

        if (!record) {
            throw new Error('کاراکتر انتخاب‌شده پیدا نشد.');
        }

        this.eventBus.emit('character:loading', record);
        if (this.visualService && BUILTIN_SLUGS.has(record.slug)) {
            void this.visualService.loadPack(record.slug, variant).catch(() => undefined);
            this.hydrationGeneration++;
            this.visualService.cancelBackgroundLoads();
        }

        const nextEntity = await this.ensureEntity(record, this.entities.size, { variant });
        if (this.disposed || generation !== this.selectionGeneration) return null;
        const previousEntity = this.activeEntity;
        const previousPosition = previousEntity?.group.position.clone();
        const nextNpcPosition = nextEntity.group.position.clone();

        if (previousEntity && previousEntity !== nextEntity) {
            previousEntity.setPlayerControlled(false);
            this.bindMovementResolver(String(previousEntity.character.id), previousEntity);
            if (preservePosition && previousPosition) {
                previousEntity.group.position.copy(nextNpcPosition);
                nextEntity.group.position.copy(previousPosition);
                this.syncCollision(String(previousEntity.character.id), previousEntity);
                this.syncCollision(String(nextEntity.character.id), nextEntity);
            }
        }

        nextEntity.setPlayerControlled(true, { playIntro: !previousEntity });
        this.bindMovementResolver(String(nextEntity.character.id), nextEntity);
        this.activeRecord = record;
        this.activeEntity = nextEntity;

        this.characters = this.characters.map((character) => ({
            ...character,
            is_active: String(character.id) === String(record.id),
        }));

        this.pruneRoster(record.id);
        if (hydrateRoster) this.startBackgroundHydration(record.id);

        this.eventBus.emit('character:selected', {
            record,
            position: nextEntity.group.position.clone(),
            height: nextEntity.visualHeight(),
        });
        this.eventBus.emit('characters:changed', this.characters);
        this.emitRosterChanged();

        return nextEntity;
    }

    pruneRoster(activeId) {
        const keep = new Set(this.rosterRecords(activeId).map((record) => String(record.id)));

        [...this.entities.entries()].forEach(([key, entity]) => {
            if (keep.has(key)) {
                return;
            }

            this.scene.remove(entity.group);
            entity.dispose();
            this.entities.delete(key);
            this.brains.delete(key);
            this.aiBudget?.remove(key);
            const colliderId = this.colliderKeys.get(key);
            if (colliderId) this.collisionScope?.remove(colliderId);
            this.colliderKeys.delete(key);
        });
    }

    emitRosterChanged() {
        this.eventBus.emit('world:roster', {
            activeId: this.activeRecord?.id ?? null,
            visibleCharacters: [...this.entities.keys()],
            npcCount: Math.max(this.entities.size - 1, 0),
        });
    }

    async activate(id) {
        const record = this.characters.find(
            (character) => String(character.id) === String(id)
        );

        if (!record) {
            throw new Error('کاراکتر انتخاب‌شده پیدا نشد.');
        }

        if (record.is_builtin) {
            if (!String(record.id).startsWith('builtin-')) {
                try {
                    await this.repository.activate(record.id);
                } catch (error) {
                    console.warn(
                        'Built-in activation was kept locally because persistence is unavailable.',
                        error
                    );
                }
            }

            await this.select(record.id);
            this.eventBus.emit('characters:changed', this.characters);
            return { ...record, is_active: true };
        }

        const activated = await this.repository.activate(id);
        const index = this.characters.findIndex(
            (character) => String(character.id) === String(id)
        );
        if (index >= 0) {
            this.characters[index] = { ...this.characters[index], ...activated };
        }

        await this.select(activated.id);
        this.eventBus.emit('characters:changed', this.characters);
        return activated;
    }

    async create(formData) {
        const created = await this.repository.create(formData);
        await this.reload();
        return created;
    }

    async remove(id) {
        const record = this.characters.find(
            (character) => String(character.id) === String(id)
        );

        if (record?.is_builtin) {
            throw new Error('کاراکترهای داخلی بازی قابل حذف نیستند.');
        }

        await this.repository.remove(id);
        const removedWasActive = String(this.activeRecord?.id) === String(id);
        this.disposeEntity(id);
        await this.reload();

        if (removedWasActive) {
            const next =
                this.characters.find((character) => character.is_active) ??
                this.characters[0];

            if (next) {
                await this.select(next.id, { preservePosition: false });
            }
        }
    }

    update(deltaTime, input, movementBasis) {
        if (!this.activeEntity) {
            return;
        }

        this.activeEntity.update(deltaTime, input, movementBasis);
        this.syncCollision(String(this.activeRecord?.id), this.activeEntity);
        const activeCollider = this.activeColliderId();
        if (activeCollider) this.collisionScope?.updateTriggers(activeCollider);
        const neighbours = [...this.entities.values()];
        this.aiBudget?.beginFrame();

        this.entities.forEach((entity, key) => {
            if (entity === this.activeEntity) {
                entity.group.visible = true;
                return;
            }

            const distance = entity.group.position.distanceTo(this.activeEntity.group.position);
            const budget = this.aiBudget?.take(key, deltaTime, distance, { visible: entity.group.visible }) ?? {
                update: true,
                deltaTime,
                render: true,
                simulateOnly: false,
            };
            entity.group.visible = budget.render;
            if (!budget.update) return;

            const brain = this.brains.get(key);
            const npcInput = brain?.update(
                budget.deltaTime,
                this.activeEntity,
                neighbours
            );
            if (!budget.simulateOnly) {
                entity.update(budget.deltaTime, npcInput ?? { x: 0, z: 0 }, movementBasis);
                this.syncCollision(key, entity);
            }
        });
    }

    activeColliderId() {
        const key = String(this.activeRecord?.id ?? '');
        return this.colliderKeys.get(key) ?? null;
    }

    forward() {
        const direction = this.activeEntity?.lastMoveDirection;
        return direction
            ? { x: direction.x, z: direction.z }
            : { x: 0, z: 1 };
    }

    position() {
        return this.activeEntity?.group.position ?? new THREE.Vector3();
    }


    setPosition(position, { sync = true } = {}) {
        if (!this.activeEntity) return false;
        const x = Math.max(this.worldBounds.minX, Math.min(this.worldBounds.maxX, Number(position?.x) || 0));
        const z = Math.max(this.worldBounds.minZ, Math.min(this.worldBounds.maxZ, Number(position?.z) || 0));
        this.activeEntity.group.position.set(x, Number(position?.y) || 0, z);
        if (sync) this.syncCollision(String(this.activeRecord?.id), this.activeEntity);
        return true;
    }

    focusPoint() {
        if (!this.activeEntity) {
            return new THREE.Vector3(0, 1.75, 0);
        }

        return this.activeEntity.focusPoint();
    }

    visualHeight() {
        return this.activeEntity?.visualHeight() ?? 3.4;
    }

    speed() {
        return this.activeEntity?.speed() ?? 0;
    }

    state() {
        return this.activeEntity?.state ?? 'loading';
    }

    loadCharacterAssets(record, options) {
        return this.assetLoader.loadCharacterAssets(record, options);
    }

    createFallbackCharacterAssets(record) {
        return this.assetLoader.createFallbackCharacterAssets(record);
    }

    disposeEntity(id) {
        const key = String(id);
        const entity = this.entities.get(key);
        if (!entity) {
            return;
        }

        this.scene.remove(entity.group);
        entity.dispose();
        this.entities.delete(key);
        this.brains.delete(key);
        this.aiBudget?.remove(key);
        const colliderId = this.colliderKeys.get(key);
        if (colliderId) this.collisionScope?.remove(colliderId);
        this.colliderKeys.delete(key);

        if (entity === this.activeEntity) {
            this.activeEntity = null;
            this.activeRecord = null;
        }
    }

    disposeActive() {
        if (this.activeRecord) {
            this.disposeEntity(this.activeRecord.id);
        }
    }

    dispose() {
        this.disposed = true;
        this.selectionGeneration += 1;
        this.hydrationGeneration += 1;
        this.visualService?.cancelBackgroundLoads?.();
        globalThis.document?.removeEventListener?.('visibilitychange', this.onOptionalNetworkChange);
        globalThis.window?.removeEventListener?.('online', this.onOptionalNetworkChange);
        globalThis.window?.removeEventListener?.('offline', this.onOptionalNetworkChange);
        globalThis.navigator?.connection?.removeEventListener?.('change', this.onOptionalNetworkChange);
        this.assetLoader.dispose();
        this.entityPromises.clear();
        [...this.entities.keys()].forEach((key) => this.disposeEntity(key));
        this.colliderKeys.clear();
        this.collisionScope = null;
        this.navigationGrid = null;
        this.aiBudget?.clear?.();
        this.aiBudget = null;
    }
}
