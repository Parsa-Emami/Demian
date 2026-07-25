import * as THREE from 'three';

const FOLLOW_SPAN = 10.5;
const OVERVIEW_SPAN = 21.5;

export default class CameraController {
    constructor(camera, domElement) {
        if (!(camera instanceof THREE.OrthographicCamera)) {
            throw new Error('The 2D arcade camera must be orthographic.');
        }

        this.camera = camera;
        this.domElement = domElement;
        this.mode = 'OVERVIEW';
        this.aspect = 1;
        this.currentSpan = OVERVIEW_SPAN;
        this.targetSpan = OVERVIEW_SPAN;
        this.followPoint = new THREE.Vector3(0, 1.55, 0);
        this.currentTarget = this.followPoint.clone();
        this.overviewTarget = new THREE.Vector3(0, 1.35, 0);
        this.cameraOffset = new THREE.Vector3(0, 13.5, 16.5);
        this.lookTarget = new THREE.Vector3();

        this.onWheel = this.onWheel.bind(this);
        this.domElement.addEventListener('wheel', this.onWheel, {
            passive: false,
        });

        this.applyPose(this.overviewTarget);
        this.updateProjection();
    }

    update(focusPoint, deltaTime = 1 / 60) {
        this.followPoint.copy(focusPoint);

        const desiredTarget =
            this.mode === 'FOLLOW' ? this.followPoint : this.overviewTarget;
        const targetAlpha = 1 - Math.exp(-7.5 * deltaTime);
        const zoomAlpha = 1 - Math.exp(-6.5 * deltaTime);

        this.currentTarget.lerp(desiredTarget, targetAlpha);
        this.currentSpan = THREE.MathUtils.lerp(
            this.currentSpan,
            this.targetSpan,
            zoomAlpha
        );

        this.applyPose(this.currentTarget);
        this.updateProjection();
    }

    applyPose(target) {
        this.camera.position.copy(target).add(this.cameraOffset);
        this.lookTarget.copy(target);
        this.lookTarget.y -= 0.1;
        this.camera.lookAt(this.lookTarget);
        this.camera.updateMatrixWorld();
    }

    movementBasis() {
        return {
            right: new THREE.Vector3(1, 0, 0),
            forward: new THREE.Vector3(0, 0, -1),
        };
    }

    setMode(mode, focusPoint = this.followPoint) {
        this.mode = mode === 'FOLLOW' ? 'FOLLOW' : 'OVERVIEW';

        if (this.mode === 'FOLLOW') {
            this.followPoint.copy(focusPoint);
            this.targetSpan = FOLLOW_SPAN;
        } else {
            this.targetSpan = OVERVIEW_SPAN;
        }

        return this.mode;
    }

    toggle(focusPoint) {
        return this.setMode(
            this.mode === 'FOLLOW' ? 'OVERVIEW' : 'FOLLOW',
            focusPoint
        );
    }

    focus(focusPoint, { close = true, follow = true } = {}) {
        this.followPoint.copy(focusPoint);

        if (follow) {
            this.mode = 'FOLLOW';
            this.targetSpan = FOLLOW_SPAN;
        }

        if (close) {
            this.currentTarget.copy(focusPoint);
            this.currentSpan = FOLLOW_SPAN;
            this.applyPose(this.currentTarget);
            this.updateProjection();
        }

        return this.mode;
    }

    overview({ immediate = false } = {}) {
        this.mode = 'OVERVIEW';
        this.targetSpan = OVERVIEW_SPAN;

        if (immediate) {
            this.currentTarget.copy(this.overviewTarget);
            this.currentSpan = OVERVIEW_SPAN;
            this.applyPose(this.currentTarget);
            this.updateProjection();
        }

        return this.mode;
    }

    resize(width, height) {
        this.aspect = Math.max(width, 1) / Math.max(height, 1);
        this.updateProjection();
    }

    updateProjection() {
        const halfHeight = this.currentSpan * 0.5;
        const halfWidth = halfHeight * this.aspect;

        this.camera.left = -halfWidth;
        this.camera.right = halfWidth;
        this.camera.top = halfHeight;
        this.camera.bottom = -halfHeight;
        this.camera.near = 0.1;
        this.camera.far = 120;
        this.camera.updateProjectionMatrix();
    }

    onWheel(event) {
        event.preventDefault();

        const direction = Math.sign(event.deltaY);
        const base = this.mode === 'FOLLOW' ? FOLLOW_SPAN : OVERVIEW_SPAN;
        const minimum = this.mode === 'FOLLOW' ? 8.4 : 16.5;
        const maximum = this.mode === 'FOLLOW' ? 14 : 25;

        this.targetSpan = THREE.MathUtils.clamp(
            this.targetSpan + direction * base * 0.07,
            minimum,
            maximum
        );
    }

    dispose() {
        this.domElement.removeEventListener('wheel', this.onWheel);
    }
}
