import * as THREE from 'three';

const ROLE_COLORS = Object.freeze({
    player: 0x67e8f9,
    seeker: 0xfb7185,
    hider: 0xa78bfa,
    eliminated: 0x475569,
});

function disposeObject(object) {
    object.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
    });
}

function createActorMesh({ color, isPlayer }) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.92, 5, 10), bodyMaterial);
    body.position.y = 0.96;
    body.castShadow = true;
    body.receiveShadow = true;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf8d9c5, roughness: 0.8 })
    );
    head.position.y = 1.83;
    head.castShadow = true;

    const direction = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.48, 8),
        new THREE.MeshBasicMaterial({ color: isPlayer ? 0xffffff : color })
    );
    direction.rotation.x = Math.PI / 2;
    direction.position.set(0, 0.16, 0.65);

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.72, 32),
        new THREE.MeshBasicMaterial({ color: isPlayer ? 0x67e8f9 : color, transparent: true, opacity: isPlayer ? 0.8 : 0.34, side: THREE.DoubleSide })
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
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x030611);
        this.scene.fog = new THREE.FogExp2(0x030611, 0.026);
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
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
        this.scene.add(new THREE.HemisphereLight(0x8ad8ff, 0x13091f, 1.35));
        const key = new THREE.DirectionalLight(0xffd7f4, 1.5);
        key.position.set(-8, 18, 9);
        key.castShadow = false;
        this.scene.add(key);
        const cyan = new THREE.PointLight(0x22d3ee, 30, 26, 2);
        cyan.position.set(-13, 6, -7);
        const pink = new THREE.PointLight(0xf472b6, 28, 24, 2);
        pink.position.set(14, 5, 7);
        this.scene.add(cyan, pink);
    }

    createMap() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.map.floor.width, this.map.floor.depth),
            new THREE.MeshStandardMaterial({ color: this.map.floor.color, roughness: 0.94, metalness: 0.02 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.floor = floor;

        this.map.staticColliders.forEach((definition) => {
            const width = definition.halfExtents.x * 2;
            const depth = definition.halfExtents.z * 2;
            const height = definition.height ?? 2;
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                new THREE.MeshStandardMaterial({ color: definition.color ?? 0x22304a, roughness: 0.72, metalness: 0.08 })
            );
            mesh.position.set(definition.position.x, height / 2, definition.position.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });

        this.map.hideSpots.forEach((spot) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(spot.radius * 0.7, spot.radius, 0.12, 28),
                new THREE.MeshBasicMaterial({ color: spot.color ?? 0xa78bfa, transparent: true, opacity: 0.2, depthWrite: false })
            );
            mesh.position.set(spot.position.x, 0.08, spot.position.z);
            this.scene.add(mesh);
            this.hideSpotMeshes.set(spot.id, mesh);
        });

        const grid = new THREE.GridHelper(44, 44, 0x23345a, 0x11192d);
        grid.position.y = 0.015;
        const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
        gridMaterials.forEach((material) => {
            material.transparent = true;
            material.opacity = 0.22;
        });
        this.scene.add(grid);
        this.grid = grid;
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
        this.visionCone.position.y = 0.025;
        this.scene.add(this.visionCone);
    }

    syncParticipants(participants, playerId, seekerId) {
        const liveIds = new Set(participants.map((participant) => participant.id));
        this.entities.forEach((mesh, id) => {
            if (!liveIds.has(id)) {
                this.scene.remove(mesh);
                disposeObject(mesh);
                this.entities.delete(id);
            }
        });

        participants.forEach((participant) => {
            let mesh = this.entities.get(participant.id);
            if (!mesh) {
                const color = participant.id === playerId
                    ? ROLE_COLORS.player
                    : participant.role === 'seeker' ? ROLE_COLORS.seeker : ROLE_COLORS.hider;
                mesh = createActorMesh({ color, isPlayer: participant.id === playerId });
                this.entities.set(participant.id, mesh);
                this.scene.add(mesh);
            }
            mesh.position.set(participant.position.x, participant.hidden ? -0.72 : 0, participant.position.z);
            const heading = Math.atan2(participant.forward.x, participant.forward.z);
            mesh.rotation.y = heading;
            const concealedFromPlayer = playerId === seekerId
                && participant.hidden
                && participant.id !== playerId;
            mesh.visible = !participant.eliminated && !concealedFromPlayer;
            mesh.userData.parts.body.material.opacity = participant.hidden ? 0.38 : 1;
            mesh.userData.parts.body.material.transparent = participant.hidden;
            mesh.userData.parts.head.material.opacity = participant.hidden ? 0.38 : 1;
            mesh.userData.parts.head.material.transparent = participant.hidden;
        });

        const seeker = participants.find((participant) => participant.id === seekerId);
        if (seeker) {
            this.visionCone.visible = !seeker.eliminated;
            this.visionCone.position.x = seeker.position.x;
            this.visionCone.position.z = seeker.position.z;
            this.visionCone.rotation.z = -Math.atan2(seeker.forward.x, seeker.forward.z);
        } else {
            this.visionCone.visible = false;
        }
    }

    updateCamera(player, deltaTime) {
        if (!player) return;
        const desired = new THREE.Vector3(player.position.x, 17.5, player.position.z + 15.5);
        const alpha = 1 - Math.exp(-4.2 * Math.max(0, deltaTime));
        this.camera.position.lerp(desired, alpha);
        this.cameraLook.set(player.position.x, 0.5, player.position.z);
        this.cameraTarget.lerp(this.cameraLook, alpha);
        this.camera.lookAt(this.cameraTarget);
    }

    setSpotActive(spotId, active) {
        const mesh = this.hideSpotMeshes.get(spotId);
        if (!mesh) return;
        mesh.material.opacity = active ? 0.5 : 0.2;
        mesh.scale.setScalar(active ? 1.12 : 1);
    }

    render(participants, { playerId, seekerId, deltaTime = 0 } = {}) {
        if (!participants) return;
        this.syncParticipants(participants, playerId, seekerId);
        this.updateCamera(participants.find((participant) => participant.id === playerId), deltaTime);
        this.hideSpotMeshes.forEach((mesh) => {
            mesh.rotation.y += deltaTime * 0.25;
        });
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
        this.entities.forEach((mesh) => disposeObject(mesh));
        this.entities.clear();
        this.hideSpotMeshes.forEach((mesh) => disposeObject(mesh));
        this.hideSpotMeshes.clear();
        disposeObject(this.floor);
        disposeObject(this.grid);
        disposeObject(this.visionCone);
        this.scene.clear();
    }
}
