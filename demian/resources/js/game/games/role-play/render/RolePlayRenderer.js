import * as THREE from 'three';
import { createCafeEnvironment, updateCafeEnvironmentVisibility } from '../../../shared/cafe/CafeSceneFactory.js';
import { configureCafeScene } from '../../../shared/cafe/CafeScenePolicy.js';

function disposeObject(object) {
    object?.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
    });
}

function actorMesh(color, isPlayer = false) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, 0.88, 5, 10),
        new THREE.MeshStandardMaterial({ color, roughness: 0.66 })
    );
    body.position.y = 0.95;
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf4d5c4, roughness: 0.82 })
    );
    head.position.y = 1.78;
    const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.56, 0.66, 28),
        new THREE.MeshBasicMaterial({
            color: isPlayer ? 0x67e8f9 : color,
            transparent: true,
            opacity: isPlayer ? 0.85 : 0.28,
            side: THREE.DoubleSide,
        })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.025;
    group.add(body, head, marker);
    return group;
}

export default class RolePlayRenderer {
    constructor(context, map) {
        this.context = context;
        this.map = map;
        this.scene = configureCafeScene(new THREE.Scene(), { fogDensity: 0.014 });
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
        this.camera.position.set(0, 18, 17);
        this.actors = new Map();
        this.pickups = new Map();
        this.markers = new Map();
        this.pixelRatio = 1;
        this.createLighting();
        this.createMap();
        this.resize();
    }

    createLighting() {
        this.scene.add(new THREE.HemisphereLight(0xf3f0e8, 0x7d7369, 1.45));
        const key = new THREE.DirectionalLight(0xfff4dd, 2.05);
        key.position.set(-10, 20, 12);
        this.scene.add(key);

        const warmA = new THREE.PointLight(0xffcd7d, 8, 10, 2);
        warmA.position.set(-21, 2.4, -8.2);
        const warmB = new THREE.PointLight(0xffcd7d, 7, 10, 2);
        warmB.position.set(-21, 2.4, -13.0);
        const barLight = new THREE.PointLight(0xffefce, 7, 16, 2);
        barLight.position.set(14, 3.1, 3.5);
        this.scene.add(warmA, warmB, barLight);
    }

    createMap() {
        this.environment = createCafeEnvironment(this.scene, { includeCeiling: false });

        this.map.pickups.forEach((pickup) => {
            const mesh = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.34),
                new THREE.MeshStandardMaterial({ color: pickup.color, emissive: pickup.color, emissiveIntensity: 0.35 })
            );
            mesh.position.set(pickup.position.x, 0.62, pickup.position.z);
            this.scene.add(mesh);
            this.pickups.set(pickup.id, mesh);
        });

        this.map.interactables.forEach((entry) => {
            const mesh = new THREE.Mesh(
                new THREE.RingGeometry(0.55, 0.7, 28),
                new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(entry.position.x, 0.03, entry.position.z);
            this.scene.add(mesh);
            this.markers.set(entry.id, mesh);
        });
    }

    sync(world, dt) {
        const participants = [world.player, ...world.npcs.values()];
        const live = new Set(participants.map((actor) => actor.id));

        for (const [id, mesh] of this.actors) {
            if (!live.has(id)) {
                this.scene.remove(mesh);
                disposeObject(mesh);
                this.actors.delete(id);
            }
        }

        for (const actor of participants) {
            let mesh = this.actors.get(actor.id);
            if (!mesh) {
                mesh = actorMesh(actor.color ?? 0x94a3b8, actor.id === 'player');
                this.actors.set(actor.id, mesh);
                this.scene.add(mesh);
            }
            mesh.position.set(actor.position.x, 0, actor.position.z);
            mesh.rotation.y = Math.atan2(actor.forward?.x ?? 0, actor.forward?.z ?? 1);
        }

        for (const [id, mesh] of this.pickups) {
            mesh.visible = !world.collectedPickups.has(id);
            if (mesh.visible) mesh.rotation.y += dt * 1.8;
        }

        const player = world.player;
        const desired = new THREE.Vector3(player.position.x, 17.5, player.position.z + 15.5);
        const alpha = 1 - Math.exp(-4.5 * Math.max(0, dt));
        this.camera.position.lerp(desired, alpha);
        this.camera.lookAt(player.position.x, 0, player.position.z - 1.2);
        updateCafeEnvironmentVisibility(this.environment, this.camera);
    }

    setPickupVisible(id, visible) {
        const mesh = this.pickups.get(id);
        if (mesh) mesh.visible = visible;
    }

    resize() {
        const { width, height } = this.context.renderer.resize(this.pixelRatio ?? 1);
        this.camera.aspect = Math.max(1, width) / Math.max(1, height);
        this.camera.updateProjectionMatrix();
    }

    render() {
        this.context.renderer.renderer.render(this.scene, this.camera);
    }

    setPixelRatio(value) {
        this.pixelRatio = Math.max(0.75, Number(value) || 1);
        this.resize();
    }

    dispose() {
        disposeObject(this.environment);
        this.actors.clear();
        this.pickups.clear();
        this.markers.clear();
        this.scene.clear();
    }
}
