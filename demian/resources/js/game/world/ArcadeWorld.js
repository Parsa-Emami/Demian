import * as THREE from 'three';
import { createCafeEnvironment } from '../shared/cafe/CafeSceneFactory.js';

export default class ArcadeWorld {
    constructor(scene, { performanceProfile = null, streamingMode = false } = {}) {
        this.scene = scene;
        this.performanceProfile = performanceProfile;
        this.streamingMode = Boolean(streamingMode);
        this.root = new THREE.Group();
        this.root.name = 'DemianReferenceCafeOpenWorld';
        this.cabinets = Object.freeze([]);
        this.decorObjects = [];
        this.elapsed = 0;

        scene.add(this.root);
        this.environment = createCafeEnvironment(this.root, { includeCeiling: true });
        this.collectDecorReferences();
    }

    collectDecorReferences() {
        this.root.traverse((child) => {
            if (!child?.material) return;
            if (child.material.emissiveIntensity > 0) {
                this.decorObjects.push({
                    object: child,
                    baseIntensity: child.material.emissiveIntensity,
                    phase: this.decorObjects.length * 0.55,
                });
            }
        });
    }

    update(deltaTime = 0) {
        this.elapsed += Math.max(0, Number(deltaTime) || 0);
        this.decorObjects.forEach((entry) => {
            const wave = 0.92 + Math.sin(this.elapsed * 0.9 + entry.phase) * 0.08;
            entry.object.material.emissiveIntensity = entry.baseIntensity * wave;
        });
    }

    dispose() {
        if (this.root?.parent) this.root.parent.remove(this.root);
        this.root?.traverse?.((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
            else child.material?.dispose?.();
        });
        this.decorObjects = [];
        this.environment = null;
        this.scene = null;
    }
}
