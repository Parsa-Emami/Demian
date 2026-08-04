import * as THREE from 'three';

const THEME_COLORS = Object.freeze({
    cafe: 0xc9a66b,
    arcade: 0xc9a66b,
    park: 0xc9a66b,
    market: 0xc9a66b,
    industrial: 0xc9a66b,
    residential: 0xc9a66b,
    skyline: 0xc9a66b,
});

export default class EnvironmentSystem {
    constructor({ scene, performanceProfile = null } = {}) {
        this.scene = scene;
        this.performanceProfile = performanceProfile;
        this.time = 0;
        this.geometries = new Map();
        this.materials = new Map();
        this.ambient = new THREE.AmbientLight(0xf2ece2, 1.22);
        this.keyLight = new THREE.DirectionalLight(0xfff1d4, 1.05);
        this.keyLight.position.set(22, 36, 18);
        this.fillLight = new THREE.PointLight(0xffcb88, 2.1, 28, 2);
        this.fillLight.position.set(12, 3.4, 6);
        this.loungeLight = new THREE.PointLight(0xffd5a0, 1.7, 20, 2);
        this.loungeLight.position.set(-15, 2.6, -8);
        this.scene.add(this.ambient, this.keyLight, this.fillLight, this.loungeLight);
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
        return THEME_COLORS[theme] ?? 0xc9a66b;
    }

    update(deltaTime, playerPosition = null) {
        this.time += Math.max(0, Number(deltaTime) || 0);
        const wave = (Math.sin(this.time * 0.7) + 1) / 2;
        this.ambient.intensity = 1.16 + wave * 0.08;
        this.keyLight.intensity = 0.98 + (1 - wave) * 0.09;
        this.fillLight.intensity = 1.9 + wave * 0.28;
        this.loungeLight.intensity = 1.55 + (1 - wave) * 0.22;
        if (playerPosition) {
            this.keyLight.position.x = playerPosition.x + 18;
            this.keyLight.position.z = playerPosition.z + 14;
        }
    }

    dispose() {
        this.scene?.remove(this.ambient, this.keyLight, this.fillLight, this.loungeLight);
        this.geometries.forEach((geometry) => geometry.dispose());
        this.materials.forEach((material) => material.dispose());
        this.geometries.clear();
        this.materials.clear();
        this.scene = null;
    }
}
