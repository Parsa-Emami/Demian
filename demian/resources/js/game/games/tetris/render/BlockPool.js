import * as THREE from 'three';

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/** Fixed-capacity InstancedMesh wrapper; no allocations occur during gameplay. */
export default class BlockPool {
    constructor({ capacity, geometry, material, scene, z = 0 } = {}) {
        this.capacity = capacity;
        this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.position.z = z;
        this.matrix = new THREE.Matrix4();
        this.position = new THREE.Vector3();
        this.scale = new THREE.Vector3(1, 1, 1);
        this.quaternion = new THREE.Quaternion();
        this.color = new THREE.Color();
        this.count = 0;
        scene.add(this.mesh);
        this.clear();
    }

    begin() {
        this.count = 0;
    }

    add({ x, y, z = 0, scale = 1, color = 0xffffff } = {}) {
        if (this.count >= this.capacity) return false;
        this.position.set(x, y, z);
        this.scale.setScalar(scale);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.mesh.setMatrixAt(this.count, this.matrix);
        this.color.set(color);
        this.mesh.setColorAt(this.count, this.color);
        this.count += 1;
        return true;
    }

    commit() {
        for (let index = this.count; index < this.capacity; index += 1) {
            this.mesh.setMatrixAt(index, HIDDEN_MATRIX);
        }
        this.mesh.count = this.capacity;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    clear() {
        this.begin();
        this.commit();
    }

    dispose(scene) {
        scene.remove(this.mesh);
        this.mesh.dispose?.();
    }
}
