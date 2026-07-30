import * as THREE from 'three';
import { TETRIS_CONFIG } from '../config/TetrisConfig.js';

export default class TetrisEffects {
    constructor(scene, { width, visibleRows, hiddenRows } = {}) {
        this.width = width;
        this.visibleRows = visibleRows;
        this.hiddenRows = hiddenRows;
        this.duration = TETRIS_CONFIG.timing.lineClearEffectSeconds;
        this.elapsed = 0;
        this.activeCount = 0;
        this.geometry = new THREE.PlaneGeometry(width, 0.9);
        this.meshes = Array.from({ length: 4 }, () => {
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(this.geometry, material);
            mesh.position.z = 0.42;
            mesh.visible = false;
            scene.add(mesh);
            return mesh;
        });
        this.scene = scene;
    }

    flashRows(rows) {
        const visibleRows = rows.filter((row) => row >= this.hiddenRows).slice(0, 4);
        this.elapsed = 0;
        this.activeCount = visibleRows.length;
        this.meshes.forEach((mesh, index) => {
            const row = visibleRows[index];
            mesh.visible = row !== undefined;
            mesh.material.opacity = 0;
            if (row !== undefined) {
                mesh.position.y = (this.visibleRows / 2) - (row - this.hiddenRows) - 0.5;
            }
        });
    }

    update(deltaTime) {
        if (this.activeCount === 0) return;
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);
        const opacity = Math.sin(progress * Math.PI) * 0.82;
        for (let index = 0; index < this.activeCount; index += 1) {
            this.meshes[index].material.opacity = opacity;
        }

        if (progress >= 1) {
            this.meshes.forEach((mesh) => { mesh.visible = false; });
            this.activeCount = 0;
        }
    }

    dispose() {
        this.meshes.forEach((mesh) => {
            this.scene.remove(mesh);
            mesh.material.dispose();
        });
        this.geometry.dispose();
        this.meshes = [];
        this.activeCount = 0;
    }
}
