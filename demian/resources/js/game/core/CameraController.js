import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.mode = 'FOLLOW';
        this.followHeight = 1.75;
        this.defaultOffset = new THREE.Vector3(8, 6.5, 10);
        this.target = new THREE.Vector3();

        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 4.5;
        this.controls.maxDistance = 28;
        this.controls.minPolarAngle = 0.28;
        this.controls.maxPolarAngle = Math.PI / 2.05;
        this.controls.rotateSpeed = 0.75;
        this.controls.zoomSpeed = 0.9;

        this.reset(new THREE.Vector3());
    }

    update(characterPosition, deltaTime) {
        if (this.mode === 'FOLLOW') {
            this.target.set(
                characterPosition.x,
                characterPosition.y + this.followHeight,
                characterPosition.z
            );

            const currentOffset = this.camera.position
                .clone()
                .sub(this.controls.target);

            const nextCameraPosition = this.target.clone().add(currentOffset);
            const alpha = 1 - Math.exp(-5 * deltaTime);

            this.controls.target.lerp(this.target, alpha);
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

    toggle(characterPosition) {
        this.mode = this.mode === 'FOLLOW' ? 'FREE' : 'FOLLOW';
        this.controls.enablePan = this.mode === 'FREE';

        if (this.mode === 'FOLLOW') {
            this.reset(characterPosition);
        }

        return this.mode;
    }

    reset(characterPosition) {
        const target = new THREE.Vector3(
            characterPosition.x,
            characterPosition.y + this.followHeight,
            characterPosition.z
        );

        this.controls.target.copy(target);
        this.camera.position.copy(target).add(this.defaultOffset);
        this.controls.update();
    }

    dispose() {
        this.controls.dispose();
    }
}
