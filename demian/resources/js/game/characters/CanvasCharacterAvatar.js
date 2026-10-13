import FrameAnimator from './FrameAnimator.js';
import {
    advanceCharacterAnimation,
    characterJumpPose,
    sharesLocomotionPhase,
    characterPresentationPose,
} from './CharacterMotionProfile.js';
import { CHARACTER_CANONICAL_BODY } from './CharacterVisualContract.js';
import { groundLocomotionState } from './CharacterLocomotionModel.js';

const DIRECTIONS = Object.freeze(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);

function directionFromForward(forward, fallback = 'e') {
    const x = Number(forward?.x) || 0;
    const z = Number(forward?.z) || 0;
    if (x * x + z * z < 0.0004) return fallback;
    const angle = Math.atan2(z, x);
    const sector = Math.round(angle / (Math.PI / 4));
    return DIRECTIONS[((sector % 8) + 8) % 8];
}

function damp(current, target, smoothing, deltaTime) {
    const alpha = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
    return current + (target - current) * alpha;
}
 
export default class CanvasCharacterAvatar {
    constructor({ slug, image, atlas, player = false }) {
        this.slug = slug;
        this.texture = { image };
        this.atlas = atlas;
        this.position = { x: 0, z: 0 };
        this.group = { position: this.position };
        this.character = { slug, name: slug, settings: {} };
        this.isPlayerControlled = Boolean(player);
        this.animator = new FrameAnimator(atlas);
        this.animator.play('idle');
        this.state = 'idle';
        this.previousState = 'idle';
        this.stateTime = 0;
        this.presentationTime = 0;
        this.direction = 'e';
        this.facing = 1;
        this.lastPosition = null;
        this.speedValue = 0;
        this.visual = { width: 1, height: 1, bob: 0, tilt: 0, x: 0, y: 0 };
    }

    chooseLocomotionState(actor, speed) {
        if (actor?.airborne === true || actor?.grounded === false) {
            return characterJumpPose(actor?.jumpVelocity ?? actor?.velocityY ?? 0, actor?.jumpForce ?? 6.5).state;
        }
        if (actor?.motionState && this.animator.has(actor.motionState)) {
            return actor.motionState;
        }
        return groundLocomotionState(speed, this.state, {
            sprintAllowed: speed > (this.state === 'sprint' ? 6 : 6.6),
        });
    }

    sync(actor, deltaTime = 0) {
        if (!actor) return this;
        const dt = Math.max(0, Number(deltaTime) || 0);
        const nextPosition = actor.position ?? actor.group?.position ?? actor;
        const x = Number(nextPosition?.x) || 0;
        const z = Number(nextPosition?.z) || 0;
        this.position = { x, z };
        this.group.position = this.position;

        const explicitSpeed = Number.isFinite(Number(actor.speed));
        let speed = explicitSpeed ? Number(actor.speed) : NaN;
        if (!Number.isFinite(speed)) {
            const vx = Number(actor.velocity?.x) || 0;
            const vz = Number(actor.velocity?.z) || 0;
            speed = Math.hypot(vx, vz);
        }
        if (!explicitSpeed && (!Number.isFinite(speed) || speed <= 0) && this.lastPosition && dt > 0.0001) {
            speed = Math.hypot(x - this.lastPosition.x, z - this.lastPosition.z) / dt;
        }
        this.speedValue = Number.isFinite(speed) ? speed : 0;
        this.lastPosition = { x, z };

        const forward = actor.forward ?? actor.lastMoveDirection ?? actor.velocity ?? { x: this.facing, z: 0 };
        const direction = directionFromForward(forward, this.direction);
        this.direction = direction;
        this.animator.setDirection(direction);
        const fx = Number(forward?.x) || 0;
        if (Math.abs(fx) > 0.08) {
            this.facing = fx >= 0 ? 1 : -1;
            this.animator.setFacing(this.facing);
        }

        const nextState = this.chooseLocomotionState(actor, this.speedValue);
        if (nextState !== this.state) {
            this.previousState = this.state;
            this.state = nextState;
            this.stateTime = 0;
            this.animator.play(nextState, {
                preservePhase: sharesLocomotionPhase(this.previousState, nextState),
            });
        }

        this.stateTime += dt;
        this.presentationTime += dt;
        const movementRatio = Math.min(1.6, this.speedValue / 6.5);
        advanceCharacterAnimation(this.animator, {
            state: this.state, movementRatio, deltaTime: dt,
            jumpVelocity: actor.jumpVelocity ?? actor.velocityY ?? 0,
            jumpForce: actor.jumpForce ?? 6.5,
            physicsOwnsJumpHeight: Boolean(this.atlas.render?.physicsOwnsJumpHeight),
            movementSpeed: this.speedValue, travelledDistance: actor.travelledDistance ?? null,
            stateTime: this.stateTime,
        });

        const target = characterPresentationPose({
            state: this.state,
            presentationTime: this.presentationTime,
            stateTime: this.stateTime,
            progress: this.animator.progress(),
            direction: this.direction,
            facing: this.facing,
            jumpVelocity: Number(actor.jumpVelocity ?? actor.velocityY ?? 0),
            jumpForce: Number(actor.jumpForce ?? 6.5),
            velocityX: Number(actor.velocity?.x) || 0,
        });

        if (this.atlas.render?.lockBodyScale) {
            Object.assign(target, { width: 1, height: 1, bob: 0, tilt: 0, x: 0, y: 0 });
        }

        this.visual.width = damp(this.visual.width, target.width, 16, dt);
        this.visual.height = damp(this.visual.height, target.height, 16, dt);
        this.visual.bob = damp(this.visual.bob, target.bob, 20, dt);
        this.visual.tilt = damp(this.visual.tilt, target.tilt, 18, dt);
        this.visual.x = damp(this.visual.x, target.x, 20, dt);
        this.visual.y = damp(this.visual.y, target.y, 20, dt);
        return this;
    }

    visualHeight() {
        return Number(this.atlas?.display?.worldHeight) || CHARACTER_CANONICAL_BODY.worldHeight;
    }
}
