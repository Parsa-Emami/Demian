import * as THREE from 'three';
import SpriteAnimator from './SpriteAnimator';

export default class SpriteCharacter {
    constructor({ character, texture, atlas }) {
        this.character = character;
        this.atlas = atlas;
        this.group = new THREE.Group();
        this.group.name = `Character:${character.slug}`;

        this.velocity = new THREE.Vector3();
        this.moveDirection = new THREE.Vector3();
        this.state = 'idle';
        this.stateLock = 0;
        this.jumpVelocity = 0;
        this.grounded = true;
        this.facing = 1;
        this.presentationTime = 0;

        const settings = character.settings ?? {};
        this.walkSpeed = Number(settings.walk_speed ?? 3.2);
        this.runSpeed = Number(settings.run_speed ?? 6.2);
        this.jumpForce = Number(settings.jump_force ?? 6.5);
        this.gravity = 17;
        this.scaleFactor = Number(settings.scale ?? 1);

        this.texture = texture;
        this.texture.needsUpdate = true;

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            alphaTest: 0.08,
            depthWrite: false,
            toneMapped: false,
        });

        this.sprite = new THREE.Sprite(this.material);

        const display = atlas.display ?? {};
        this.baseWidth = Number(display.worldWidth ?? 3.4) * this.scaleFactor;
        this.baseHeight = Number(display.worldHeight ?? 3.4) * this.scaleFactor;
        this.sprite.scale.set(this.baseWidth, this.baseHeight, 1);
        this.sprite.position.y = this.baseHeight * 0.5;

        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
        });

        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.76 * this.scaleFactor, 32),
            this.shadowMaterial
        );

        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.02;

        this.ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff72dc,
            transparent: true,
            opacity: 0.82,
            depthWrite: false,
            toneMapped: false,
        });

        this.selectionRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.92 * this.scaleFactor, 0.045, 8, 48),
            this.ringMaterial
        );
        this.selectionRing.rotation.x = Math.PI / 2;
        this.selectionRing.position.y = 0.055;

        this.locatorMaterial = new THREE.MeshBasicMaterial({
            color: 0x7cf8ff,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            toneMapped: false,
        });

        this.locator = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.18 * this.scaleFactor, 0),
            this.locatorMaterial
        );
        this.locator.position.y = this.baseHeight + 0.5;
        this.locator.rotation.z = Math.PI / 4;

        this.group.add(
            this.shadow,
            this.selectionRing,
            this.sprite,
            this.locator
        );

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.animator.play('idle');
    }

    update(deltaTime, input, movementBasis) {
        this.stateLock = Math.max(0, this.stateLock - deltaTime);
        this.presentationTime += deltaTime;

        const rawDirection = new THREE.Vector3(input.x, 0, input.z);
        const hasMovement = rawDirection.lengthSq() > 0;

        if (hasMovement) {
            rawDirection.normalize();

            this.moveDirection
                .copy(movementBasis.right)
                .multiplyScalar(rawDirection.x)
                .addScaledVector(movementBasis.forward, -rawDirection.z)
                .normalize();

            const speed = input.run ? this.runSpeed : this.walkSpeed;
            const desiredVelocity = this.moveDirection.clone().multiplyScalar(speed);
            const acceleration = 1 - Math.exp(-12 * deltaTime);
            this.velocity.lerp(desiredVelocity, acceleration);

            const cameraRight = movementBasis.right;
            const horizontalDirection = this.moveDirection.dot(cameraRight);

            if (Math.abs(horizontalDirection) > 0.08) {
                this.setFacing(horizontalDirection >= 0 ? 1 : -1);
            }
        } else {
            const braking = 1 - Math.exp(-16 * deltaTime);
            this.velocity.lerp(new THREE.Vector3(), braking);
        }

        if (input.jump && this.grounded && this.stateLock <= 0) {
            this.grounded = false;
            this.jumpVelocity = this.jumpForce;
            this.playLocked('jump');
        }

        if (input.attack && this.grounded && this.stateLock <= 0) {
            this.playLocked('attack');
        }

        if (input.win && this.grounded && this.stateLock <= 0) {
            this.playLocked('win', 1.2);
        }

        this.group.position.addScaledVector(this.velocity, deltaTime);
        this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -18, 18);
        this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -18, 18);

        if (!this.grounded) {
            this.jumpVelocity -= this.gravity * deltaTime;
            this.group.position.y += this.jumpVelocity * deltaTime;

            if (this.group.position.y <= 0) {
                this.group.position.y = 0;
                this.jumpVelocity = 0;
                this.grounded = true;
                this.stateLock = 0;
            }
        }

        if (this.stateLock <= 0) {
            const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);

            if (!this.grounded) {
                this.setState('jump');
            } else if (planarSpeed > this.walkSpeed * 1.35) {
                this.setState('run');
            } else if (planarSpeed > 0.18) {
                this.setState('walk');
            } else {
                this.setState('idle');
            }
        }

        this.animator.update(deltaTime);
        this.updatePresentation();
    }

    playLocked(animationName, minimumDuration = 0) {
        this.setState(animationName, true);
        this.stateLock = Math.max(
            minimumDuration,
            this.animator.duration(animationName)
        );
    }

    setState(state, restart = false) {
        if (!restart && this.state === state) {
            return;
        }

        this.state = state;
        this.animator.play(state, { restart });
    }

    setFacing(direction) {
        this.facing = direction;
    }

    updatePresentation() {
        const time = this.presentationTime;
        const jumpHeight = Math.max(this.group.position.y, 0);
        const jumpRatio = THREE.MathUtils.clamp(jumpHeight / 3.2, 0, 1);
        const movementSpeed = this.speed();

        let widthScale = 1;
        let heightScale = 1;
        let bob = 0;
        let tilt = 0;

        if (this.state === 'idle') {
            const breath = Math.sin(time * 3.1);
            bob = breath * 0.045;
            widthScale += breath * 0.018;
            heightScale -= breath * 0.018;
            tilt = Math.sin(time * 1.7) * 0.02;
        } else if (this.state === 'walk') {
            const cycle = time * 8.2;
            bob = Math.abs(Math.sin(cycle)) * 0.08;
            tilt = Math.sin(cycle) * 0.035;
        } else if (this.state === 'run') {
            const cycle = time * 12.4;
            bob = Math.abs(Math.sin(cycle)) * 0.14;
            widthScale += Math.cos(cycle) * 0.035;
            heightScale -= Math.cos(cycle) * 0.035;
            tilt = Math.sin(cycle) * 0.065;
        }

        if (!this.grounded) {
            const verticalRatio = THREE.MathUtils.clamp(
                this.jumpVelocity / this.jumpForce,
                -1,
                1
            );
            widthScale += verticalRatio > 0 ? -0.05 : 0.06;
            heightScale += verticalRatio > 0 ? 0.07 : -0.05;
        }

        this.sprite.scale.set(
            this.baseWidth * widthScale * this.facing,
            this.baseHeight * heightScale,
            1
        );
        this.sprite.position.y = this.baseHeight * 0.5 + bob;
        this.sprite.rotation.z = tilt;

        this.shadow.scale.setScalar(1 - jumpRatio * 0.35);
        this.shadowMaterial.opacity = 0.34 - jumpRatio * 0.2;

        const locatorPulse = 1 + Math.sin(time * 4.4) * 0.16;
        this.locator.scale.setScalar(locatorPulse);
        this.locator.position.y =
            this.baseHeight + 0.5 + Math.sin(time * 3.2) * 0.08;
        this.locator.rotation.y += 0.025;
        this.locatorMaterial.opacity = 0.72 + Math.sin(time * 4.4) * 0.2;

        const ringPulse = 1 + Math.sin(time * 3.4) * 0.08;
        this.selectionRing.scale.setScalar(ringPulse);
        this.ringMaterial.opacity =
            0.58 + Math.sin(time * 3.4) * 0.18 +
            THREE.MathUtils.clamp(movementSpeed / this.runSpeed, 0, 1) * 0.08;
    }

    focusPoint() {
        return new THREE.Vector3(
            this.group.position.x,
            this.group.position.y + this.baseHeight * 0.52,
            this.group.position.z
        );
    }

    visualHeight() {
        return this.baseHeight;
    }

    speed() {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }

    dispose() {
        this.texture.dispose();
        this.material.dispose();
        this.shadow.geometry.dispose();
        this.shadowMaterial.dispose();
        this.selectionRing.geometry.dispose();
        this.ringMaterial.dispose();
        this.locator.geometry.dispose();
        this.locatorMaterial.dispose();
    }
}
