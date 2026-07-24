import * as THREE from 'three';
import SpriteCharacter from '../characters/SpriteCharacter';

export default class CharacterManager {
    constructor({ scene, repository, eventBus }) {
        this.scene = scene;
        this.repository = repository;
        this.eventBus = eventBus;
        this.characters = [];
        this.activeRecord = null;
        this.activeEntity = null;
        this.textureLoader = new THREE.TextureLoader();
    }

    async boot() {
        this.characters = await this.repository.list();

        const active =
            this.characters.find((character) => character.is_active) ??
            this.characters[0];

        if (active) {
            await this.select(active.id);
        }

        this.eventBus.emit('characters:changed', this.characters);
        return this.characters;
    }

    async reload() {
        this.characters = await this.repository.list();
        this.eventBus.emit('characters:changed', this.characters);
        return this.characters;
    }

    async select(id) {
        const record = this.characters.find(
            (character) => Number(character.id) === Number(id)
        );

        if (!record) {
            throw new Error('کاراکتر انتخاب‌شده پیدا نشد.');
        }

        const [texture, atlas] = await Promise.all([
            this.loadTexture(record.sprite_url),
            this.loadJson(record.atlas_url),
        ]);

        const entity = new SpriteCharacter({
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

        this.eventBus.emit('character:selected', record);
        return entity;
    }

    async activate(id) {
        const activated = await this.repository.activate(id);
        this.characters = this.characters.map((character) => ({
            ...character,
            is_active: Number(character.id) === Number(activated.id),
        }));

        await this.select(activated.id);
        this.eventBus.emit('characters:changed', this.characters);

        return activated;
    }

    async create(formData) {
        const created = await this.repository.create(formData);
        await this.reload();

        if (!this.activeEntity) {
            await this.activate(created.id);
        }

        return created;
    }

    async remove(id) {
        await this.repository.remove(id);
        const removedWasActive = Number(this.activeRecord?.id) === Number(id);

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

    speed() {
        return this.activeEntity?.speed() ?? 0;
    }

    state() {
        return this.activeEntity?.state ?? 'loading';
    }

    async loadJson(url) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Atlas load failed: ${response.status}`);
        }

        return response.json();
    }

    loadTexture(url) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(url, resolve, undefined, reject);
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
