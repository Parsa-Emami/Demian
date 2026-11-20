import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import standard from '../../resources/game/sprite-animation-standard-v2.json' with { type:'json' };
import visual from '../../resources/game/character-visual-standard-v2.json' with { type:'json' };

function atlas(slug, variant) {
    return JSON.parse(readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v14-${variant}.json`, import.meta.url)));
}
function close(a,b,label) { assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`); }

test('V2 all 108 atlases share logical timings, action aliases, phase endpoints and body pivot', () => {
    for (const [slug,c] of Object.entries(visual.characters)) {
        assert.equal(standard.families[c.family],visual.families[c.family].reference);
        const canonical=atlas(slug,'mobile');
        for(const variant of standard.variants) {
            const data=atlas(slug,variant), animator=new FrameAnimator(data);
            assert.deepEqual(data.animations,canonical.animations,slug+'/'+variant);
            assert.deepEqual(data.pivot,standard.pivot);
            assert.equal(Object.keys(data.frames).length,standard.logicalFrames);
            assert.deepEqual(data.motion.locomotionProfile.strideLengths,standard.strideLengths);
            for(const [name,rule] of Object.entries(standard.states)) {
                const clip=data.animations[name];
                assert.equal(clip.frames.length,rule.frames);
                assert.equal(clip.fps,rule.fps);
                assert.equal(clip.loop,rule.loop);
                if(rule.cycles) assert.ok(rule.cycles.includes(clip.cycleCount));
                for(const direction of data.meta.directions) {
                    animator.setDirection(direction); animator.play(name,{restart:true});
                    for(let i=0;i<rule.frames;i++) {
                        if(rule.loop) animator.seekLoop((i+.1)/rule.frames);
                        else animator.seek(rule.frames===1?0:i/(rule.frames-1));
                        assert.ok(data.frames[animator.currentFrameName()],slug+'/'+name+'/'+direction);
                    }
                }
            }
            for(const [alias,target] of Object.entries(standard.aliases)) {
                assert.equal(animator.has(alias),true);
                assert.equal(animator.play(alias,{restart:true}),target);
                assert.deepEqual(animator.animation,data.animations[target]);
            }
        }
    }
});

test('same-character quality swap preserves exact gait cycle and subframe in both directions', () => {
    for(const slug of Object.keys(visual.characters)) {
        const avatar=new CanvasCharacterAvatar({slug,atlas:atlas(slug,'lite'),image:{}});
        const actor={position:{x:0,z:0},speed:6,forward:{x:-1,z:0},grounded:true};
        for(let i=0;i<87;i++) avatar.sync(actor,1/60);
        const old=avatar.animator, phase=old.locomotionPhase, frame=old.currentFrameName(), fraction=old.frameProgress();
        const serial=old.masterMotion;
        avatar.replaceVisualAssets({},atlas(slug,'detail'));
        const next=avatar.animator;
        assert.equal(next.currentFrameName(),frame,slug);
        close(next.frameProgress(),fraction,slug);
        close(next.locomotionPhase,phase,slug);
        assert.equal(next.masterMotion,serial);
        avatar.sync(actor,1/60);
        close(next.locomotionPhase,phase+1/60,slug);
    }
});

test('quality swap preserves one-shot endpoint and slide time, crouch/crawl hold authored low pose', () => {
    const previous=new FrameAnimator(atlas('darya','lite'));
    const next=new FrameAnimator(atlas('darya','runtime'));
    previous.play('land');previous.seek(1);next.restorePlaybackFrom(previous);
    assert.equal(next.finished,true);assert.equal(next.currentFrameName(),previous.currentFrameName());
    previous.play('takeoff');previous.seek(.42);next.restorePlaybackFrom(previous);
    assert.equal(next.currentFrameName(),previous.currentFrameName());close(next.frameProgress(),previous.frameProgress(),'takeoff');
    for(const state of ['crouch','crawl']) {
        next.play(state,{restart:true});
        advanceCharacterAnimation(next,{state,deltaTime:.2,movementSpeed:4});
        assert.equal(next.currentFrameName(),next.animation.framesRight[0]);
    }
    next.play('dodge');advanceCharacterAnimation(next,{state:'dodge',actionDuration:.6,stateTime:.3});
    assert.equal(next.frameIndex,31);
});
