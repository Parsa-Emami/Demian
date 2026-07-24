import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.mode = 'FOLLOW';
        this.defaultOffset = new THREE.Vector3(5.8, 4.4, 7.8);
        this.target = new THREE.Vector3(0, 1.65, 0);
        this.followPoint = this.target.clone();

        this.controls = new OrbitControls(camera, domElement);
        this.controls.enabled = true;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.075;
        this.controls.enablePan = false;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 3.2;
        this.controls.maxDistance = 22;
        this.controls.minPolarAngle = 0.24;
        this.controls.maxPolarAngle = Math.PI / 2.04;
        this.controls.rotateSpeed = 0.72;
        this.controls.zoomSpeed = 0.95;
        this.controls.zoomToCursor = true;

        this.reset(this.target);
    }

    update(focusPoint, deltaTime) {
        this.followPoint.copy(focusPoint);

        if (this.mode === 'FOLLOW') {
            const currentOffset = this.camera.position
                .clone()
                .sub(this.controls.target);

            const nextCameraPosition = this.followPoint
                .clone()
                .add(currentOffset);

            const alpha = 1 - Math.exp(-5.5 * deltaTime);

            this.controls.target.lerp(this.followPoint, alpha);
            this.camera.position.lerp(nextCameraPosition, alpha);
        }

        this.controls.update();
    }

    movementBasis() {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;

        if (forward.lengthSq() < 0.001) {
            forward.set(0, 0, -1);
        }

        forward.normalize();

        const right = new THREE.Vector3()
            .crossVectors(forward, this.camera.up)
            .normalize();

        return { forward, right };
    }

    toggle(focusPoint) {
        this.mode = this.mode === 'FOLLOW' ? 'FREE' : 'FOLLOW';
        this.controls.enablePan = this.mode === 'FREE';

        if (this.mode === 'FOLLOW') {
            this.reset(focusPoint);
        }

        this.controls.update();
        return this.mode;
    }

    reset(focusPoint = new THREE.Vector3(0, 1.65, 0)) {
        this.target.copy(focusPoint);
        this.followPoint.copy(focusPoint);
        this.controls.target.copy(focusPoint);
        this.camera.position.copy(focusPoint).add(this.defaultOffset);
        this.camera.near = 0.1;
        this.camera.far = 200;
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    focus(focusPoint, { close = true } = {}) {
        const offset = close
            ? this.defaultOffset.clone()
            : this.camera.position.clone().sub(this.controls.target);

        if (offset.lengthSq() < 1) {
            offset.copy(this.defaultOffset);
        }

        this.target.copy(focusPoint);
        this.followPoint.copy(focusPoint);
        this.controls.target.copy(focusPoint);
        this.camera.position.copy(focusPoint).add(offset);
        this.controls.update();
    }

    dispose() {
        this.controls.dispose();
    }
}
