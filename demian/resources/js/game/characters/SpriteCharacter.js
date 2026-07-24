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
            opacity: 0.32,
            depthWrite: false,
        });

        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.72 * this.scaleFactor, 32),
            this.shadowMaterial
        );

        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.02;

        this.group.add(this.shadow, this.sprite);

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.animator.play('idle');
    }

    update(deltaTime, input, movementBasis) {
        this.stateLock = Math.max(0, this.stateLock - deltaTime);

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
        this.sprite.scale.x = this.baseWidth * direction;
    }

    updatePresentation() {
        const jumpHeight = Math.max(this.group.position.y, 0);
        const jumpRatio = THREE.MathUtils.clamp(jumpHeight / 3.2, 0, 1);

        this.shadow.scale.setScalar(1 - jumpRatio * 0.35);
        this.shadowMaterial.opacity = 0.32 - jumpRatio * 0.18;

        if (this.state === 'idle') {
            this.sprite.rotation.z = Math.sin(performance.now() * 0.0025) * 0.012;
        } else {
            this.sprite.rotation.z = 0;
        }
    }

    speed() {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }

    dispose() {
        this.texture.dispose();
        this.material.dispose();
        this.shadow.geometry.dispose();
        this.shadowMaterial.dispose();
    }
}
