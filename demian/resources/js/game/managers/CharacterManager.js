import * as THREE from 'three';
import SpriteCharacter from '../characters/SpriteCharacter';
import NpcBrain from '../npc/NpcBrain';
import { WORLD_CONFIG } from '../world/WorldConfig';

function builtinAssetUrl(relativePath) {
    return new URL(relativePath.replace(/^\/+/, ''), document.baseURI).toString();
}

const BUILTIN_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: 'builtin-tiam',
        name: 'TIAM / تیام',
        slug: 'tiam',
        is_active: true,
        settings: {
            walk_speed: 3.4,
            run_speed: 6.55,
            sprint_speed: 7.25,
            jump_force: 6.7,
            air_control: 0.56,
            scale: 1,
        },
    }),
    Object.freeze({
        id: 'builtin-ronak',
        name: 'RONAK / روناک',
        slug: 'ronak',
        is_active: false,
        settings: {
            walk_speed: 3.45,
            run_speed: 6.7,
            sprint_speed: 7.35,
            jump_force: 6.75,
            air_control: 0.54,
            scale: 1,
        },
    }),
    Object.freeze({
        id: 'builtin-amirreza',
        name: 'AMIRREZA / امیررضا',
        slug: 'amirreza',
        is_active: false,
        settings: {
            walk_speed: 4.25,
            run_speed: 8.55,
            sprint_speed: 9.5,
            jump_force: 7.05,
            air_control: 0.62,
            scale: 1,
        },
    }),
    Object.freeze({
        id: 'builtin-parsa',
        name: 'PARSA / پارسا',
        slug: 'parsa',
        is_active: false,
        settings: {
            walk_speed: 4.5,
            run_speed: 9.1,
            sprint_speed: 10.15,
            jump_force: 7.35,
            air_control: 0.68,
            scale: 1,
            role_title: 'FASTEST / STRONGEST',
            tagline: 'Black-shadow runner · Red guitar solo',
            speed_rating: 'S+',
            power_rating: 'S+',
            signature_action: 'guitar',
        },
    }),
]);

const BUILTIN_SLUGS = new Set(BUILTIN_DEFINITIONS.map((character) => character.slug));
const SPRITE_VARIANTS = Object.freeze(['mobile', 'compact', 'desktop']);

function builtinAssetPair(slug, variant = 'mobile') {
    const suffix = SPRITE_VARIANTS.includes(variant) ? variant : 'mobile';

    return {
        spriteUrl: builtinAssetUrl(
            `assets/characters/${slug}/${slug}-spritesheet-v5-${suffix}.png`
        ),
        atlasUrl: builtinAssetUrl(
            `assets/characters/${slug}/${slug}-atlas-v5-${suffix}.json`
        ),
    };
}

function cloneBuiltin(character, spriteVariant = 'mobile') {
    const suffix = ['desktop', 'mobile', 'compact'].includes(spriteVariant)
        ? spriteVariant
        : 'mobile';

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
    constructor({
        scene,
        repository,
        eventBus,
        performanceProfile = null,
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
        this.collisionScope = collisionScope;
        this.navigationGrid = navigationGrid;
        this.worldBounds = Object.freeze('minX' in worldBounds ? { ...worldBounds } : { minX: -worldBounds.x, maxX: worldBounds.x, minZ: -worldBounds.z, maxZ: worldBounds.z });
        this.spawnPoints = Object.freeze(spawnPoints.map((point) => Object.freeze({ ...point })));
        this.aiBudget = aiBudget;
        this.colliderKeys = new Map();
        this.characterRadius = 0.72;
        this.spriteVariant = performanceProfile?.spriteVariant?.() ?? 'mobile';
        this.characters = [];
        this.activeRecord = null;
        this.activeEntity = null;
        this.entities = new Map();
        this.brains = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.lastBootWarning = null;
        this.npcLimit = Math.max(2, Number(performanceProfile?.npcCount ?? 3));
    }

    async boot() {
        try {
            this.characters = await this.repository.list();
        } catch (error) {
            console.warn(
                'Character API was unavailable; built-in characters were loaded.',
                error
            );
            this.lastBootWarning = error;
            this.characters = [];
        }

        this.ensureBuiltinCharacters();

        const active =
            this.characters.find((character) => character.is_active) ??
            this.characters[0];

        if (!active) {
            throw new Error('هیچ کاراکتری برای اجرا وجود ندارد.');
        }

        await this.populateWorld(active.id);
        await this.select(active.id, { preservePosition: false });
        this.eventBus.emit('characters:changed', this.characters);
        this.emitRosterChanged();

        if (this.lastBootWarning) {
            this.eventBus.emit('character:warning', {
                message:
                    'ارتباط دیتابیس برقرار نبود؛ تیام، روناک، امیررضا و پارسا از فایل‌های داخلی اجرا شدند.',
            });
        }

        return this.characters;
    }

    ensureBuiltinCharacters() {
        const existingBySlug = new Map(
            this.characters.map((character) => [character.slug, character])
        );

        const builtins = BUILTIN_DEFINITIONS.map((definition) => {
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
                    scale: 1,
                },
            };
        });

        const customCharacters = this.characters.filter(
            (character) => !BUILTIN_SLUGS.has(character.slug)
        );

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

    async populateWorld(activeId) {
        const roster = this.rosterRecords(activeId);
        const active = roster[0];

        if (active) {
            await this.ensureEntity(active, 0);
        }

        const results = await Promise.allSettled(
            roster.slice(1).map((record, index) => this.ensureEntity(record, index + 1))
        );

        results.forEach((result) => {
            if (result.status === 'rejected') {
                console.warn('NPC character could not be loaded.', result.reason);
            }
        });
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
        await this.populateWorld(this.activeRecord?.id ?? this.characters[0]?.id);
        this.eventBus.emit('characters:changed', this.characters);
        this.emitRosterChanged();
        return this.characters;
    }

    async ensureEntity(record, spawnIndex = 0) {
        const key = String(record.id);
        const existing = this.entities.get(key);

        if (existing) {
            return existing;
        }

        const { texture, atlas } = await this.loadCharacterAssets(record);

        const entity = new SpriteCharacter({
            scene: this.scene,
            character: record,
            texture,
            atlas,
            controlled: false,
        });
        entity.setWorldBounds(this.worldBounds);

        const spawn = this.spawnPoints[
            spawnIndex % this.spawnPoints.length
        ];
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

    async select(id, { preservePosition = true } = {}) {
        const record = this.characters.find(
            (character) => String(character.id) === String(id)
        );

        if (!record) {
            throw new Error('کاراکتر انتخاب‌شده پیدا نشد.');
        }

        this.eventBus.emit('character:loading', record);

        const nextEntity = await this.ensureEntity(record, this.entities.size);
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

        await this.populateWorld(record.id);
        this.pruneRoster(record.id);

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

    characterAssetPairs(record) {
        const pairs = [];
        const seen = new Set();
        const add = (spriteUrl, atlasUrl) => {
            if (!spriteUrl || !atlasUrl) {
                return;
            }

            const key = `${spriteUrl}::${atlasUrl}`;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            pairs.push({ spriteUrl, atlasUrl });
        };

        add(record.sprite_url, record.atlas_url);

        if (BUILTIN_SLUGS.has(record.slug)) {
            [this.spriteVariant, ...SPRITE_VARIANTS].forEach((variant) => {
                const pair = builtinAssetPair(record.slug, variant);
                add(pair.spriteUrl, pair.atlasUrl);
            });

            // V4 compatibility is intentionally last. It keeps older GitHub
            // Pages deployments playable while a new hashed Vite bundle is
            // propagating through the browser/CDN cache.
            add(
                builtinAssetUrl(
                    `assets/characters/${record.slug}/${record.slug}-spritesheet-v4.png`
                ),
                builtinAssetUrl(
                    `assets/characters/${record.slug}/${record.slug}-atlas.json`
                )
            );
        }

        return pairs;
    }

    async loadCharacterAssets(record) {
        const failures = [];

        for (const pair of this.characterAssetPairs(record)) {
            try {
                const atlas = await this.loadJson(pair.atlasUrl);
                const atlasImage = atlas?.meta?.image;
                const spriteUrl = atlasImage
                    ? new URL(atlasImage, pair.atlasUrl).toString()
                    : pair.spriteUrl;
                const texture = await this.loadTexture(spriteUrl);

                return { texture, atlas, spriteUrl, atlasUrl: pair.atlasUrl };
            } catch (error) {
                failures.push(error);
                console.warn('Character asset pair failed; trying fallback.', {
                    slug: record.slug,
                    spriteUrl: pair.spriteUrl,
                    atlasUrl: pair.atlasUrl,
                    error,
                });
            }
        }

        const reason = failures.at(-1)?.message ?? 'unknown asset error';
        throw new Error(`Character assets could not be loaded for ${record.slug}: ${reason}`);
    }

    async loadJson(url) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
        });

        if (!response.ok) {
            throw new Error(`Atlas load failed: ${response.status} (${url})`);
        }

        return response.json();
    }

    loadTexture(url) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                url,
                (texture) => resolve(texture),
                undefined,
                () => reject(new Error(`Sprite Sheet load failed (${url})`))
            );
        });
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
        [...this.entities.keys()].forEach((key) => this.disposeEntity(key));
        this.colliderKeys.clear();
        this.collisionScope = null;
        this.navigationGrid = null;
        this.aiBudget?.clear?.();
        this.aiBudget = null;
    }
}
