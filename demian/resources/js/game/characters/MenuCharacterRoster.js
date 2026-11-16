import {
    BUILTIN_CHARACTER_SLUGS,
    builtinCharacterAssetPair,
    builtinCharacterPreviewUrl,
} from './CharacterVisualContract.js';
import { BUILTIN_CHARACTER_LABELS } from './manifests/CharacterManifestRegistry.js';

export default class MenuCharacterRoster {
    constructor({ eventBus, visualService }) {
        this.eventBus = eventBus;
        this.visualService = visualService;
        this.records = BUILTIN_CHARACTER_SLUGS.map((slug) => ({
            id: `builtin-${slug}`,
            slug,
            name: BUILTIN_CHARACTER_LABELS[slug],
            is_builtin: true,
            preview_url: builtinCharacterPreviewUrl(slug),
            sprite_url: builtinCharacterAssetPair(slug, 'lite').spriteUrl,
            atlas_url: builtinCharacterAssetPair(slug, 'lite').atlasUrl,
            settings: {},
        }));
    }

    get characters() {
        return this.records.map((record) => ({
            ...record,
            is_active: record.slug === this.visualService.activeSlug,
        }));
    }

    get activeRecord() {
        return this.characters.find((record) => record.is_active) ?? this.characters[0] ?? null;
    }

    async select(id) {
        const record = this.records.find((item) => String(item.id) === String(id));
        if (!record) throw new Error('کاراکتر انتخاب‌شده در فهرست وجود ندارد.');
        this.visualService.setActiveSlug(record.slug);
        this.eventBus.emit('characters:changed', this.characters);
        this.eventBus.emit('character:selected', { record: this.activeRecord });
        return this.activeRecord;
    }

    activate(id) {
        return this.select(id);
    }

    create() {
        throw new Error('برای ساخت کاراکتر اختصاصی ابتدا وارد Open World شوید.');
    }

    remove() {
        throw new Error('کاراکترهای داخلی دمیان حذف نمی‌شوند.');
    }
}
