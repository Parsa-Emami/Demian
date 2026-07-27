import * as THREE from 'three';
import SpriteCharacter from '../characters/SpriteCharacter';

function builtinAssetUrl(relativePath) {
    return new URL(relativePath.replace(/^\/+/, ''), document.baseURI).toString();
}

const BUILTIN_CHARACTERS = Object.freeze([
    Object.freeze({
        id: 'builtin-tiam',
        name: 'TIAM / تیام',
        slug: 'tiam',
        sprite_url: builtinAssetUrl(
            'assets/characters/tiam/tiam-spritesheet.png'
        ),
        atlas_url: builtinAssetUrl(
            'assets/characters/tiam/tiam-atlas.json'
        ),
        is_builtin: true,
        is_active: true,
        settings: {
            walk_speed: 3.2,
            run_speed: 6.2,
            jump_force: 6.5,
            scale: 1,
        },
    }),
    Object.freeze({
        id: 'builtin-ronak',
        name: 'RONAK / روناک',
        slug: 'ronak',
        sprite_url: builtinAssetUrl(
            'assets/characters/ronak/ronak-spritesheet.png'
        ),
        atlas_url: builtinAssetUrl(
            'assets/characters/ronak/ronak-atlas.json'
        ),
        is_builtin: true,
        is_active: false,
        settings: {
            walk_speed: 3.25,
            run_speed: 6.35,
            jump_force: 6.6,
            scale: 1,
        },
    }),
]);

const BUILTIN_SLUGS = new Set(
    BUILTIN_CHARACTERS.map((character) => character.slug)
);

function cloneBuiltin(character) {
    return {
        ...character,
        settings: { ...character.settings },
    };
}

export default class CharacterManager {
    constructor({ scene, repository, eventBus }) {
        this.scene = scene;
        this.repository = repository;
        this.eventBus = eventBus;
        this.characters = [];
        this.activeRecord = null;
        this.activeEntity = null;
        this.textureLoader = new THREE.TextureLoader();
        this.lastBootWarning = null;
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

        await this.select(active.id);
        this.eventBus.emit('characters:changed', this.characters);

        if (this.lastBootWarning) {
            this.eventBus.emit('character:warning', {
                message:
                    'ارتباط دیتابیس برقرار نبود؛ تیام و روناک از فایل‌های داخلی اجرا شدند.',
            });
        }

        return this.characters;
    }

    ensureBuiltinCharacters() {
        const existingBySlug = new Map(
            this.characters.map((character) => [character.slug, character])
        );

        const builtins = BUILTIN_CHARACTERS.map((builtin) => {
            const existing = existingBySlug.get(builtin.slug);

            if (!existing) {
                return cloneBuiltin(builtin);
            }

            return {
                ...cloneBuiltin(builtin),
                ...existing,
                sprite_url: existing.sprite_url || builtin.sprite_url,
                atlas_url: existing.atlas_url || builtin.atlas_url,
                is_builtin: true,
                settings: {
                    ...builtin.settings,
                    ...(existing.settings ?? {}),
                },
            };
        });

        const customCharacters = this.characters.filter(
            (character) => !BUILTIN_SLUGS.has(character.slug)
        );

        this.characters = [...builtins, ...customCharacters];
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
        this.eventBus.emit('characters:changed', this.characters);
        return this.characters;
    }

    async select(id) {
        const record = this.characters.find(
            (character) => String(character.id) === String(id)
        );

        if (!record) {
            throw new Error('کاراکتر انتخاب‌شده پیدا نشد.');
        }

        this.eventBus.emit('character:loading', record);

        const [texture, atlas] = await Promise.all([
            this.loadTexture(record.sprite_url),
            this.loadJson(record.atlas_url),
        ]);

        const entity = new SpriteCharacter({
            scene: this.scene,
            character: record,
            texture,
            atlas,
        });

        const previousPosition = this.activeEntity?.group.position.clone();

        if (previousPosition) {
            entity.group.position.copy(previousPosition);
        }

        this.disposeActive();
        this.activeRecord = record;
        this.activeEntity = entity;
        this.scene.add(entity.group);

        this.eventBus.emit('character:selected', {
            record,
            position: entity.group.position.clone(),
            height: entity.visualHeight(),
        });

        return entity;
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

            this.characters = this.characters.map((character) => ({
                ...character,
                is_active: String(character.id) === String(record.id),
            }));

            await this.select(record.id);
            this.eventBus.emit('characters:changed', this.characters);
            return { ...record, is_active: true };
        }

        const activated = await this.repository.activate(id);
        this.characters = this.characters.map((character) => ({
            ...character,
            is_active: String(character.id) === String(activated.id),
        }));

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

        await this.reload();

        if (removedWasActive) {
            const next =
                this.characters.find((character) => character.is_active) ??
                this.characters[0];

            if (next) {
                await this.select(next.id);
            } else {
                this.disposeActive();
            }
        }
    }

    update(deltaTime, input, movementBasis) {
        this.activeEntity?.update(deltaTime, input, movementBasis);
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

    async loadJson(url) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
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

    disposeActive() {
        if (!this.activeEntity) {
            return;
        }

        this.scene.remove(this.activeEntity.group);
        this.activeEntity.dispose();
        this.activeEntity = null;
        this.activeRecord = null;
    }

    dispose() {
        this.disposeActive();
    }
}
