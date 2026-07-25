import * as THREE from 'three';
import SpriteAnimator from './SpriteAnimator';
import CharacterEffects from './CharacterEffects';

export default class SpriteCharacter {
    constructor({ scene, character, texture, atlas }) {
        this.scene = scene;
        this.character = character;
        this.atlas = atlas;
        this.group = new THREE.Group();
        this.group.name = `Character:${character.slug}`;
        this.bodyRoot = new THREE.Group();
        this.bodyRoot.name = `CharacterBody:${character.slug}`;

        this.velocity = new THREE.Vector3();
        this.moveDirection = new THREE.Vector3();
        this.zeroVelocity = new THREE.Vector3();
        this.state = 'idle';
        this.previousState = null;
        this.stateLock = 0;
        this.stateTime = 0;
        this.jumpVelocity = 0;
        this.grounded = true;
        this.wasGrounded = true;
        this.facing = 1;
        this.presentationTime = 0;
        this.introClock = 0;
        this.introStep = 0;
        this.introActive = true;

        const settings = character.settings ?? {};
        this.walkSpeed = Number(settings.walk_speed ?? 3.2);
        this.runSpeed = Number(settings.run_speed ?? 6.2);
        this.jumpForce = Number(settings.jump_force ?? 6.5);
        this.gravity = 17;
        this.scaleFactor = Number(settings.scale ?? 1);
        this.bounds = {
            x: 13.2,
            z: 8.1,
        };

        this.texture = texture;
        this.texture.needsUpdate = true;

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            alphaTest: 0.035,
            depthWrite: false,
            toneMapped: false,
        });

        this.sprite = new THREE.Sprite(this.material);
        const display = atlas.display ?? {};
        this.baseWidth = Number(display.worldWidth ?? 3.7) * this.scaleFactor;
        this.baseHeight = Number(display.worldHeight ?? 3.7) * this.scaleFactor;
        const pivot = atlas.pivot ?? { x: 0.5, y: 0.96 };

        this.sprite.center.set(
            Number(pivot.x ?? 0.5),
            THREE.MathUtils.clamp(1 - Number(pivot.y ?? 0.96), 0, 1)
        );
        this.sprite.scale.set(this.baseWidth, this.baseHeight, 1);
        this.sprite.position.y = 0.02;
        this.sprite.renderOrder = 20;

        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
        });
        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.82 * this.scaleFactor, 32),
            this.shadowMaterial
        );
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.045;
        this.shadow.scale.set(1.4, 0.62, 1);
        this.shadow.renderOrder = 2;

        this.ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff66d9,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            toneMapped: false,
        });
        this.selectionRing = new THREE.Mesh(
            new THREE.RingGeometry(
                0.9 * this.scaleFactor,
                1.08 * this.scaleFactor,
                48
            ),
            this.ringMaterial
        );
        this.selectionRing.rotation.x = -Math.PI / 2;
        this.selectionRing.position.y = 0.055;
        this.selectionRing.renderOrder = 3;

        this.locatorMaterial = new THREE.SpriteMaterial({
            map: this.createLocatorTexture(),
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        this.locator = new THREE.Sprite(this.locatorMaterial);
        this.locator.scale.setScalar(0.46 * this.scaleFactor);
        this.locator.position.y = this.baseHeight + 0.42;
        this.locator.renderOrder = 25;

        this.bodyRoot.add(this.sprite, this.locator);
        this.group.add(this.shadow, this.selectionRing, this.bodyRoot);

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.effects = new CharacterEffects(scene, this);
        this.animator.play('idle');
        this.applySpawnPose(0);
    }

    createLocatorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.fillStyle = '#7cf8ff';
        context.fillRect(27, 6, 10, 42);
        context.fillRect(18, 26, 28, 12);
        context.fillStyle = '#ffffff';
        context.fillRect(29, 10, 6, 34);
        context.fillRect(22, 29, 20, 6);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
    }

    update(deltaTime, input) {
        this.stateLock = Math.max(0, this.stateLock - deltaTime);
        this.stateTime += deltaTime;
        this.presentationTime += deltaTime;
        this.wasGrounded = this.grounded;

        const hasMovement = input.x !== 0 || input.z !== 0;
        const hasAction = input.jump || input.attack || input.win;

        if (hasMovement || hasAction) {
            this.introActive = false;
        }

        if (this.introActive) {
            this.updateIntro(deltaTime);
        }

        if (input.jump && this.grounded && this.stateLock <= 0) {
            this.performJump();
        }

        if (input.attack && this.grounded && this.stateLock <= 0) {
            this.playLocked('attack', 0.54);
        }

        if (input.win && this.grounded && this.stateLock <= 0) {
            this.velocity.multiplyScalar(0.15);
            this.playLocked('win', 1.35);
        }

        const actionBlocksMovement =
            this.stateLock > 0 && (this.state === 'attack' || this.state === 'win');

        if (hasMovement && !actionBlocksMovement) {
            this.moveDirection.set(input.x, 0, input.z).normalize();
            const speed = input.run ? this.runSpeed : this.walkSpeed;
            const desiredVelocity = this.moveDirection
                .clone()
                .multiplyScalar(speed);
            const acceleration = 1 - Math.exp(-13 * deltaTime);
            this.velocity.lerp(desiredVelocity, acceleration);

            // Direction changes happen only from an explicit horizontal input.
            // Vertical movement never flips TIAM and locked actions keep their pose.
            if (input.x !== 0 && this.stateLock <= 0) {
                this.setFacing(input.x > 0 ? 1 : -1);
            }
        } else {
            const brakingRate = actionBlocksMovement ? 24 : 16;
            const braking = 1 - Math.exp(-brakingRate * deltaTime);
            this.velocity.lerp(this.zeroVelocity, braking);
        }

        this.group.position.addScaledVector(this.velocity, deltaTime);
        this.group.position.x = THREE.MathUtils.clamp(
            this.group.position.x,
            -this.bounds.x,
            this.bounds.x
        );
        this.group.position.z = THREE.MathUtils.clamp(
            this.group.position.z,
            -this.bounds.z,
            this.bounds.z
        );

        if (!this.grounded) {
            this.jumpVelocity -= this.gravity * deltaTime;
            this.bodyRoot.position.y += this.jumpVelocity * deltaTime;

            if (this.bodyRoot.position.y <= 0) {
                this.bodyRoot.position.y = 0;
                this.jumpVelocity = 0;
                this.grounded = true;
                this.stateLock = 0;
                this.effects.landing();
            }
        }

        if (this.stateLock <= 0) {
            const planarSpeed = this.speed();

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
        this.effects.update(deltaTime, this.speed());
        this.updatePresentation();
    }

    updateIntro(deltaTime) {
        this.introClock += deltaTime;

        if (this.introStep === 0 && this.introClock >= 0.45) {
            this.playLocked('win', 1.05);
            this.introStep = 1;
            return;
        }

        if (
            this.introStep === 1 &&
            this.introClock >= 1.65 &&
            this.stateLock <= 0
        ) {
            this.playLocked('attack', 0.54);
            this.introStep = 2;
            return;
        }

        if (
            this.introStep === 2 &&
            this.introClock >= 2.45 &&
            this.grounded &&
            this.stateLock <= 0
        ) {
            this.performJump();
            this.introStep = 3;
            return;
        }

        if (this.introStep === 3 && this.introClock >= 3.65) {
            this.introActive = false;
        }
    }

    performJump() {
        this.grounded = false;
        this.jumpVelocity = this.jumpForce;
        this.stateLock = 0.12;
        this.setState('jump', true);
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

        this.previousState = this.state;
        this.state = state;
        this.stateTime = 0;
        this.animator.play(state, { restart });
        this.effects.onStateChanged(state, this.facing);
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;

        if (this.facing === nextFacing) {
            return;
        }

        this.facing = nextFacing;
    }

    applySpawnPose(progress) {
        const clamped = THREE.MathUtils.clamp(progress, 0, 1);
        const back = 1.70158;
        const overshoot =
            clamped === 1
                ? 1
                : 1 + (back + 1) * Math.pow(clamped - 1, 3) +
                  back * Math.pow(clamped - 1, 2);
        this.bodyRoot.scale.setScalar(Math.max(0.001, overshoot));
    }

    updatePresentation() {
        const time = this.presentationTime;
        const stateTime = this.stateTime;
        const jumpHeight = Math.max(this.bodyRoot.position.y, 0);
        const jumpRatio = THREE.MathUtils.clamp(jumpHeight / 3.2, 0, 1);
        const movementSpeed = this.speed();
        const spawnProgress = THREE.MathUtils.clamp(time / 0.62, 0, 1);

        let widthScale = 1;
        let heightScale = 1;
        let bob = 0;
        let tilt = 0;
        let offsetX = 0;

        if (this.state === 'idle') {
            const breath = Math.sin(time * 3.1);
            bob = breath * 0.045;
            widthScale += breath * 0.018;
            heightScale -= breath * 0.018;
            tilt = Math.sin(time * 1.7) * 0.018;
        } else if (this.state === 'walk') {
            const cycle = stateTime * 9.2;
            bob = Math.abs(Math.sin(cycle)) * 0.11;
            widthScale += Math.cos(cycle * 2) * 0.022;
            heightScale -= Math.cos(cycle * 2) * 0.022;
            tilt = Math.sin(cycle) * 0.045 * this.facing;
        } else if (this.state === 'run') {
            const cycle = stateTime * 13.6;
            bob = Math.abs(Math.sin(cycle)) * 0.17;
            widthScale += Math.cos(cycle * 2) * 0.04;
            heightScale -= Math.cos(cycle * 2) * 0.04;
            tilt = -0.075 * this.facing + Math.sin(cycle) * 0.025;
        } else if (this.state === 'attack') {
            const progress = THREE.MathUtils.clamp(stateTime / 0.54, 0, 1);
            const punch = Math.sin(progress * Math.PI);
            offsetX = punch * 0.34 * this.facing;
            tilt = -punch * 0.1 * this.facing;
            widthScale += punch * 0.08;
            heightScale -= punch * 0.05;
            bob = punch * 0.08;
        } else if (this.state === 'win') {
            const cycle = stateTime * 8.4;
            bob = Math.abs(Math.sin(cycle)) * 0.19;
            tilt = Math.sin(cycle * 0.5) * 0.07;
            widthScale += Math.cos(cycle) * 0.035;
            heightScale -= Math.cos(cycle) * 0.035;
        }

        if (!this.grounded) {
            const verticalRatio = THREE.MathUtils.clamp(
                this.jumpVelocity / this.jumpForce,
                -1,
                1
            );
            widthScale += verticalRatio > 0 ? -0.06 : 0.07;
            heightScale += verticalRatio > 0 ? 0.09 : -0.06;
            tilt += -this.velocity.x * 0.012;
        }

        this.sprite.scale.set(
            this.baseWidth * widthScale * this.facing,
            this.baseHeight * heightScale,
            1
        );
        this.sprite.position.x = offsetX;
        this.sprite.position.y = 0.02 + bob;
        this.sprite.material.rotation = tilt;

        this.applySpawnPose(spawnProgress);

        this.shadow.scale.set(
            1.4 * (1 - jumpRatio * 0.38),
            0.62 * (1 - jumpRatio * 0.22),
            1
        );
        this.shadowMaterial.opacity = 0.38 - jumpRatio * 0.24;

        const locatorPulse = 1 + Math.sin(time * 5.4) * 0.13;
        this.locator.scale.setScalar(0.46 * this.scaleFactor * locatorPulse);
        this.locator.position.y =
            this.baseHeight + 0.42 + Math.sin(time * 3.4) * 0.08;
        this.locatorMaterial.opacity = 0.72 + Math.sin(time * 5.4) * 0.2;

        const ringPulse = 1 + Math.sin(time * 4.2) * 0.07;
        this.selectionRing.scale.setScalar(ringPulse);
        this.ringMaterial.opacity =
            0.5 +
            Math.sin(time * 4.2) * 0.15 +
            THREE.MathUtils.clamp(movementSpeed / this.runSpeed, 0, 1) * 0.14;
    }

    focusPoint() {
        return new THREE.Vector3(
            this.group.position.x,
            this.bodyRoot.position.y + this.baseHeight * 0.52,
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
        this.effects.dispose();
        this.texture.dispose();
        this.material.dispose();
        this.shadow.geometry.dispose();
        this.shadowMaterial.dispose();
        this.selectionRing.geometry.dispose();
        this.ringMaterial.dispose();
        this.locatorMaterial.map?.dispose();
        this.locatorMaterial.dispose();
    }
}
