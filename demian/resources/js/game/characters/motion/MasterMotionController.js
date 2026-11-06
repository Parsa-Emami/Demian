import { MASTER_MOTION, motionCharacter, sampleMasterPose, motionAttachments, canonicalMotionState, normalizedPhase } from './MasterMotionLibrary.js';

export default class MasterMotionController {
    constructor(slug) {
        const definition = motionCharacter(slug);
        if (!definition) throw new RangeError(`Unknown master motion character: ${slug}`);
        this.definition = definition;
        this.phase = 0;
        this.distance = 0;
        this.previousPhase = null;
        this.previousState = null;
        this.elapsed = 0;
        this.events = [];
        this.pose = sampleMasterPose(definition.family);
        this.attachments = motionAttachments(definition, this.pose);
    }

    advance({ state = 'idle', distance = 0, deltaTime = 0, progress = 0, facing = 1 } = {}) {
        const mode = canonicalMotionState(state), clip = MASTER_MOTION.clips[mode];
        const dt = Number.isFinite(deltaTime) ? Math.min(.25, Math.max(0, deltaTime)) : 0;
        const travel = Number.isFinite(distance) ? Math.max(0, distance) : 0;
        if (clip?.strideLength) {
            this.phase += Math.min(travel / clip.strideLength, MASTER_MOTION.playback.maxStrideHz * dt);
            this.distance += travel;
        }
        return this.sync({ state, phase: this.phase, progress, facing, deltaTime: dt });
    }

    sync({ state = 'idle', phase = this.phase, progress = 0, facing = 1, deltaTime = 0 } = {}) {
        this.events = [];
        const mode = canonicalMotionState(state), moving = Boolean(MASTER_MOTION.clips[mode]?.strideLength);
        const value = Number.isFinite(phase) ? phase : this.phase;
        const previous = this.previousPhase;
        if (moving && previous !== null && MASTER_MOTION.clips[this.previousState]?.strideLength) {
            let end = value;
            if (end < previous && previous - end > .5) end += 8;
            if (end >= previous && end - previous <= .5) {
                for (const [foot, offset] of [['near', 0], ['far', .5]]) {
                    const contact = Math.floor(previous - offset) + 1 + offset;
                    if (contact <= end + 1e-10) this.events.push({ type: 'foot-contact', foot, phase: normalizedPhase(contact), family: this.definition.family });
                }
            }
        }
        this.phase = value;
        this.elapsed += Number.isFinite(deltaTime) ? Math.min(.25, Math.max(0, deltaTime)) : 0;
        this.pose = sampleMasterPose(this.definition.family, { state, phase: value, progress, facing, time: this.elapsed });
        this.attachments = motionAttachments(this.definition, this.pose);
        this.previousPhase = value;
        this.previousState = mode;
        return this.pose;
    }

    reset() {
        this.phase = 0;
        this.distance = 0;
        this.previousPhase = null;
        this.previousState = null;
        this.elapsed = 0;
        return this.sync();
    }
}
