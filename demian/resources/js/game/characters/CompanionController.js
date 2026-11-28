import FrameAnimator from './FrameAnimator.js';
import { DIRECTION_VECTORS, DirectionTransition, directionFromHeading } from './DirectionResolver.js';

const FOLLOW_SAMPLE = .14;
const TRAIL_LENGTH = 4;
const HOP_DELAY = .13;
const HOP_DURATION = .36;
const HOP_RECOVERY = .12;
const mix = (a, b, t) => a + (b - a) * t;

export default class CompanionController {
    constructor(atlas, image, { sideView = false } = {}) {
        this.atlas = atlas;
        this.image = image;
        this.animator = new FrameAnimator(atlas);
        this.turn = new DirectionTransition(.043);
        this.direction = 'e';
        this.sideView = sideView;
        this.state = 'idle';
        this.animator.play(this.state);
        this.worldPosition = null;
        this.previousPosition = null;
        this.runnerOffset = -25;
        this.previousRunnerOffset = this.runnerOffset;
        this.elevation = 0;
        this.previousElevation = 0;
        this.velocity = { x: 0, z: 0 };
        this.hopTime = null;
        this.hopRequested = false;
        this.ownerAirborne = false;
    }

    resetWorld(owner, direction) {
        this.direction = direction;
        this.animator.setDirection(direction);
        const forward = DIRECTION_VECTORS[direction];
        const beside = { x: owner.x - forward.x * 1.15 - forward.z * .76,
            z: owner.z - forward.z * 1.15 + forward.x * .76 };
        this.worldPosition = this.canMove?.(owner, beside) === false ? { x: owner.x, z: owner.z } : beside;
        this.previousPosition = this.worldPosition;
        this.velocity = { x: 0, z: 0 };
        this.ownerDistance = 0;
        this.lastOwner = { x: owner.x, z: owner.z, distance: 0 };
        this.trail = [this.lastOwner];
        this.hopTime = null;
        this.hopRequested = false;
        this.ownerAirborne = false;
        this.elevation = this.previousElevation = 0;
        this.animator.play('idle', { restart: true });
        this.state = 'idle';
    }

    followPoint(direction, speed) {
        const distance = this.ownerDistance - Math.min(1.7, 1.06 + speed * .12);
        let newest = this.lastOwner;
        let forward = DIRECTION_VECTORS[direction];
        let x = newest.x - forward.x * 1.06;
        let z = newest.z - forward.z * 1.06;
        for (let index = this.trail.length - 1; index >= 0; index--) {
            const prior = this.trail[index];
            const length = newest.distance - prior.distance;
            if (length <= 0) continue;
            const t = Math.max(0, (distance - prior.distance) / length);
            forward = { x: (newest.x - prior.x) / length, z: (newest.z - prior.z) / length };
            x = mix(prior.x, newest.x, t);
            z = mix(prior.z, newest.z, t);
            if (t > 0) break;
            newest = prior;
        }
        const side = { x: x - forward.z * .76, z: z + forward.x * .76 };
        return this.canMove?.({ x, z }, side) === false ? { x, z } : side;
    }

    updateWorld(owner, direction, dt, airborne = false) {
        const distance = this.lastOwner ? Math.hypot(owner.x - this.lastOwner.x, owner.z - this.lastOwner.z) : Infinity;
        if (distance > Math.max(3.6, dt * 12)) {
            this.resetWorld(owner, direction);
            return;
        }
        if (dt <= 0) return;
        this.ownerDistance += distance;
        this.lastOwner = { x: owner.x, z: owner.z, distance: this.ownerDistance };
        if (this.ownerDistance - this.trail.at(-1).distance >= FOLLOW_SAMPLE) this.trail.push(this.lastOwner);
        while (this.trail.length > 2 && this.ownerDistance - this.trail[1].distance > TRAIL_LENGTH) this.trail.shift();

        const speed = distance / dt;
        const position = this.worldPosition;
        const goal = this.followPoint(direction, speed);
        const dx = goal.x - position.x;
        const dz = goal.z - position.z;
        const gap = Math.hypot(dx, dz);
        const approach = Math.min(13, Math.max(0, gap - .075) * 9);
        const smoothing = 1 - Math.exp(-18 * dt);
        this.velocity.x = mix(this.velocity.x, gap > 0 ? dx / gap * approach : 0, smoothing);
        this.velocity.z = mix(this.velocity.z, gap > 0 ? dz / gap * approach : 0, smoothing);
        const next = { x: position.x + this.velocity.x * dt, z: position.z + this.velocity.z * dt };
        this.previousPosition = position;
        if (this.canMove?.(position, next) !== false) this.worldPosition = next;
        else {
            const xOnly = { x: next.x, z: position.z };
            const zOnly = { x: position.x, z: next.z };
            if (this.canMove(position, xOnly)) this.worldPosition = xOnly;
            else if (this.canMove(position, zOnly)) this.worldPosition = zOnly;
        }
        const mx = this.worldPosition.x - position.x;
        const mz = this.worldPosition.z - position.z;
        const actualSpeed = Math.hypot(mx, mz) / dt;
        const targetDirection = actualSpeed > .34 ? directionFromHeading(mx, mz, this.direction) : direction;
        this.animate(dt, targetDirection, actualSpeed, airborne && (speed > 3.4 || this.ownerAirborne), false);
    }

    updateRunner(direction, dt, speed, airborne, crouch) {
        this.previousRunnerOffset = this.runnerOffset;
        const target = (direction === 'w' ? 1 : -1) * (25 + Math.min(7, speed * .8));
        this.runnerOffset = mix(this.runnerOffset, target, 1 - Math.exp(-8 * dt));
        this.animate(dt, direction, speed, airborne, crouch);
    }

    resetRunner(direction) {
        this.direction = direction;
        this.runnerOffset = this.previousRunnerOffset = direction === 'w' ? 25 : -25;
        this.hopTime = null;
        this.hopRequested = false;
        this.ownerAirborne = false;
        this.elevation = this.previousElevation = 0;
        this.animator.setDirection(direction);
        this.animator.play('idle', { restart: true });
        this.state = 'idle';
    }

    animate(dt, targetDirection, speed, airy, crouch) {
        this.animator.captureStep();
        this.previousElevation = this.elevation;
        this.direction = this.sideView ? targetDirection : this.turn.toward(this.direction, targetDirection, dt);
        this.animator.setDirection(this.direction);
        if (airy && !this.ownerAirborne) this.hopRequested = true;
        if (this.hopRequested && this.hopTime === null) {
            this.hopTime = -HOP_DELAY;
            this.hopRequested = false;
        }
        this.ownerAirborne = airy;
        this.elevation = 0;
        let state = speed > 4.3 ? 'run' : speed > .22 ? 'walk' : 'idle';
        let progress = null;
        if (crouch) state = 'crouch';
        if (this.hopTime !== null) {
            this.hopTime += dt;
            const t = this.hopTime / HOP_DURATION;
            if (t >= 0 && t < 1) {
                this.elevation = 4 * t * (1 - t) * .76;
                if (t < .22) { state = 'takeoff'; progress = t / .22; }
                else if (t < .58) { state = 'jump'; progress = (t - .22) / .36; }
                else { state = 'fall'; progress = (t - .58) / .42; }
            } else if (t >= 1) {
                state = 'land';
                progress = (this.hopTime - HOP_DURATION) / HOP_RECOVERY;
                if (progress >= 1) this.hopTime = null;
            }
        }
        if (state !== this.state) {
            this.animator.play(state, { preservePhase: ['walk', 'run'].includes(this.state) && ['walk', 'run'].includes(state) });
            this.state = state;
        }
        const stride = state === 'walk' ? .93 : state === 'run' ? 1.43 : 0;
        const rate = stride ? Math.min(5, speed / stride) * this.animator.currentFrames().length / this.animator.animation.fps : 1;
        this.animator.setPlaybackRate(rate);
        if (progress === null) this.animator.update(dt);
        else this.animator.seek(progress);
    }

    sample(alpha = 1) {
        const frameName = this.animator.sample(alpha).frameName;
        const t = Math.min(1, Math.max(0, alpha));
        const from = this.previousPosition;
        const to = this.worldPosition;
        return { frame: this.atlas.frames[frameName], frameName,
            elevation: mix(this.previousElevation, this.elevation, t),
            world: from && { x: mix(from.x, to.x, t), z: mix(from.z, to.z, t) },
            runnerOffset: mix(this.previousRunnerOffset, this.runnerOffset, t) };
    }
}

export function syncCompanion(current, atlas, image, sideView = false) {
    const companion = atlas?.companion;
    if (!image || !companion?.animations) return null;
    if (current?.atlas.meta.imageRevision === companion.meta.imageRevision && current.sideView === sideView) return current;
    return new CompanionController(companion, image, { sideView });
}
