import * as THREE from 'three';
import { COLLISION_LAYERS } from '../../../shared/collision/CollisionLayers.js';

function seeded(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

export default class OpenWorldChunkRenderer {
    constructor({ scene, collisionScope, navigationGrid, environment, manifest, eventBus = null } = {}) {
        this.scene = scene;
        this.collisionScope = collisionScope;
        this.navigationGrid = navigationGrid;
        this.environment = environment;
        this.manifest = manifest;
        this.eventBus = eventBus;
    }

    async create(definition, { signal = null, tier = 'active' } = {}) {
        if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        const group = new THREE.Group();
        group.name = `OpenWorldChunk:${definition.id}`;
        const base = new THREE.Group();
        const detail = new THREE.Group();
        group.add(base, detail);
        const size = this.manifest.chunkSize;
        const floor = new THREE.Mesh(
            this.environment.geometry('chunk-floor', () => new THREE.PlaneGeometry(size - 0.35, size - 0.35)),
            this.environment.material(`floor-${definition.theme}`, {
                color: this.environment.themeColor(definition.theme),
                transparent: true,
                opacity: 0.92,
                depthWrite: true,
            })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(definition.center.x, -0.045, definition.center.z);
        base.add(floor);

        const roadMaterial = this.environment.material('chunk-road', { color: 0x111936, transparent: true, opacity: 0.82 });
        const roadX = new THREE.Mesh(this.environment.geometry('road-x', () => new THREE.PlaneGeometry(size - 1, 4.2)), roadMaterial);
        roadX.rotation.x = -Math.PI / 2;
        roadX.position.set(definition.center.x, -0.02, definition.center.z);
        base.add(roadX);
        const roadZ = new THREE.Mesh(this.environment.geometry('road-z', () => new THREE.PlaneGeometry(4.2, size - 1)), roadMaterial);
        roadZ.rotation.x = -Math.PI / 2;
        roadZ.position.set(definition.center.x, -0.018, definition.center.z);
        base.add(roadZ);

        const colliderIds = [];
        const blockerIds = [];
        const boxGeometry = this.environment.geometry('unit-building', () => new THREE.BoxGeometry(1, 1, 1));
        const buildingMaterial = this.environment.material(`building-${definition.theme}`, {
            color: new THREE.Color(this.environment.themeColor(definition.theme)).offsetHSL(0, 0.08, 0.1),
            transparent: true,
            opacity: 0.96,
        });
        definition.obstacles.forEach((obstacle) => {
            const mesh = new THREE.Mesh(boxGeometry, buildingMaterial);
            mesh.scale.set(obstacle.halfExtents.x * 2, obstacle.height, obstacle.halfExtents.z * 2);
            mesh.position.set(obstacle.position.x, obstacle.height / 2, obstacle.position.z);
            detail.add(mesh);
            const localId = `${definition.id}:${obstacle.id}`;
            this.collisionScope.addStaticAabb(localId, obstacle.position, obstacle.halfExtents, {
                layer: COLLISION_LAYERS.WORLD,
                mask: COLLISION_LAYERS.CHARACTER,
                userData: { kind: 'streamed-obstacle', chunkId: definition.id },
            });
            colliderIds.push(localId);
            this.navigationGrid.setDynamicBlocker(localId, {
                position: obstacle.position,
                radius: Math.hypot(obstacle.halfExtents.x, obstacle.halfExtents.z) + 0.45,
            });
            blockerIds.push(localId);
        });

        const random = seeded(definition.seed);
        const pillarGeometry = this.environment.geometry('neon-pillar', () => new THREE.BoxGeometry(0.22, 1, 0.22));
        const pillarMaterial = this.environment.material(`neon-${definition.theme}`, {
            color: new THREE.Color(this.environment.themeColor(definition.theme)).offsetHSL(0.08, 0.35, 0.32),
        });
        const pillarCount = definition.legacyHub ? 4 : 8;
        for (let index = 0; index < pillarCount; index += 1) {
            const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            const height = 1.2 + random() * 4;
            pillar.scale.y = height;
            pillar.position.set(
                definition.bounds.minX + 2 + random() * (size - 4),
                height / 2,
                definition.bounds.minZ + 2 + random() * (size - 4)
            );
            detail.add(pillar);
        }

        const beaconGeometry = this.environment.geometry('save-beacon', () => new THREE.TorusGeometry(0.8, 0.12, 8, 24));
        const beaconMaterial = this.environment.material('save-beacon-material', { color: 0x34d399, transparent: true, opacity: 0.92 });
        this.manifest.savePoints.filter((point) => point.chunkId === definition.id).forEach((point) => {
            const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
            beacon.rotation.x = Math.PI / 2;
            beacon.position.set(point.position.x, 0.2, point.position.z);
            beacon.userData.savePointId = point.id;
            detail.add(beacon);
        });

        this.scene.add(group);
        const handle = {
            id: definition.id,
            group,
            tier,
            setTier: (nextTier) => {
                handle.tier = nextTier;
                detail.visible = nextTier === 'active';
                base.visible = true;
            },
            update: (elapsed) => {
                if (!detail.visible) return;
                detail.children.forEach((child) => {
                    if (child.userData?.savePointId) child.rotation.z += elapsed * 0.75;
                });
            },
            dispose: () => {
                this.scene.remove(group);
                colliderIds.forEach((id) => this.collisionScope.remove(id));
                blockerIds.forEach((id) => this.navigationGrid.removeDynamicBlocker(id));
                group.clear();
            },
        };
        handle.setTier(tier);
        this.eventBus?.emit('world:chunk-renderer-created', { definition, handle });
        return handle;
    }
}
