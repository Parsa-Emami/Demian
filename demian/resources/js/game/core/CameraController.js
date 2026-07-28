import * as THREE from 'three';
import { WORLD_CONFIG } from '../world/WorldConfig';

const DESKTOP_FOLLOW_SPAN = WORLD_CONFIG.camera.desktopFollowSpan;
const DESKTOP_OVERVIEW_SPAN = WORLD_CONFIG.camera.desktopOverviewSpan;

export default class CameraController {
    constructor(camera, domElement) {
        if (!(camera instanceof THREE.OrthographicCamera)) {
            throw new Error('The 2D arcade camera must be orthographic.');
        }

        this.camera = camera;
        this.domElement = domElement;
        this.mode = 'OVERVIEW';
        this.aspect = 1;
        this.currentSpan = DESKTOP_OVERVIEW_SPAN;
        this.targetSpan = DESKTOP_OVERVIEW_SPAN;
        this.followPoint = new THREE.Vector3(0, 1.55, 0);
        this.currentTarget = this.followPoint.clone();
        this.overviewTarget = new THREE.Vector3(0, 1.35, 0);
        this.cameraOffset = new THREE.Vector3(0, 13.5, 16.5);
        this.lookTarget = new THREE.Vector3();
        this.activePointers = new Map();
        this.pinchDistance = 0;
        this.pinchStartSpan = 0;

        this.onWheel = this.onWheel.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
        this.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.domElement.addEventListener('pointermove', this.onPointerMove);
        this.domElement.addEventListener('pointerup', this.onPointerUp);
        this.domElement.addEventListener('pointercancel', this.onPointerUp);

        this.applyPose(this.overviewTarget);
        this.updateProjection();
    }

    followSpan() {
        return this.aspect < 0.72 ? WORLD_CONFIG.camera.mobileFollowSpan : DESKTOP_FOLLOW_SPAN;
    }

    overviewSpan() {
        return this.aspect < 0.72 ? WORLD_CONFIG.camera.mobileOverviewSpan : DESKTOP_OVERVIEW_SPAN;
    }

    update(focusPoint, deltaTime = 1 / 60) {
        this.followPoint.copy(focusPoint);
        const desiredTarget = this.mode === 'FOLLOW' ? this.followPoint : this.overviewTarget;
        const targetAlpha = 1 - Math.exp(-7.5 * deltaTime);
        const zoomAlpha = 1 - Math.exp(-6.5 * deltaTime);

        this.currentTarget.lerp(desiredTarget, targetAlpha);
        this.currentSpan = THREE.MathUtils.lerp(this.currentSpan, this.targetSpan, zoomAlpha);
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
            this.targetSpan = this.followSpan();
        } else {
            this.overviewTarget.copy(focusPoint);
            this.targetSpan = this.overviewSpan();
        }

        return this.mode;
    }

    toggle(focusPoint) {
        return this.setMode(this.mode === 'FOLLOW' ? 'OVERVIEW' : 'FOLLOW', focusPoint);
    }

    focus(focusPoint, { close = true, follow = true } = {}) {
        this.followPoint.copy(focusPoint);

        if (follow) {
            this.mode = 'FOLLOW';
            this.targetSpan = this.followSpan();
        }

        if (close) {
            this.currentTarget.copy(focusPoint);
            this.currentSpan = this.followSpan();
            this.applyPose(this.currentTarget);
            this.updateProjection();
        }

        return this.mode;
    }

    overview({ immediate = false } = {}) {
        this.mode = 'OVERVIEW';
        this.targetSpan = this.overviewSpan();

        if (immediate) {
            this.currentTarget.copy(this.overviewTarget);
            this.currentSpan = this.overviewSpan();
            this.applyPose(this.currentTarget);
            this.updateProjection();
        }

        return this.mode;
    }

    resize(width, height) {
        const previousAspect = this.aspect;
        this.aspect = Math.max(width, 1) / Math.max(height, 1);

        if ((previousAspect < 0.72) !== (this.aspect < 0.72)) {
            this.targetSpan = this.mode === 'FOLLOW' ? this.followSpan() : this.overviewSpan();
        }
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
        this.camera.far = 180;
        this.camera.updateProjectionMatrix();
    }

    zoomBy(delta) {
        const base = this.mode === 'FOLLOW' ? this.followSpan() : this.overviewSpan();
        const minimum = this.mode === 'FOLLOW' ? base * 0.78 : base * 0.76;
        const maximum = this.mode === 'FOLLOW' ? base * 1.36 : base * 1.2;
        this.targetSpan = THREE.MathUtils.clamp(this.targetSpan + delta, minimum, maximum);
    }

    onWheel(event) {
        event.preventDefault();
        const direction = Math.sign(event.deltaY);
        const base = this.mode === 'FOLLOW' ? this.followSpan() : this.overviewSpan();
        this.zoomBy(direction * base * 0.07);
    }

    onPointerDown(event) {
        if (event.pointerType !== 'touch') {
            return;
        }

        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.domElement.setPointerCapture?.(event.pointerId);

        if (this.activePointers.size === 2) {
            const [first, second] = [...this.activePointers.values()];
            this.pinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
            this.pinchStartSpan = this.targetSpan;
        }
    }

    onPointerMove(event) {
        if (!this.activePointers.has(event.pointerId)) {
            return;
        }

        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activePointers.size !== 2 || this.pinchDistance <= 0) {
            return;
        }

        event.preventDefault();
        const [first, second] = [...this.activePointers.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const ratio = THREE.MathUtils.clamp(this.pinchDistance / Math.max(distance, 1), 0.65, 1.5);
        this.targetSpan = this.pinchStartSpan * ratio;
        this.zoomBy(0);
    }

    onPointerUp(event) {
        this.activePointers.delete(event.pointerId);
        if (this.activePointers.size < 2) {
            this.pinchDistance = 0;
        }
    }

    dispose() {
        this.domElement.removeEventListener('wheel', this.onWheel);
        this.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.domElement.removeEventListener('pointermove', this.onPointerMove);
        this.domElement.removeEventListener('pointerup', this.onPointerUp);
        this.domElement.removeEventListener('pointercancel', this.onPointerUp);
        this.activePointers.clear();
    }
}
