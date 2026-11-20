import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { shippedMotionSlug, sharedVisualAlias, ANIMATION_STANDARD_V2 as standard } from '../../resources/js/game/characters/UnifiedSpriteMotion.js';
import v2 from '../../resources/game/character-visual-standard-v2.json' with {type:'json'};

const read = (slug,variant) => JSON.parse(readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v14-${variant}.json`,import.meta.url)));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('all V14 characters and six variants share semantic and timing contract', () => {
    for(const slug of Object.keys(v2.characters)) {
        const base=read(slug,'mobile');
        for(const variant of standard.variants) {
            const atlas=read(slug,variant), animator=new FrameAnimator(atlas);
            assert.equal(shippedMotionSlug(atlas),slug);
            assert.deepEqual(atlas.animations,base.animations);
            assert.equal(Object.keys(atlas.frames).length,672);
            for(const [state,spec] of Object.entries(standard.clips)) {
                assert.equal(atlas.animations[state].frames.length,spec.frames);
                assert.equal(atlas.animations[state].fps,spec.fps);
                assert.equal(atlas.animations[state].loop,spec.loop);
                animator.play(state);
                for(const direction of standard.directions) {
                    animator.setDirection(direction);
                    for(let frame=0;frame<spec.frames;frame++) {
                        animator.seek(spec.frames===1?0:frame/(spec.frames-1));
                        assert.ok(atlas.frames[animator.currentFrameName()]);
                    }
                }
            }
            assert.equal(animator.play('dodge'),'slide');
            assert.equal(animator.play('crawl'),'crouch');
            assert.ok(animator.has('crawl'));
            assert.equal(animator.currentFrames().length,1);
            assert.equal(animator.play('attack'),'idle');
        }
    }
});

test('quality swaps preserve exact stride phase, fractional frame and finished one-shots', () => {
    for(const slug of Object.keys(v2.characters)) {
        const avatar=new CanvasCharacterAvatar({slug,atlas:read(slug,'lite'),image:{}});
        avatar.animator.play('run');
        advanceCharacterAnimation(avatar.animator,{state:'run',movementSpeed:6,travelledDistance:1.38,deltaTime:.23});
        const old=avatar.animator;
        avatar.replaceVisualAssets({},read(slug,'detail'));
        const fresh=avatar.animator;
        near(fresh.locomotionPhase,old.locomotionPhase);
        near(fresh.frameIndex+fresh.frameProgress(),old.frameIndex+old.frameProgress());
        assert.equal(fresh.motionState,'run');
        advanceCharacterAnimation(fresh,{state:'run',movementSpeed:6,travelledDistance:.06,deltaTime:.01});
        near(fresh.locomotionPhase,old.locomotionPhase+.01);
        fresh.play('land');fresh.seek(1);
        avatar.replaceVisualAssets({},read(slug,'runtime'));
        assert.equal(avatar.animator.finished,true);
        assert.equal(avatar.animator.currentFrameName(),fresh.currentFrameName());
    }
});

test('custom fallback and legacy packs do not pretend to have V2 art',()=>{
    const atlas={meta:{version:14,slug:'unknown'},animations:{idle:{frames:['idle']},slide:{frames:['slide']}}};
    assert.equal(sharedVisualAlias(atlas,'crawl'),null);
    assert.equal(sharedVisualAlias(atlas,'dodge'),null);
    assert.equal(new FrameAnimator(atlas).has('crawl'),false);
});
