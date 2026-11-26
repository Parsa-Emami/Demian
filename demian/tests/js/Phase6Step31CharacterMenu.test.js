import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import MenuCharacterRoster from '../../resources/js/game/characters/MenuCharacterRoster.js';
import CharacterPreviewRenderer, {
    resolvePreviewFrameName,
} from '../../resources/js/ui/CharacterPreviewRenderer.js';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../../resources/js/game/characters/CharacterVisualContract.js';

test('all shipped roster portraits and paired atlases are present for phone and desktop presentation', () => {
    const base = new URL('../../public/assets/characters/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('character-manifest-v4.json', base), 'utf8'));
    assert.deepEqual(manifest.characters.map(item => item.slug), [...BUILTIN_CHARACTER_SLUGS]);
    for (const { slug, pack_version: version } of manifest.characters) {
        assert.equal(version, characterPackVersion(slug), slug);
        for (const path of [
            `${slug}/${slug}-preview-v${version}.png`,
            `${slug}/${slug}-atlas-v${version}-lite.json`,
            `${slug}/${slug}-atlas-v${version}-runtime.json`,
        ]) {
            assert.ok(existsSync(new URL(path, base)), `Missing ${path}`);
        }
    }
});

test('menu roster shows all characters and persists a valid selection without booting Open World', async () => {
    const events = [];
    const visuals = {
        activeSlug: 'darya',
        setActiveSlug(slug) { this.activeSlug = slug; },
    };
    const menu = new MenuCharacterRoster({
        eventBus: { emit: (event, data) => events.push([event, data]) },
        visualService: visuals,
    });
    assert.equal(menu.characters.length, BUILTIN_CHARACTER_SLUGS.length);
    assert.equal(menu.activeRecord.slug, 'darya');
    const elahehPosition = menu.characters.findIndex(record => record.slug === 'elaheh');
    assert.equal(menu.characters[elahehPosition + 1]?.slug, 'marjan');
    const zohrePosition = menu.characters.findIndex(record => record.slug === 'zohre');
    assert.equal(menu.characters[zohrePosition - 1]?.slug, 'mohana');
    assert.equal(menu.characters[zohrePosition + 1]?.slug, 'kiana');
    const arsalPosition = menu.characters.findIndex(record => record.slug === 'arsal');
    assert.equal(menu.characters[arsalPosition + 1]?.slug, 'sadro');
    const negarPosition = menu.characters.findIndex(record => record.slug === 'negar');
    assert.equal(menu.characters[negarPosition - 1]?.slug, 'mobina');
    assert.equal(menu.characters[negarPosition + 1]?.slug, 'dandelox');
    const chosen = await menu.select('builtin-negar');
    assert.equal(chosen.slug, 'negar');
    assert.equal(menu.activeRecord.slug, 'negar');
    assert.equal(menu.characters.filter(record => record.is_active).length, 1);
    assert.equal(events[0][0], 'characters:changed');
    assert.equal(events[1][0], 'character:selected');
    await assert.rejects(menu.select('builtin-fake'), /وجود ندارد/);
    assert.equal(visuals.activeSlug, 'negar');
    for (const slug of ['sadro', 'mojtaba', 'mobina', 'elaheh', 'marjan', 'mohana', 'zohre', 'kiana', 'taher-db', 'sorkhi', 'yalda', 'mori', 'mahyar']) {
        assert.equal((await menu.select(`builtin-${slug}`)).slug, slug);
        assert.equal(menu.activeRecord.slug, slug);
        assert.equal(visuals.activeSlug, slug);
    }
    assert.throws(() => menu.create(), /Open World/);
});

test('a frontal frame takes priority over profile side views when no poster exists', () => {
    assert.equal(resolvePreviewFrameName({
        frames: { idle_e_00: {}, idle_s_00: {} },
        animations: {
            idle: {
                framesByDirection: { e: ['idle_e_00'], s: ['idle_s_00'] },
            },
        },
    }), 'idle_s_00');
});

test('a missing or corrupt poster renders the real atlas artwork instead of initials', async () => {
    const PreviousImage = globalThis.Image;
    const drawCalls = [];
    globalThis.Image = class {
        constructor() { this.naturalWidth = 128; this.naturalHeight = 128; }
        set src(url) {
            queueMicrotask(() => {
                if (url.endsWith('missing.png')) this.onerror?.();
                else this.onload?.();
            });
        }
    };
    try {
        const context = {
            clearRect() {},
            drawImage(...args) { drawCalls.push(args); },
            fillRect() { throw Error('Unexpected silhouette placeholder'); },
        };
        const canvas = {
            dataset: {},
            clientWidth: 128,
            clientHeight: 128,
            width: 128,
            height: 128,
            setAttribute() {},
            getContext: () => context,
        };
        const renderer = new CharacterPreviewRenderer({
            fetchImpl: async () => ({
                ok: true,
                json: async () => ({
                    frames: { idle_s_00: { x: 0, y: 0, w: 128, h: 128 } },
                    animations: { idle: { framesByDirection: { s: ['idle_s_00'] } } },
                    meta: { image: 'valid.png' },
                }),
            }),
        });
        await renderer.render(canvas, {
            slug: 'darya',
            name: 'Darya',
            preview_url: 'https://example.test/missing.png',
            atlas_url: 'https://example.test/atlas.json',
            sprite_url: 'https://example.test/valid.png',
        });
        assert.equal(canvas.dataset.previewState, 'ready');
        assert.equal(drawCalls.length, 1);
        assert.equal(drawCalls[0][0].naturalWidth, 128);
    } finally {
        globalThis.Image = PreviousImage;
    }
});
