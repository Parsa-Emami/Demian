import * as THREE from 'three';
import { createCafeEnvironment, updateCafeEnvironmentVisibility } from '../../../shared/cafe/CafeSceneFactory.js';

function disposeObject(object) {
    object?.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
    });
}

function createPlayerMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.46, 0.92, 5, 10),
        new THREE.MeshStandardMaterial({ color: 0x67e8f9, roughness: 0.55, metalness: 0.12 })
    );
    body.position.y = 0.98;
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf8d9c5, roughness: 0.78 })
    );
    head.position.y = 1.84;
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.75, 32),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    group.add(body, head, ring);
    group.userData.ring = ring;
    return group;
}

function collectibleColor(item) {
    return item === 'coffee-cup' ? 0xfbbf24 : 0x22d3ee;
}

export default class EventRenderer {
    constructor(context, map) {
        this.context = context;
        this.map = map;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xdad5cc);
        this.scene.fog = new THREE.FogExp2(0xdad5cc, 0.014);
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
        this.camera.position.set(0, 18, 16);
        this.cameraTarget = new THREE.Vector3();
        this.cameraLook = new THREE.Vector3();
        this.collectibleMeshes = new Map();
        this.zoneMeshes = new Map();
        this.enemyMeshes = new Map();
        this.pixelRatio = 1;
        this.definitionId = null;
        this.createLighting();
        this.createMap();
        this.playerMesh = createPlayerMesh();
        this.scene.add(this.playerMesh);
        this.resize();
    }

    createLighting() {
        this.scene.add(new THREE.HemisphereLight(0xf2eee6, 0x766e65, 1.45));
        const key = new THREE.DirectionalLight(0xfff0d6, 1.82);
        key.position.set(-8, 18, 10);
        this.scene.add(key);
        const entrance = new THREE.PointLight(0xffffff, 4.2, 18, 2);
        entrance.position.set(0, 3.2, 14.5);
        const amber = new THREE.PointLight(0xfbbf24, 5.2, 14, 2);
        amber.position.set(14, 3.0, 7);
        const warm = new THREE.PointLight(0xffc778, 5.8, 10, 2);
        warm.position.set(-20.6, 2.4, -8.4);
        this.scene.add(entrance, amber, warm);
    }

    createMap() {
        this.environment = createCafeEnvironment(this.scene, { includeCeiling: false });
    }

    configure(definition, modifiers) {
        this.clearEventEntities();
        this.definitionId = definition.id;
        this.scene.fog.density = modifiers.fogDensity;

        for (const item of definition.world.collectibles) {
            const mesh = new THREE.Mesh(
                item.item === 'coffee-cup'
                    ? new THREE.CylinderGeometry(0.26, 0.34, 0.52, 14)
                    : new THREE.OctahedronGeometry(0.38, 0),
                new THREE.MeshStandardMaterial({
                    color: collectibleColor(item.item),
                    emissive: collectibleColor(item.item),
                    emissiveIntensity: 0.65,
                    roughness: 0.34,
                    metalness: 0.18,
                })
            );
            mesh.position.set(item.x, 0.62, item.z);
            this.collectibleMeshes.set(item.id, mesh);
            this.scene.add(mesh);
        }

        for (const zone of definition.world.zones) {
            const mesh = new THREE.Mesh(
                new THREE.RingGeometry(Math.max(0.25, zone.radius - 0.18), zone.radius, 40),
                new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.48, side: THREE.DoubleSide })
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(zone.x, 0.04, zone.z);
            this.zoneMeshes.set(zone.id, mesh);
            this.scene.add(mesh);
        }

        for (const enemy of definition.world.enemies) {
            const mesh = new THREE.Group();
            const core = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.55, 1),
                new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0x7f1d3a, emissiveIntensity: 0.6, roughness: 0.4 })
            );
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.73, 0.06, 8, 28),
                new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.75 })
            );
            ring.rotation.x = Math.PI / 2;
            mesh.add(core, ring);
            mesh.position.set(enemy.x, 0.75, enemy.z);
            mesh.userData.ring = ring;
            this.enemyMeshes.set(enemy.id, mesh);
            this.scene.add(mesh);
        }
    }

    clearEventEntities() {
        for (const collection of [this.collectibleMeshes, this.zoneMeshes, this.enemyMeshes]) {
            collection.forEach((mesh) => {
                this.scene.remove(mesh);
                disposeObject(mesh);
            });
            collection.clear();
        }
    }

    sync(world, deltaTime = 0) {
        const player = world.player;
        this.playerMesh.position.set(player.position.x, 0, player.position.z);
        this.playerMesh.rotation.y = Math.atan2(player.forward.x, player.forward.z);
        this.playerMesh.userData.ring.rotation.z += deltaTime * 0.7;

        for (const item of world.collectibles.values()) {
            const mesh = this.collectibleMeshes.get(item.id);
            if (!mesh) continue;
            mesh.visible = !item.collected;
            mesh.rotation.y += deltaTime * 1.7;
            mesh.position.y = 0.62 + Math.sin(world.elapsed * 3 + item.phase) * 0.11;
        }
        for (const zone of world.zones.values()) {
            const mesh = this.zoneMeshes.get(zone.id);
            if (!mesh) continue;
            mesh.material.opacity = zone.reached ? 0.16 : 0.48;
            mesh.rotation.z += deltaTime * 0.22;
        }
        for (const enemy of world.enemies.values()) {
            const mesh = this.enemyMeshes.get(enemy.id);
            if (!mesh) continue;
            mesh.visible = !enemy.defeated;
            mesh.position.x = enemy.position.x;
            mesh.position.z = enemy.position.z;
            mesh.position.y = 0.78 + Math.sin(world.elapsed * 4 + enemy.phase) * 0.08;
            mesh.userData.ring.rotation.z += deltaTime * 1.4;
            const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
            mesh.scale.setScalar(0.75 + healthRatio * 0.25);
        }
    }

    updateCamera(player, deltaTime) {
        const desired = new THREE.Vector3(player.position.x, 18, player.position.z + 16);
        const alpha = 1 - Math.exp(-4.8 * Math.max(0, deltaTime));
        this.camera.position.lerp(desired, alpha);
        this.cameraLook.set(player.position.x, 0.6, player.position.z);
        this.cameraTarget.lerp(this.cameraLook, alpha);
        this.camera.lookAt(this.cameraTarget);
        updateCafeEnvironmentVisibility(this.environment, this.camera);
    }

    render(world, deltaTime = 0) {
        if (!world) return;
        this.sync(world, deltaTime);
        this.updateCamera(world.player, deltaTime);
        this.context.renderer.renderer.render(this.scene, this.camera);
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = pixelRatio;
        const { width, height } = this.context.renderer.resize(pixelRatio);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        return { width, height };
    }

    dispose() {
        this.clearEventEntities();
        disposeObject(this.environment);
        disposeObject(this.playerMesh);
        this.scene.clear();
    }
}
