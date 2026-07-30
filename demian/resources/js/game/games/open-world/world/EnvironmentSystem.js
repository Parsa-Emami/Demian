import * as THREE from 'three';

const THEME_COLORS = Object.freeze({
    cafe: 0x3d1238,
    arcade: 0x44340a,
    park: 0x08394a,
    market: 0x40231d,
    industrial: 0x12382e,
    residential: 0x2b1747,
    skyline: 0x122b4a,
});

export default class EnvironmentSystem {
    constructor({ scene, performanceProfile = null } = {}) {
        this.scene = scene;
        this.performanceProfile = performanceProfile;
        this.time = 0;
        this.geometries = new Map();
        this.materials = new Map();
        this.ambient = new THREE.AmbientLight(0x8294ff, 1.05);
        this.keyLight = new THREE.DirectionalLight(0xffb7ef, 1.35);
        this.keyLight.position.set(24, 42, 18);
        this.scene.add(this.ambient, this.keyLight);
    }

    geometry(key, factory) {
        if (!this.geometries.has(key)) this.geometries.set(key, factory());
        return this.geometries.get(key);
    }

    material(key, options) {
        if (!this.materials.has(key)) {
            this.materials.set(key, new THREE.MeshBasicMaterial({ toneMapped: false, ...options }));
        }
        return this.materials.get(key);
    }

    themeColor(theme) {
        return THEME_COLORS[theme] ?? 0x18213c;
    }

    update(deltaTime, playerPosition = null) {
        this.time += Math.max(0, Number(deltaTime) || 0);
        const wave = (Math.sin(this.time * 0.08) + 1) / 2;
        this.ambient.intensity = 0.9 + wave * 0.24;
        this.keyLight.intensity = 1.1 + (1 - wave) * 0.35;
        if (playerPosition) {
            this.keyLight.position.x = playerPosition.x + 24;
            this.keyLight.position.z = playerPosition.z + 18;
        }
    }

    dispose() {
        this.scene?.remove(this.ambient, this.keyLight);
        this.geometries.forEach((geometry) => geometry.dispose());
        this.materials.forEach((material) => material.dispose());
        this.geometries.clear();
        this.materials.clear();
        this.scene = null;
    }
}
