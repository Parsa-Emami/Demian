import * as THREE from 'three';
import { createCafeEnvironment, updateCafeEnvironmentVisibility } from '../../../shared/cafe/CafeSceneFactory.js';
import { configureCafeScene } from '../../../shared/cafe/CafeScenePolicy.js';

const ROLE_COLORS = Object.freeze({
    player: 0x67e8f9,
    seeker: 0xfb7185,
    hider: 0xa78bfa,
    eliminated: 0x475569,
});

function disposeObject(object) {
    object?.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
    });
}

function createActorMesh({ color, isPlayer }) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), bodyMaterial);
    body.position.y = 0.96;
    body.scale.y = 1.9;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf8d9c5, roughness: 0.8 })
    );
    head.position.y = 1.83;

    const direction = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.48, 8),
        new THREE.MeshBasicMaterial({ color: isPlayer ? 0xffffff : color })
    );
    direction.rotation.x = Math.PI / 2;
    direction.position.set(0, 0.16, 0.65);

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.72, 32),
        new THREE.MeshBasicMaterial({
            color: isPlayer ? 0x67e8f9 : color,
            transparent: true,
            opacity: isPlayer ? 0.8 : 0.34,
            side: THREE.DoubleSide,
        })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;

    group.add(body, head, direction, ring);
    group.userData.parts = { body, head, direction, ring };
    return group;
}

export default class HideAndSeekRenderer {
    constructor(context, map) {
        this.context = context;
        this.map = map;
        this.scene = configureCafeScene(new THREE.Scene(), { fogDensity: 0.016 });
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
        this.camera.position.set(0, 18, 17);
        this.cameraTarget = new THREE.Vector3();
        this.cameraLook = new THREE.Vector3();
        this.entities = new Map();
        this.hideSpotMeshes = new Map();
        this.pixelRatio = 1;
        this.createLighting();
        this.createMap();
        this.createVisionCone();
        this.resize();
    }

    createLighting() {
        this.scene.add(new THREE.HemisphereLight(0xf1ece4, 0x746d67, 1.42));
        const key = new THREE.DirectionalLight(0xfff2d9, 1.95);
        key.position.set(-8, 18, 9);
        this.scene.add(key);
        const entrance = new THREE.PointLight(0xffffff, 4.5, 18, 2);
        entrance.position.set(0, 3.0, 14.5);
        const lounge = new THREE.PointLight(0xffcb82, 7.0, 10, 2);
        lounge.position.set(-20.5, 2.4, -8.5);
        const counter = new THREE.PointLight(0xffefce, 6.0, 15, 2);
        counter.position.set(14, 3.1, 4.0);
        this.scene.add(entrance, lounge, counter);
    }

    createMap() {
        this.environment = createCafeEnvironment(this.scene, { includeCeiling: false });

        this.map.hideSpots.forEach((spot) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(spot.radius * 0.7, spot.radius, 0.12, 28),
                new THREE.MeshBasicMaterial({ color: spot.color ?? 0xa78bfa, transparent: true, opacity: 0.16, depthWrite: false })
            );
            mesh.position.set(spot.position.x, 0.08, spot.position.z);
            this.scene.add(mesh);
            this.hideSpotMeshes.set(spot.id, mesh);
        });
    }

    createVisionCone() {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        const radius = 13.5;
        const half = THREE.MathUtils.degToRad(52.5);
        const segments = 36;
        for (let index = 0; index <= segments; index += 1) {
            const angle = -half + (index / segments) * half * 2;
            shape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
        }
        shape.lineTo(0, 0);
        this.visionCone = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide })
        );
        this.visionCone.rotation.x = -Math.PI / 2;
        this.visionCone.visible = false;
        this.scene.add(this.visionCone);
    }

    syncParticipants(participants, playerId, seekerId) {
        const live = new Set(participants.map((participant) => participant.id));
        for (const [id, mesh] of this.entities) {
            if (!live.has(id)) {
                this.scene.remove(mesh);
                disposeObject(mesh);
                this.entities.delete(id);
            }
        }

        participants.forEach((participant) => {
            let mesh = this.entities.get(participant.id);
            if (!mesh) {
                const role = participant.id === playerId
                    ? 'player'
                    : participant.id === seekerId
                        ? 'seeker'
                        : 'hider';
                mesh = createActorMesh({ color: ROLE_COLORS[role], isPlayer: participant.id === playerId });
                this.entities.set(participant.id, mesh);
                this.scene.add(mesh);
            }

            mesh.position.set(participant.position.x, 0, participant.position.z);
            mesh.rotation.y = Math.atan2(participant.forward?.x ?? 0, participant.forward?.z ?? 1);
            const isEliminated = Boolean(participant.eliminated);
            const activeColor = participant.id === playerId
                ? ROLE_COLORS.player
                : participant.id === seekerId
                    ? ROLE_COLORS.seeker
                    : ROLE_COLORS.hider;
            mesh.userData.parts.body.material.color.setHex(isEliminated ? ROLE_COLORS.eliminated : activeColor);
            mesh.userData.parts.direction.material.color.setHex(participant.id === playerId ? 0xffffff : activeColor);
            mesh.userData.parts.ring.material.color.setHex(isEliminated ? ROLE_COLORS.eliminated : activeColor);
            mesh.userData.parts.ring.material.opacity = participant.id === playerId ? 0.82 : isEliminated ? 0.16 : 0.34;

            if (participant.id === seekerId) {
                this.visionCone.visible = true;
                this.visionCone.position.set(participant.position.x, 0.06, participant.position.z);
                this.visionCone.rotation.z = -Math.atan2(participant.forward?.x ?? 0, participant.forward?.z ?? 1);
            }
        });
    }

    updateCamera(player, deltaTime) {
        if (!player) return;
        const desired = new THREE.Vector3(player.position.x, 18, player.position.z + 16);
        const alpha = 1 - Math.exp(-4.2 * Math.max(0, deltaTime));
        this.camera.position.lerp(desired, alpha);
        this.cameraLook.set(player.position.x, 0.5, player.position.z);
        this.cameraTarget.lerp(this.cameraLook, alpha);
        this.camera.lookAt(this.cameraTarget);
        updateCafeEnvironmentVisibility(this.environment, this.camera);
    }

    setSpotActive(spotId, active) {
        const mesh = this.hideSpotMeshes.get(spotId);
        if (!mesh) return;
        mesh.material.opacity = active ? 0.42 : 0.16;
        mesh.scale.setScalar(active ? 1.12 : 1);
    }

    render(participants, { playerId, seekerId, deltaTime = 0 } = {}) {
        if (!participants) return;
        this.syncParticipants(participants, playerId, seekerId);
        this.updateCamera(participants.find((participant) => participant.id === playerId), deltaTime);
        this.hideSpotMeshes.forEach((mesh) => {
            mesh.rotation.y += deltaTime * 0.25;
        });
        this.context.renderer.render(this.scene, this.camera);
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = pixelRatio;
        const { width, height } = this.context.renderer.resize(pixelRatio);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        return { width, height };
    }

    dispose() {
        this.entities.forEach((mesh) => disposeObject(mesh));
        this.entities.clear();
        this.hideSpotMeshes.forEach((mesh) => disposeObject(mesh));
        this.hideSpotMeshes.clear();
        disposeObject(this.environment);
        disposeObject(this.visionCone);
        this.scene.clear();
    }
}
