import test from 'node:test';
import assert from 'node:assert/strict';
import CanvasAvatarHydrator from '../../../resources/js/game/characters/runtime/CanvasAvatarHydrator.js';
import CharacterVisualService from '../../../resources/js/game/characters/runtime/CharacterVisualService.js';
import EventBus from '../../../resources/js/game/core/EventBus.js';

const pack = variant => ({ slug: 'darya', variant, image: { naturalWidth: 64, naturalHeight: 64 },
    atlas: { frames: { idle: { x: 0, y: 0, w: 64, h: 64 } },
        animations: { idle: { frames: ['idle'], fps: 1, loop: true } } } });

test('high-quality Canvas player starts from lite and upgrades only after a presented frame', async () => {
    const eventBus = new EventBus();
    const service = new CharacterVisualService({ eventBus, performanceProfile: { tier: 'high' }, storage: null });
    const calls = [], queue = [];
    service.loadPack = async (slug, variant) => { calls.push(variant); return pack(variant); };
    service.canvasHydrator.schedule = run => queue.push(run);
    const avatar = await service.createCanvasAvatar('darya', { player: true });
    assert.deepEqual(calls, ['lite']);
    assert.equal(queue.length, 0);
    avatar.position.x = 17;
    eventBus.emit('game:first-playable-frame');
    assert.equal(queue.length, 1);
    await queue.shift()();
    assert.deepEqual(calls, ['lite', 'detail']);
    assert.equal(avatar.position.x, 17);
    assert.equal(avatar.animator.animationName, 'idle');
    service.dispose();
});

test('late upgrades cannot mutate a superseded avatar or a disposed scene', async () => {
    const bus = new EventBus(), queue = [], writes = [];
    let resolve;
    const hydrator = new CanvasAvatarHydrator({ eventBus: bus,
        service: { loadPack: () => new Promise(done => { resolve = done; }) },
        schedule: run => queue.push(run), policy: () => ({ reason: 'normal' }) });
    const avatar = slug => ({ slug, replaceVisualAssets: () => writes.push(slug) });
    hydrator.stage(avatar('darya'), 'detail');
    bus.emit('game:first-playable-frame');
    const pending = queue.shift()();
    hydrator.stage(avatar('tiam'), 'detail');
    resolve(pack('detail'));
    await pending;
    assert.deepEqual(writes, []);
    hydrator.dispose();
    await queue.shift()();
    assert.deepEqual(writes, []);
});

test('failed optional upgrade keeps playable art; Save-Data does not download detail', async () => {
    const queue = [], bus = new EventBus();
    let downloads = 0, reason = 'save-data';
    const hydrator = new CanvasAvatarHydrator({ eventBus: bus,
        service: { loadPack: async () => { downloads++; throw Error('offline'); } },
        schedule: run => queue.push(run), policy: () => ({ reason }) });
    hydrator.stage({ slug: 'darya', replaceVisualAssets: () => assert.fail('failed upgrade') }, 'detail');
    bus.emit('game:first-playable-frame');
    assert.equal(queue.length, 0);
    reason = 'normal';
    hydrator.hydrate();
    await queue.shift()();
    assert.equal(downloads, 1);
    hydrator.dispose();
});
