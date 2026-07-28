import * as THREE from 'three';
import { randomWorldPoint, WORLD_CONFIG } from '../world/WorldConfig';

const EMPTY_ACTIONS = Object.freeze({
    jump: false,
    attack: false,
    combo: false,
    uppercut: false,
    cast: false,
    charge: false,
    hurt: false,
    dash: false,
    slide: false,
    dodge: false,
    win: false,
    celebrate: false,
    dance: false,
    wave: false,
    salute: false,
    spin: false,
    crouch: false,
    laugh: false,
    pose: false,
    sleep: false,
    taunt: false,
    speak: false,
});

const SOCIAL_ACTIONS = Object.freeze([
    'wave',
    'salute',
    'dance',
    'pose',
    'laugh',
    'celebrate',
]);

export default class NpcBrain {
    constructor(entity, index = 0) {
        this.entity = entity;
        this.index = index;
        this.target = new THREE.Vector3();
        this.decisionTimer = 0;
        this.pauseTimer = 0;
        this.actionCooldown = 1 + Math.random() * 2;
        this.jumpCooldown = 1.5 + Math.random() * 2.5;
        this.speedBias = 0.55 + Math.random() * 0.35;
        this.pendingAction = null;
        this.chooseTarget(true);
    }

    chooseTarget(initial = false) {
        const point = randomWorldPoint(initial ? 8 : 4.5);
        this.target.set(point.x, 0, point.z);
        this.decisionTimer = 2.8 + Math.random() * 4.5;
    }

    avoidCrowd(direction, neighbours) {
        const position = this.entity.group.position;
        const separation = new THREE.Vector3();

        neighbours.forEach((other) => {
            if (!other || other === this.entity) {
                return;
            }

            const offset = position.clone().sub(other.group.position);
            const distanceSq = offset.x * offset.x + offset.z * offset.z;
            if (distanceSq > 0.001 && distanceSq < 9) {
                separation.add(offset.multiplyScalar(1 / distanceSq));
            }
        });

        if (separation.lengthSq() > 0.0001) {
            direction.add(separation.multiplyScalar(1.45)).normalize();
        }
    }

    keepInsideWorld(direction) {
        const position = this.entity.group.position;
        const edgeX = WORLD_CONFIG.bounds.x - 4;
        const edgeZ = WORLD_CONFIG.bounds.z - 4;

        if (Math.abs(position.x) > edgeX) {
            direction.x += -Math.sign(position.x) * 1.8;
        }
        if (Math.abs(position.z) > edgeZ) {
            direction.z += -Math.sign(position.z) * 1.8;
        }

        if (direction.lengthSq() > 0.0001) {
            direction.normalize();
        }
    }

    update(deltaTime, playerEntity, neighbours = []) {
        this.decisionTimer -= deltaTime;
        this.pauseTimer = Math.max(0, this.pauseTimer - deltaTime);
        this.actionCooldown = Math.max(0, this.actionCooldown - deltaTime);
        this.jumpCooldown = Math.max(0, this.jumpCooldown - deltaTime);

        const position = this.entity.group.position;
        const toTarget = this.target.clone().sub(position).setY(0);
        const targetDistance = toTarget.length();

        if (targetDistance < 1.5 || this.decisionTimer <= 0) {
            if (Math.random() < 0.28) {
                this.pauseTimer = 0.7 + Math.random() * 1.8;
            }
            this.chooseTarget();
        }

        const actionInput = { ...EMPTY_ACTIONS };

        if (this.pendingAction) {
            actionInput[this.pendingAction] = true;
            this.pendingAction = null;
        }

        const playerDistance = playerEntity
            ? position.distanceTo(playerEntity.group.position)
            : Infinity;

        if (this.actionCooldown <= 0) {
            if (playerDistance < 5.5 && Math.random() < 0.48) {
                this.pendingAction = SOCIAL_ACTIONS[Math.floor(Math.random() * SOCIAL_ACTIONS.length)];
                if (Math.random() < 0.32) {
                    actionInput.speak = true;
                }
            } else if (Math.random() < 0.22) {
                this.pendingAction = Math.random() < 0.55 ? 'dash' : 'spin';
            }
            this.actionCooldown = 3.2 + Math.random() * 5.5;
        }

        const shouldJump =
            this.jumpCooldown <= 0 &&
            this.pauseTimer <= 0 &&
            targetDistance > 5 &&
            Math.random() < deltaTime * 0.2;

        if (shouldJump) {
            actionInput.jump = true;
            this.jumpCooldown = 2.2 + Math.random() * 4.2;
        }

        if (this.pauseTimer > 0 || targetDistance < 0.01) {
            return {
                x: 0,
                z: 0,
                run: false,
                ...actionInput,
            };
        }

        const direction = toTarget.normalize();
        this.avoidCrowd(direction, neighbours);
        this.keepInsideWorld(direction);

        return {
            x: THREE.MathUtils.clamp(direction.x, -1, 1),
            // The studio movement basis is world aligned, so preserve world Z.
            z: THREE.MathUtils.clamp(direction.z, -1, 1),
            run: this.speedBias > 0.72 || targetDistance > 12,
            ...actionInput,
        };
    }
}
