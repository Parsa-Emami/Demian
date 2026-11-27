import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import roster from '../../resources/game/character-motion.json' with { type: 'json' };
import standard from '../../resources/game/character-animation-standard-v2.json' with { type: 'json' };

function atlasFor({ slug, packVersion }, variant) {
    const url = new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v${packVersion}-${variant}.json`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8'));
}

test('the shared crawl and dodge visual fallbacks work across all shipped directional packs', () => {
    for (const character of roster.characters) {
        const atlas = atlasFor(character, 'mobile');
        for (const sideView of [false, true]) {
            const animator = new FrameAnimator(atlas, { sideView });
            assert.equal(animator.has('crawl'), true, character.slug);
            assert.equal(animator.play('crawl'), 'crouch', character.slug);
            for (const direction of standard.directions) {
                animator.setDirection(direction);
                assert.equal(animator.currentFrames().length, 1, character.slug);
                assert.ok(atlas.frames[animator.currentFrameName()], character.slug);
            }
            assert.equal(animator.play('dodge'), atlas.animations.dodge ? 'dodge' : 'slide', character.slug);
        }
    }
    const custom = new FrameAnimator({ meta: { version: 14, slug: 'custom' },
        animations: { idle: { frames: ['idle'] }, crouch: { frames: ['crouch'] } } });
    assert.equal(custom.has('crawl'), false);
    const legacy = new FrameAnimator({ meta: { version: 12, slug: 'darya' },
        animations: { idle: { frames: ['idle'] }, crouch: { frames: ['crouch'] } } });
    assert.equal(legacy.has('crawl'), false);
});

test('character quality swaps preserve fractional stride and a finished landing across pack versions', () => {
    for (const character of roster.characters) {
        const avatar = new CanvasCharacterAvatar({ slug: character.slug, atlas: atlasFor(character, 'lite'), image: {} });
        advanceCharacterAnimation(avatar.animator, {
            state: 'run', movementSpeed: 6, travelledDistance: 1.38, deltaTime: .23,
        });
        const before = avatar.animator.playbackSnapshot();
        avatar.replaceVisualAssets({}, atlasFor(character, 'detail'));
        const after = avatar.animator.playbackSnapshot();
        assert.ok(Math.abs(after.position - before.position) < 1e-8, character.slug);
        assert.equal(after.locomotionPhase, before.locomotionPhase, character.slug);
        avatar.animator.play('land');
        avatar.animator.seek(1);
        const lastFrame = avatar.animator.currentFrameName();
        avatar.replaceVisualAssets({}, atlasFor(character, 'runtime'));
        assert.equal(avatar.animator.finished, true, character.slug);
        assert.equal(avatar.animator.currentFrameName(), lastFrame, character.slug);
    }
});
