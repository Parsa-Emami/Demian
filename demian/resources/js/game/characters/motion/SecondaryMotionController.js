import { motionAttachments } from './MasterMotionLibrary.js';

export default class SecondaryMotionController {
    constructor(definition) {
        this.definition = definition;
        this.wingPhase = 0;
        this.companionPhase = 0;
        this.extension = .65;
        this.lag = 0;
    }
    sample(pose, deltaTime = 0, reducedMotion = false) {
        const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(.25, deltaTime)) : 0;
        const air = ['jump', 'takeoff', 'fall'].includes(pose.state);
        const moving = ['walk', 'run', 'sprint'].includes(pose.state);
        if (!reducedMotion) {
            this.wingPhase = (this.wingPhase + dt * (air ? 2.6 : moving ? .95 : .72)) % 1;
            this.companionPhase = (this.companionPhase + dt * (moving ? 1.8 : .55)) % 1;
        }
        const target = pose.state === 'slide' ? .15 : air ? 1 : .65;
        this.extension += (target - this.extension) * (1 - Math.exp(-dt * 14));
        this.lag += ((moving ? -.04 : 0) - this.lag) * (1 - Math.exp(-dt * 9));
        return motionAttachments(this.definition, pose).map(item => ({ ...item,
            rotation: item.kind === 'wings' && !reducedMotion ? Math.sin(this.wingPhase * Math.PI * 2) * item.amplitude : 0,
            extension: item.kind === 'wings' ? this.extension : 0,
            localPhase: this.companionPhase, followOffset: this.lag,
            bob: item.kind === 'pishi' && moving && !reducedMotion ? Math.abs(Math.sin(this.companionPhase * Math.PI * 2)) * .018 : 0,
        }));
    }
}
