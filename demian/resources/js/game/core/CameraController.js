import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.mode = 'FOLLOW';

        // A portrait-friendly offset. The controls target is always the
        // character's visual centre, so TIAM remains in the viewport centre.
        this.defaultOffset = new THREE.Vector3(5.6, 3.7, 7.4);
        this.defaultTarget = new THREE.Vector3(0, 1.7, 0);
        this.followPoint = this.defaultTarget.clone();
        this.targetDelta = new THREE.Vector3();

        this.controls = new OrbitControls(camera, domElement);
        this.controls.enabled = true;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.075;
        this.controls.enablePan = false;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 3.6;
        this.controls.maxDistance = 18;
        this.controls.minPolarAngle = 0.28;
        this.controls.maxPolarAngle = Math.PI / 2.05;
        this.controls.rotateSpeed = 0.72;
        this.controls.zoomSpeed = 0.9;

        // zoomToCursor can move OrbitControls.target away from the character.
        // It is enabled only in FREE mode.
        this.controls.zoomToCursor = false;

        this.reset(this.defaultTarget);
    }

    update(focusPoint) {
        this.followPoint.copy(focusPoint);

        if (this.mode === 'FOLLOW') {
            this.lockTargetTo(this.followPoint);
        }

        this.controls.update();
    }

    lockTargetTo(focusPoint) {
        // Translate camera and target by exactly the same delta. This preserves
        // the user's orbit/zoom while guaranteeing that focusPoint is centred.
        this.targetDelta
            .copy(focusPoint)
            .sub(this.controls.target);

        this.camera.position.add(this.targetDelta);
        this.controls.target.copy(focusPoint);
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

    setMode(mode, focusPoint = this.followPoint) {
        this.mode = mode === 'FREE' ? 'FREE' : 'FOLLOW';
        this.controls.enablePan = this.mode === 'FREE';
        this.controls.zoomToCursor = this.mode === 'FREE';

        if (this.mode === 'FOLLOW') {
            this.lockTargetTo(focusPoint);
        }

        this.controls.update();
        return this.mode;
    }

    toggle(focusPoint) {
        const nextMode = this.mode === 'FOLLOW' ? 'FREE' : 'FOLLOW';
        return this.setMode(nextMode, focusPoint);
    }

    reset(focusPoint = this.defaultTarget) {
        this.followPoint.copy(focusPoint);
        this.controls.target.copy(focusPoint);
        this.camera.position
            .copy(focusPoint)
            .add(this.defaultOffset);

        this.camera.near = 0.1;
        this.camera.far = 200;
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    focus(focusPoint, { close = true, follow = true } = {}) {
        if (follow) {
            this.mode = 'FOLLOW';
            this.controls.enablePan = false;
            this.controls.zoomToCursor = false;
        }

        this.followPoint.copy(focusPoint);

        if (close) {
            this.controls.target.copy(focusPoint);
            this.camera.position
                .copy(focusPoint)
                .add(this.defaultOffset);
        } else {
            this.lockTargetTo(focusPoint);
        }

        this.controls.update();
        return this.mode;
    }

    dispose() {
        this.controls.dispose();
    }
}
