import test from 'node:test';
import assert from 'node:assert/strict';
import { MASTER_MOTION, MOTION_CHARACTERS, sampleMasterPose, projectMasterJoints, runtimeMotionClip } from '../../resources/js/game/characters/motion/MasterMotionLibrary.js';
import MasterMotionController from '../../resources/js/game/characters/motion/MasterMotionController.js';

test('contact feet cancel cafe ground travel for both families, all eight headings and all gaits',()=>{
    const directions=['e','se','s','sw','w','nw','n','ne'];
    for(const family of Object.keys(MASTER_MOTION.families))for(const state of ['walk','run','sprint'])for(const [sector,direction]of directions.entries()){
        const clip=MASTER_MOTION.clips[state],angle=sector*Math.PI/4;let previous;
        for(let i=3;i<clip.stance*480-3;i++){
            const phase=i/480,pose=sampleMasterPose(family,{state,phase,direction}),foot=projectMasterJoints(pose).ankleNear;
            const point={x:Math.cos(angle)*phase*clip.strideLength+foot.x*3.75,z:Math.sin(angle)*phase*clip.strideLength-foot.y*3.75};
            assert(pose.contacts.near);
            if(previous){assert(Math.abs(previous.x-point.x)<1e-4);assert(Math.abs(previous.z-point.z)<1e-4);}
            previous=point;
        }
    }
});

test('every runner skin shares cadence and planted foot travel at initial, middle and maximum speed',()=>{
    for(const pixels of [390,490,600]){
        const speed=pixels*3.75/58,clip=runtimeMotionClip('sprint','runner',speed);
        assert(Math.abs(speed/clip.strideLength-2.8)<1e-8);
        for(const entry of MOTION_CHARACTERS){let previous;
            for(let i=2;i<clip.stance*240-2;i++){
                const phase=i/240,pose=sampleMasterPose(entry.family,{state:'sprint',context:'runner',speed,phase});
                const x=phase*clip.strideLength+pose.joints.ankleNear.x*3.75;
                assert(pose.contacts.near);if(previous!==undefined)assert(Math.abs(previous-x)<1e-7);previous=x;
            }
        }
    }
});

test('secondary clocks animate a frozen body phase, fold on slide, and freeze with reduced motion',()=>{
    const wing=new MasterMotionController('amirreza'),pet=new MasterMotionController('darya');
    wing.sync({state:'run',phase:.21});const joints=structuredClone(wing.pose.joints),rotation=wing.attachments[0].rotation;
    for(let i=0;i<10;i++){wing.sync({state:'run',phase:.21,deltaTime:1/60});pet.sync({state:'run',phase:.21,deltaTime:1/60});}
    assert.deepEqual(wing.pose.joints,joints);assert.notEqual(wing.attachments[0].rotation,rotation);assert(pet.attachments[0].localPhase>0);
    const phase=pet.secondary.companionPhase;pet.sync({state:'run',phase:.21,deltaTime:.2,reducedMotion:true});
    assert.equal(pet.secondary.companionPhase,phase);assert.equal(pet.attachments[0].bob,0);
    wing.sync({state:'run',phase:.21,deltaTime:.2,reducedMotion:true});assert.equal(wing.attachments[0].rotation,0);
});
