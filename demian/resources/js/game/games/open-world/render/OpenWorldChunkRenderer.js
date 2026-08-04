import * as THREE from 'three';

function disposeObject(object) {
    object?.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
    });
}

export default class OpenWorldChunkRenderer {
    constructor({ scene, collisionScope, navigationGrid, environment, manifest, eventBus } = {}) {
        this.scene = scene;
        this.collisionScope = collisionScope;
        this.navigationGrid = navigationGrid;
        this.environment = environment;
        this.manifest = manifest;
        this.eventBus = eventBus;
    }

    create(definition, tier = 'preload') {
        const group = new THREE.Group();
        group.name = `ReferenceCafeChunk:${definition.id}`;

        const saveRingGeometry = this.environment.geometry(`save-ring-${definition.id}`, () => new THREE.RingGeometry(0.72, 0.98, 40));
        const saveRingMaterial = this.environment.material(`save-ring-material-${definition.id}`, {
            color: 0xd6a35c,
            transparent: true,
            opacity: 0.34,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        const savePillarGeometry = this.environment.geometry(`save-pillar-${definition.id}`, () => new THREE.CylinderGeometry(0.1, 0.18, 1.8, 12));
        const savePillarMaterial = this.environment.material(`save-pillar-material-${definition.id}`, {
            color: 0xf4c77a,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
        });

        const savePoints = this.manifest.savePoints.filter((point) => point.chunkId === definition.id);
        const markers = savePoints.map((point, index) => {
            const ring = new THREE.Mesh(saveRingGeometry, saveRingMaterial);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(point.position.x, 0.035, point.position.z);
            ring.renderOrder = 20;
            group.add(ring);

            const pillar = new THREE.Mesh(savePillarGeometry, savePillarMaterial);
            pillar.position.set(point.position.x, 0.95, point.position.z);
            pillar.userData.phase = index * 0.7;
            group.add(pillar);
            return { ring, pillar };
        });

        this.scene.add(group);

        const handle = {
            id: definition.id,
            group,
            tier,
            setTier(nextTier) {
                handle.tier = nextTier;
                group.visible = true;
                markers.forEach(({ ring, pillar }) => {
                    ring.visible = nextTier === 'active';
                    pillar.visible = nextTier === 'active';
                });
            },
            update(elapsed = 0) {
                if (handle.tier !== 'active') return;
                markers.forEach(({ ring, pillar }) => {
                    ring.rotation.z += elapsed * 0.18;
                    pillar.position.y = 0.95 + Math.sin(performance.now() * 0.0025 + (pillar.userData.phase ?? 0)) * 0.08;
                });
            },
            dispose() {
                if (group.parent) group.parent.remove(group);
                disposeObject(group);
            },
        };
        handle.setTier(tier);
        this.eventBus?.emit('world:chunk-renderer-created', { definition, handle });
        return handle;
    }
}
