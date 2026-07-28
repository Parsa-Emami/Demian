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
    constructor({ scene, repository, eventBus, performanceProfile = null }) {
        this.scene = scene;
        this.repository = repository;
        this.eventBus = eventBus;
        this.performanceProfile = performanceProfile;
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
                    'ارتباط دیتابیس برقرار نبود؛ تیام، روناک و امیررضا از فایل‌های داخلی اجرا شدند.',
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
        entity.setWorldBounds(WORLD_CONFIG.bounds);

        const spawn = WORLD_CONFIG.spawnPoints[
            spawnIndex % WORLD_CONFIG.spawnPoints.length
        ];
        entity.group.position.set(spawn.x, 0, spawn.z);
        this.scene.add(entity.group);

        this.entities.set(key, entity);
        this.brains.set(key, new NpcBrain(entity, spawnIndex));
        return entity;
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
            if (preservePosition && previousPosition) {
                previousEntity.group.position.copy(nextNpcPosition);
                nextEntity.group.position.copy(previousPosition);
            }
        }

        nextEntity.setPlayerControlled(true, { playIntro: !previousEntity });
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
        const neighbours = [...this.entities.values()];

        this.entities.forEach((entity, key) => {
            if (entity === this.activeEntity) {
                return;
            }

            const brain = this.brains.get(key);
            const npcInput = brain?.update(
                deltaTime,
                this.activeEntity,
                neighbours
            );
            entity.update(deltaTime, npcInput ?? { x: 0, z: 0 }, movementBasis);
        });
    }

    position() {
        return this.activeEntity?.group.position ?? new THREE.Vector3();
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
    }
}
