import * as THREE from 'three';
import { WORLD_CONFIG } from '../world/WorldConfig';

const EMPTY_ACTIONS = Object.freeze({
    jump: false,
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
    constructor(entity, index = 0, { navigationGrid = null, random = Math.random, worldBounds = WORLD_CONFIG.bounds } = {}) {
        this.entity = entity;
        this.index = index;
        this.navigationGrid = navigationGrid;
        this.random = random;
        this.worldBounds = Object.freeze('minX' in worldBounds ? { ...worldBounds } : { minX: -worldBounds.x, maxX: worldBounds.x, minZ: -worldBounds.z, maxZ: worldBounds.z });
        this.target = new THREE.Vector3();
        this.path = [];
        this.pathIndex = 0;
        this.decisionTimer = 0;
        this.repathTimer = 0;
        this.pauseTimer = 0;
        this.actionCooldown = 1 + this.random() * 2;
        this.jumpCooldown = 1.5 + this.random() * 2.5;
        this.speedBias = 0.55 + this.random() * 0.35;
        this.pendingAction = null;
        this.chooseTarget(true);
    }

    chooseTarget(initial = false) {
        const attempts = this.navigationGrid ? 12 : 1;
        let selected = null;
        let path = [];

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const point = this.randomWorldPoint(initial ? 8 : 4.5);
            if (!this.navigationGrid) {
                selected = point;
                break;
            }

            path = this.navigationGrid.findPath(this.entity.group.position, point);
            if (path.length > 1) {
                selected = point;
                break;
            }
        }

        selected ??= { x: 0, z: 0 };
        this.target.set(selected.x, 0, selected.z);
        this.path = path;
        this.pathIndex = path.length > 1 ? 1 : 0;
        this.decisionTimer = 2.8 + this.random() * 4.5;
        this.repathTimer = 0.8 + this.random() * 0.7;
    }

    randomWorldPoint(margin = 4) {
        const minX = this.worldBounds.minX + margin;
        const maxX = this.worldBounds.maxX - margin;
        const minZ = this.worldBounds.minZ + margin;
        const maxZ = this.worldBounds.maxZ - margin;
        return { x: minX + this.random() * Math.max(1, maxX - minX), z: minZ + this.random() * Math.max(1, maxZ - minZ) };
    }

    currentWaypoint(position) {
        if (!this.navigationGrid || this.path.length === 0) return this.target;
        let waypoint = this.path[this.pathIndex] ?? this.path.at(-1);
        while (waypoint && Math.hypot(waypoint.x - position.x, waypoint.z - position.z) < 0.75) {
            this.pathIndex += 1;
            waypoint = this.path[this.pathIndex] ?? this.path.at(-1);
            if (this.pathIndex >= this.path.length - 1) break;
        }
        return waypoint ? new THREE.Vector3(waypoint.x, 0, waypoint.z) : this.target;
    }

    rebuildPath() {
        if (!this.navigationGrid) return;
        this.path = this.navigationGrid.findPath(this.entity.group.position, this.target);
        this.pathIndex = this.path.length > 1 ? 1 : 0;
        this.repathTimer = 1 + this.random() * 0.8;
    }

    avoidCrowd(direction, neighbours) {
        const position = this.entity.group.position;
        const separation = new THREE.Vector3();

        neighbours.forEach((other) => {
            if (!other || other === this.entity) return;
            const offset = position.clone().sub(other.group.position);
            const distanceSq = offset.x * offset.x + offset.z * offset.z;
            if (distanceSq > 0.001 && distanceSq < 9) {
                separation.add(offset.multiplyScalar(1 / distanceSq));
            }
        });

        if (separation.lengthSq() > 0.0001) direction.add(separation.multiplyScalar(1.45)).normalize();
    }

    keepInsideWorld(direction) {
        const position = this.entity.group.position;
        if (position.x > this.worldBounds.maxX - 4) direction.x -= 1.8;
        if (position.x < this.worldBounds.minX + 4) direction.x += 1.8;
        if (position.z > this.worldBounds.maxZ - 4) direction.z -= 1.8;
        if (position.z < this.worldBounds.minZ + 4) direction.z += 1.8;
        if (direction.lengthSq() > 0.0001) direction.normalize();
    }

    update(deltaTime, playerEntity, neighbours = []) {
        this.decisionTimer -= deltaTime;
        this.repathTimer -= deltaTime;
        this.pauseTimer = Math.max(0, this.pauseTimer - deltaTime);
        this.actionCooldown = Math.max(0, this.actionCooldown - deltaTime);
        this.jumpCooldown = Math.max(0, this.jumpCooldown - deltaTime);

        const position = this.entity.group.position;
        const targetDistance = Math.hypot(this.target.x - position.x, this.target.z - position.z);

        if (targetDistance < 1.5 || this.decisionTimer <= 0) {
            if (this.random() < 0.28) this.pauseTimer = 0.7 + this.random() * 1.8;
            this.chooseTarget();
        } else if (this.repathTimer <= 0) {
            this.rebuildPath();
        }

        const waypoint = this.currentWaypoint(position);
        const toTarget = waypoint.clone().sub(position).setY(0);
        const waypointDistance = toTarget.length();
        const actionInput = { ...EMPTY_ACTIONS };

        if (this.pendingAction) {
            actionInput[this.pendingAction] = true;
            this.pendingAction = null;
        }

        const playerDistance = playerEntity ? position.distanceTo(playerEntity.group.position) : Infinity;
        if (this.actionCooldown <= 0) {
            if (playerDistance < 5.5 && this.random() < 0.48) {
                this.pendingAction = SOCIAL_ACTIONS[Math.floor(this.random() * SOCIAL_ACTIONS.length)];
                if (this.random() < 0.32) actionInput.speak = true;
            } else if (this.random() < 0.22) {
                this.pendingAction = this.random() < 0.55 ? 'dash' : 'spin';
            }
            this.actionCooldown = 3.2 + this.random() * 5.5;
        }

        if (
            this.jumpCooldown <= 0 &&
            this.pauseTimer <= 0 &&
            targetDistance > 5 &&
            this.random() < deltaTime * 0.2
        ) {
            actionInput.jump = true;
            this.jumpCooldown = 2.2 + this.random() * 4.2;
        }

        if (this.pauseTimer > 0 || waypointDistance < 0.01) {
            return { x: 0, z: 0, run: false, ...actionInput };
        }

        const direction = toTarget.normalize();
        this.avoidCrowd(direction, neighbours);
        this.keepInsideWorld(direction);

        return {
            x: THREE.MathUtils.clamp(direction.x, -1, 1),
            z: THREE.MathUtils.clamp(direction.z, -1, 1),
            run: this.speedBias > 0.72 || targetDistance > 12,
            ...actionInput,
        };
    }
}
