import * as THREE from 'three';
import SpriteCharacter from '../characters/SpriteCharacter';

const BUILTIN_TIAM = Object.freeze({
    id: 'builtin-tiam',
    name: 'TIAM / تیام',
    slug: 'tiam',
    sprite_url: '/assets/characters/tiam/tiam-spritesheet.png',
    atlas_url: '/assets/characters/tiam/tiam-atlas.json',
    is_builtin: true,
    is_active: true,
    settings: {
        walk_speed: 3.2,
        run_speed: 6.2,
        jump_force: 6.5,
        scale: 1,
    },
});

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
            console.warn('Character API was unavailable; built-in TIAM was loaded.', error);
            this.lastBootWarning = error;
            this.characters = [];
        }

        this.ensureBuiltinCharacter();

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
                message: 'ارتباط دیتابیس برقرار نبود؛ تیام از فایل داخلی اجرا شد.',
            });
        }

        return this.characters;
    }

    ensureBuiltinCharacter() {
        const tiamIndex = this.characters.findIndex(
            (character) => character.slug === 'tiam'
        );

        if (tiamIndex === -1) {
            this.characters.unshift({ ...BUILTIN_TIAM });
            return;
        }

        const existing = this.characters[tiamIndex];
        this.characters[tiamIndex] = {
            ...BUILTIN_TIAM,
            ...existing,
            sprite_url: existing.sprite_url || BUILTIN_TIAM.sprite_url,
            atlas_url: existing.atlas_url || BUILTIN_TIAM.atlas_url,
            is_builtin: true,
            settings: {
                ...BUILTIN_TIAM.settings,
                ...(existing.settings ?? {}),
            },
        };
    }

    async reload() {
        try {
            this.characters = await this.repository.list();
        } catch (error) {
            console.warn('Character list reload failed.', error);
            this.characters = this.characters.filter(
                (character) => character.slug === 'tiam'
            );
        }

        this.ensureBuiltinCharacter();
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

        if (record?.id === BUILTIN_TIAM.id) {
            this.characters = this.characters.map((character) => ({
                ...character,
                is_active: character.id === BUILTIN_TIAM.id,
            }));
            await this.select(record.id);
            this.eventBus.emit('characters:changed', this.characters);
            return record;
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
            throw new Error('کاراکتر داخلی تیام قابل حذف نیست.');
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
