import * as THREE from 'three';
import { createCafeEnvironment, updateCafeEnvironmentVisibility } from '../shared/cafe/CafeSceneFactory.js';

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
        this.environment = createCafeEnvironment(this.root, { includeCeiling: false });
        this.collectDecorReferences();
    }


    ensureAttached() {
        if (!this.scene || !this.root) return false;
        if (this.root.parent !== this.scene) this.scene.add(this.root);
        this.root.visible = true;
        if (this.environment) this.environment.visible = true;
        return true;
    }

    renderStats() {
        let meshes = 0;
        let visibleMeshes = 0;
        this.root?.traverse?.((child) => {
            if (!child?.isMesh) return;
            meshes += 1;
            if (child.visible !== false) visibleMeshes += 1;
        });
        return Object.freeze({
            attached: this.root?.parent === this.scene,
            visible: this.root?.visible !== false,
            meshes,
            visibleMeshes,
        });
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

    updateCameraVisibility(camera) {
        updateCafeEnvironmentVisibility(this.environment, camera);
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
