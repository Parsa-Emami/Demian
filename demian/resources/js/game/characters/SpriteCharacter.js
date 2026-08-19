import * as THREE from 'three';
import SpriteAnimator from './SpriteAnimator';
import CharacterEffects from './CharacterEffects';
import CharacterSpeechBubble from './CharacterSpeechBubble';
import {
    cameraRelativeDirection,
    directionFromVector,
    directionProfile,
} from './DirectionResolver';
import { WORLD_CONFIG } from '../world/WorldConfig';
import { characterFrameWorldSize } from './CharacterVisualContract.js';
import {
    characterPlaybackRate,
    characterPresentationPose,
} from './CharacterMotionProfile.js';

const LOCKED_ACTIONS = new Set([
    'win',
    'celebrate',
    'dash',
    'slide',
    'dodge',
    'dance',
    'guitar',
    'wave',
    'salute',
    'spin',
    'crouch',
    'laugh',
    'pose',
    'sleep',
    'taunt',
    'land',
    'skid',
    'turn',
    'blink',
    'ready',
]);

const ACTIONS = Object.freeze([
    { name: 'win', duration: 1.3, velocityRetention: 0.05 },
    { name: 'celebrate', duration: 1.8, velocityRetention: 0.04 },
    { name: 'dash', duration: 0.42, impulse: 12.8 },
    { name: 'slide', duration: 0.58, impulse: 9.7 },
    { name: 'dodge', duration: 0.62, impulse: 8.8, reverse: true },
    { name: 'dance', duration: 2.15, velocityRetention: 0.02 },
    { name: 'guitar', duration: 2.25, velocityRetention: 0.01 },
    { name: 'wave', duration: 1.35, velocityRetention: 0.02 },
    { name: 'salute', duration: 1.05, velocityRetention: 0.02 },
    { name: 'spin', duration: 1.02, velocityRetention: 0.04 },
    { name: 'crouch', duration: 1.1, velocityRetention: 0 },
    { name: 'laugh', duration: 1.55, velocityRetention: 0.02 },
    { name: 'pose', duration: 1.45, velocityRetention: 0.02 },
    { name: 'sleep', duration: 2.5, velocityRetention: 0 },
    { name: 'taunt', duration: 1.3, velocityRetention: 0.04 },
]);

const IDLE_VARIANTS = Object.freeze(['blink', 'breathe', 'ready']);

function damp(current, target, smoothing, deltaTime) {
    return THREE.MathUtils.damp(current, target, smoothing, deltaTime);
}

export default class SpriteCharacter {
    constructor({ scene, character, texture, atlas, controlled = false }) {
        this.scene = scene;
        this.character = character;
        this.atlas = atlas;
        this.group = new THREE.Group();
        this.group.name = `Character:${character.slug}`;
        this.bodyRoot = new THREE.Group();
        this.bodyRoot.name = `CharacterBody:${character.slug}`;

        this.velocity = new THREE.Vector3();
        this.desiredVelocity = new THREE.Vector3();
        this.moveDirection = new THREE.Vector3();
        this.lastMoveDirection = new THREE.Vector3(1, 0, 0);
        this.actionDirection = new THREE.Vector3(1, 0, 0);
        this.jumpDirection = new THREE.Vector3(1, 0, 0);
        this.zeroVelocity = new THREE.Vector3();
        this.isPlayerControlled = Boolean(controlled);
        this.movementResolver = null;
        this.colliderRadius = 0.72;

        this.state = 'idle';
        this.previousState = null;
        this.stateLock = 0;
        this.stateTime = 0;
        this.presentationTime = 0;
        this.direction = 'e';
        this.facing = 1;
        this.horizontalMotion = 0;
        this.depthMotion = 0;

        this.jumpVelocity = 0;
        this.grounded = true;
        this.wasGrounded = true;
        this.coyoteTimer = 0.1;
        this.jumpBufferTimer = 0;
        this.skidArmed = false;
        this.idleVariantTimer = 2.6 + Math.random() * 1.8;
        this.dashCooldown = 0;

        this.introClock = 0;
        this.introStep = 0;
        this.introActive = this.isPlayerControlled;

        const settings = character.settings ?? {};
        this.signatureAction = typeof settings.signature_action === 'string' ? settings.signature_action : null;
        this.signatureActionTimer = this.initialSignatureActionDelay();
        this.walkSpeed = Number(settings.walk_speed ?? 3.2);
        this.runSpeed = Number(settings.run_speed ?? 6.2);
        this.sprintSpeed = Number(settings.sprint_speed ?? this.runSpeed * 1.1);
        this.jumpForce = Number(settings.jump_force ?? 6.5);
        this.gravity = Number(settings.gravity ?? 17.5);
        // Every world entity uses one canonical visual footprint. Database scale
        // values from older versions must not make the selected player smaller
        // or larger than the NPC representation of another character.
        this.scaleFactor = 1;
        this.bounds = { minX: -WORLD_CONFIG.bounds.x, maxX: WORLD_CONFIG.bounds.x, minZ: -WORLD_CONFIG.bounds.z, maxZ: WORLD_CONFIG.bounds.z };
        this.airControl = Number(settings.air_control ?? 0.46);
        this.minimumJumpSpeed = Number(settings.minimum_jump_speed ?? this.walkSpeed * 0.9);

        this.texture = texture;
        this.texture.needsUpdate = true;

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            alphaTest: 0.025,
            depthWrite: false,
            toneMapped: false,
        });

        this.sprite = new THREE.Sprite(this.material);
        this.applyAtlasVisualMetrics(atlas);
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

        const selectionRingColor = {
            amirreza: 0x67e8f9,
            parsa: 0xfbbf24,
            uzudi: 0x8b5cf6,
        }[character.slug] ?? 0xff66d9;

        this.ringMaterial = new THREE.MeshBasicMaterial({
            color: selectionRingColor,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            toneMapped: false,
        });
        this.selectionRing = new THREE.Mesh(
            new THREE.RingGeometry(0.9 * this.scaleFactor, 1.08 * this.scaleFactor, 48),
            this.ringMaterial
        );
        this.selectionRing.rotation.x = -Math.PI / 2;
        this.selectionRing.position.y = 0.055;
        this.selectionRing.renderOrder = 3;
        this.selectionRing.visible = this.isPlayerControlled;

        this.locatorMaterial = new THREE.SpriteMaterial({
            map: this.createLocatorTexture(),
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        this.locator = new THREE.Sprite(this.locatorMaterial);
        this.locator.scale.setScalar(0.46 * this.scaleFactor);
        this.locator.position.y = this.bodyWorldHeight + 0.42;
        this.locator.renderOrder = 25;
        this.locator.visible = this.isPlayerControlled;

        this.bodyRoot.add(this.sprite, this.locator);
        this.group.add(this.shadow, this.selectionRing, this.bodyRoot);

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.effects = new CharacterEffects(scene, this);
        this.speech = new CharacterSpeechBubble(this, atlas.speech ?? {});
        this.animator.play('idle');

        this.visual = {
            width: 1,
            height: 1,
            bob: 0,
            tilt: 0,
            x: 0,
            y: 0,
        };
        this.applySpawnPose(0);
    }

    applyAtlasVisualMetrics(atlas) {
        const worldDisplay = WORLD_CONFIG.characterDisplay ?? {};
        const atlasDisplay = atlas?.display ?? {};
        const metrics = characterFrameWorldSize(atlas, {
            worldWidth: Number(atlasDisplay.worldWidth ?? worldDisplay.worldWidth ?? 3.75),
            worldHeight: Number(atlasDisplay.worldHeight ?? worldDisplay.worldHeight ?? 3.75),
        });
        this.bodyWorldWidth = metrics.bodyWidth;
        this.bodyWorldHeight = metrics.bodyHeight;
        this.baseWidth = metrics.frameWidth;
        this.baseHeight = metrics.frameHeight;
        if (this.sprite) this.sprite.scale.set(this.baseWidth, this.baseHeight, 1);
        if (this.locator) this.locator.position.y = this.bodyWorldHeight + 0.42;
        return metrics;
    }

    replaceVisualAssets(texture, atlas) {
        if (!texture || !atlas) {
            throw new TypeError('Character visual assets require a texture and atlas.');
        }

        const previousTexture = this.texture;
        const previousAnimator = this.animator;
        const animationName = previousAnimator?.requestedAnimationName ?? previousAnimator?.animationName ?? this.state ?? 'idle';
        const animationProgress = previousAnimator?.progress?.() ?? 0;
        const direction = previousAnimator?.direction ?? this.direction;
        const facing = previousAnimator?.facing ?? this.facing;
        const playbackRate = previousAnimator?.playbackRate ?? 1;

        this.texture = texture;
        this.texture.needsUpdate = true;
        this.atlas = atlas;
        this.material.map = this.texture;
        this.material.needsUpdate = true;

        const pivot = atlas.pivot ?? { x: 0.5, y: 0.96 };
        this.sprite.center.set(
            Number(pivot.x ?? 0.5),
            THREE.MathUtils.clamp(1 - Number(pivot.y ?? 0.96), 0, 1)
        );
        this.applyAtlasVisualMetrics(atlas);

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.animator.setDirection(direction);
        this.animator.setFacing(facing);
        this.animator.setPlaybackRate(playbackRate);
        const resolved = this.animator.play(animationName, { restart: true });
        const frames = this.animator.currentFrames();
        if (frames.length > 1 && Number.isFinite(animationProgress)) {
            this.animator.frameIndex = Math.min(
                frames.length - 1,
                Math.max(0, Math.round(animationProgress * (frames.length - 1)))
            );
            this.animator.applyCurrentFrame();
        }

        if (!resolved) {
            this.animator.play('idle', { restart: true });
        }

        if (previousTexture && previousTexture !== this.texture) {
            previousTexture.dispose();
        }
    }

    setPlayerControlled(controlled, { playIntro = false } = {}) {
        this.isPlayerControlled = Boolean(controlled);
        this.movementResolver = null;
        this.colliderRadius = 0.72;
        this.locator.visible = this.isPlayerControlled;
        this.selectionRing.visible = this.isPlayerControlled;
        this.effects?.setIntensity(this.isPlayerControlled ? 1 : 0.28);
        // Role changes never alter the character dimensions. This also clears
        // any incomplete spawn scale left by a very fast character switch.
        this.bodyRoot.scale.setScalar(1);
        this.presentationTime = Math.max(this.presentationTime, 0.62);

        if (!this.isPlayerControlled) {
            this.introActive = false;
        } else if (playIntro) {
            this.introClock = 0;
            this.introStep = 0;
            this.introActive = true;
        }
    }

    setWorldBounds(bounds) {
        if (!bounds) {
            return;
        }

        if ([bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) {
            this.bounds.minX = Number(bounds.minX);
            this.bounds.maxX = Number(bounds.maxX);
            this.bounds.minZ = Number(bounds.minZ);
            this.bounds.maxZ = Number(bounds.maxZ);
            return;
        }
        const x = Math.max(1, Number(bounds.x) || WORLD_CONFIG.bounds.x);
        const z = Math.max(1, Number(bounds.z) || WORLD_CONFIG.bounds.z);
        this.bounds = { minX: -x, maxX: x, minZ: -z, maxZ: z };
    }

    setMovementResolver(resolver, { radius = this.colliderRadius } = {}) {
        if (resolver !== null && typeof resolver !== 'function') {
            throw new TypeError('Movement resolver must be a function or null.');
        }

        this.movementResolver = resolver;
        this.colliderRadius = Math.max(0.1, Number(radius) || this.colliderRadius);
    }

    applyHorizontalMovement(deltaTime) {
        const start = { x: this.group.position.x, z: this.group.position.z };
        const target = {
            x: start.x + this.velocity.x * deltaTime,
            z: start.z + this.velocity.z * deltaTime,
        };

        if (!this.movementResolver) {
            this.group.position.x = target.x;
            this.group.position.z = target.z;
            this.constrainToWorld();
            return;
        }

        const result = this.movementResolver({
            from: start,
            target,
            radius: this.colliderRadius,
            entity: this,
        });

        if (!result?.position) {
            this.group.position.x = target.x;
            this.group.position.z = target.z;
            this.constrainToWorld();
            return;
        }

        this.group.position.x = result.position.x;
        this.group.position.z = result.position.z;
        if (result.blockedX) this.velocity.x = 0;
        if (result.blockedZ) this.velocity.z = 0;
        this.constrainToWorld();
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

    initialSignatureActionDelay() {
        return 8.5 + Math.random() * 5.5;
    }

    maybePerformSignatureAction(deltaTime) {
        if (this.signatureAction !== 'guitar' || !this.grounded || this.stateLock > 0) {
            return;
        }

        if (!this.animator.has('guitar')) {
            return;
        }

        if (this.state !== 'idle') {
            this.signatureActionTimer = Math.min(this.signatureActionTimer, 5.5);
            return;
        }

        this.signatureActionTimer -= deltaTime;

        if (this.signatureActionTimer > 0) {
            return;
        }

        this.velocity.multiplyScalar(0.02);
        this.playLocked('guitar', 2.25);
        this.signatureActionTimer = this.initialSignatureActionDelay();
    }


    update(deltaTime, input, movementBasis) {
        this.stateLock = Math.max(0, this.stateLock - deltaTime);
        this.dashCooldown = Math.max(0, this.dashCooldown - deltaTime);
        this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - deltaTime);
        this.stateTime += deltaTime;
        this.presentationTime += deltaTime;
        this.wasGrounded = this.grounded;

        if (this.grounded) {
            this.coyoteTimer = 0.11;
        } else {
            this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaTime);
        }

        if (input.jump) {
            this.jumpBufferTimer = 0.14;
        }

        if (input.speak) {
            this.speech.showRandom();
        }

        const rawMove = cameraRelativeDirection(input.x, input.z, movementBasis);
        const inputMagnitude = THREE.MathUtils.clamp(rawMove.length(), 0, 1);
        const hasMovement = inputMagnitude > 0.06;
        const hasAction = ACTIONS.some(({ name }) => Boolean(input[name]));

        if (hasMovement || hasAction || input.jump) {
            this.introActive = false;
        }

        if (this.introActive) {
            this.updateIntro(deltaTime);
        }

        if (
            this.jumpBufferTimer > 0 &&
            this.coyoteTimer > 0 &&
            this.stateLock <= 0
        ) {
            this.performJump(rawMove, inputMagnitude);
            this.jumpBufferTimer = 0;
        }

        if (this.grounded && this.stateLock <= 0) {
            this.handleActionInput(input);
        }

        const actionBlocksMovement = this.stateLock > 0 && LOCKED_ACTIONS.has(this.state);
        const impulseAction = actionBlocksMovement && ['dash', 'dodge', 'slide'].includes(this.state);

        if (hasMovement && !actionBlocksMovement) {
            this.moveDirection.copy(rawMove).normalize();
            const directionAlpha = 1 - Math.exp(-18 * deltaTime);
            this.lastMoveDirection.lerp(this.moveDirection, directionAlpha).normalize();
            this.actionDirection.copy(this.lastMoveDirection);

            const nextDirection = directionFromVector(this.moveDirection, this.direction);
            this.setDirection(nextDirection);

            if (Math.abs(this.moveDirection.x) > 0.12) {
                this.setFacing(this.moveDirection.x > 0 ? 1 : -1);
            }

            const sprinting = input.run && inputMagnitude > 0.9;
            const targetSpeed = sprinting
                ? this.sprintSpeed
                : input.run
                    ? this.runSpeed
                    : this.walkSpeed;

            this.desiredVelocity.copy(this.moveDirection).multiplyScalar(targetSpeed * inputMagnitude);
            const currentDirection = this.velocity.clone().setY(0);
            const turnDot = currentDirection.lengthSq() > 0.1
                ? currentDirection.normalize().dot(this.moveDirection)
                : 1;
            const groundedAcceleration = turnDot < -0.25 ? 24 : sprinting ? 15 : 18;
            const accelerationRate = this.grounded
                ? groundedAcceleration
                : THREE.MathUtils.lerp(5.5, 10.5, this.airControl);
            const acceleration = 1 - Math.exp(-accelerationRate * deltaTime);
            this.velocity.lerp(this.desiredVelocity, acceleration);
            this.skidArmed = this.grounded;
        } else if (impulseAction) {
            const drag = 1 - Math.exp(-3.1 * deltaTime);
            this.velocity.lerp(this.zeroVelocity, drag);
        } else {
            const brakingRate = actionBlocksMovement
                ? 25
                : this.grounded
                    ? 13.5
                    : 0.72;
            const braking = 1 - Math.exp(-brakingRate * deltaTime);
            this.velocity.lerp(this.zeroVelocity, braking);

            if (
                !actionBlocksMovement &&
                this.skidArmed &&
                this.grounded &&
                this.speed() > this.runSpeed * 0.58
            ) {
                this.skidArmed = false;
                this.playLocked('skid', 0.24);
                this.effects.skid?.();
            }
        }

        this.horizontalMotion = damp(this.horizontalMotion, this.lastMoveDirection.x, 12, deltaTime);
        this.depthMotion = damp(this.depthMotion, this.lastMoveDirection.z, 12, deltaTime);

        this.applyHorizontalMovement(deltaTime);
        this.updateJumpPhysics(deltaTime);

        if (this.stateLock <= 0) {
            this.selectLocomotionState(input, inputMagnitude, deltaTime);
            this.maybePerformSignatureAction(deltaTime);
        }

        const movementRatio = THREE.MathUtils.clamp(this.speed() / Math.max(this.runSpeed, 0.01), 0, 1.5);
        this.animator.setPlaybackRate(characterPlaybackRate(this.state, movementRatio));
        this.animator.update(deltaTime);
        this.effects.update(deltaTime, this.speed());
        this.speech.update(deltaTime);
        this.updatePresentation(deltaTime);
    }

    constrainToWorld() {
        const previousX = this.group.position.x;
        const previousZ = this.group.position.z;

        this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, this.bounds.minX, this.bounds.maxX);
        this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, this.bounds.minZ, this.bounds.maxZ);

        if (this.group.position.x !== previousX) {
            this.velocity.x = 0;
        }
        if (this.group.position.z !== previousZ) {
            this.velocity.z = 0;
        }
    }

    updateJumpPhysics(deltaTime) {
        if (this.grounded) {
            return;
        }

        this.jumpVelocity -= this.gravity * deltaTime;
        this.bodyRoot.position.y += this.jumpVelocity * deltaTime;

        if (this.bodyRoot.position.y > 0) {
            return;
        }

        const impact = Math.abs(this.jumpVelocity);
        this.bodyRoot.position.y = 0;
        this.jumpVelocity = 0;
        this.grounded = true;
        this.coyoteTimer = 0.11;
        this.effects.landing(impact);
        this.playLocked('land', impact > this.jumpForce * 1.25 ? 0.28 : 0.18);
    }

    selectLocomotionState(input, inputMagnitude, deltaTime) {
        if (!this.grounded) {
            this.setState(
                this.jumpVelocity > 1.1
                    ? 'takeoff'
                    : this.jumpVelocity < -0.9
                        ? 'fall'
                        : 'jump'
            );
            return;
        }

        const planarSpeed = this.speed();
        if (input.run && inputMagnitude > 0.9 && planarSpeed > this.runSpeed * 0.82) {
            this.setState('sprint');
            return;
        }
        if (planarSpeed > this.walkSpeed * 1.32) {
            this.setState('run');
            return;
        }
        if (planarSpeed > 0.16) {
            this.setState('walk');
            return;
        }

        this.setState('idle');
        this.idleVariantTimer -= deltaTime;

        if (this.idleVariantTimer <= 0) {
            const available = IDLE_VARIANTS.filter((name) => this.animator.has(name));
            if (available.length > 0) {
                const name = available[Math.floor(Math.random() * available.length)];
                this.playLocked(name, Math.min(this.animator.duration(name), 0.9));
            }
            this.idleVariantTimer = 2.8 + Math.random() * 3.2;
        }
    }

    handleActionInput(input) {
        const action = ACTIONS.find(({ name }) => Boolean(input[name]));
        if (!action) {
            return;
        }

        if (['dash', 'slide', 'dodge'].includes(action.name)) {
            if (action.name === 'dash' && this.dashCooldown > 0) {
                return;
            }
            this.performImpulseAction(action.name, action.duration, action.impulse, action.reverse);
            if (action.name === 'dash') {
                this.dashCooldown = 0.18;
            }
            return;
        }

        this.velocity.multiplyScalar(action.velocityRetention ?? 0.05);
        this.playLocked(action.name, action.duration);
    }

    performImpulseAction(name, duration, speed, reverse = false) {
        this.actionDirection.copy(this.lastMoveDirection);

        if (this.actionDirection.lengthSq() < 0.01) {
            this.actionDirection.set(this.facing, 0, 0);
        }

        if (reverse) {
            this.actionDirection.multiplyScalar(-1);
        }

        this.actionDirection.normalize();
        this.velocity.copy(this.actionDirection).multiplyScalar(speed);
        this.setDirection(directionFromVector(this.actionDirection, this.direction));

        if (Math.abs(this.actionDirection.x) > 0.08) {
            this.setFacing(this.actionDirection.x >= 0 ? 1 : -1);
        }

        this.playLocked(name, duration);
    }

    updateIntro(deltaTime) {
        this.introClock += deltaTime;

        if (this.introStep === 0 && this.introClock >= 0.4) {
            this.playLocked('ready', 0.75);
            this.introStep = 1;
            return;
        }
        if (this.introStep === 1 && this.introClock >= 1.35 && this.stateLock <= 0) {
            this.playLocked('wave', 0.9);
            this.introStep = 2;
            return;
        }
        if (this.introStep === 2 && this.introClock >= 2.5 && this.grounded && this.stateLock <= 0) {
            this.performJump(this.lastMoveDirection, 0.7);
            this.introStep = 3;
            return;
        }
        if (this.introStep === 3 && this.introClock >= 3.55 && this.grounded && this.stateLock <= 0) {
            this.playLocked('celebrate', 1.15);
            this.introStep = 4;
            return;
        }
        if (this.introStep === 4 && this.introClock >= 5.0) {
            this.introActive = false;
        }
    }

    performJump(rawMove = null, inputMagnitude = 0) {
        const requestedDirection = rawMove?.clone?.() ?? new THREE.Vector3();
        requestedDirection.y = 0;

        if (requestedDirection.lengthSq() < 0.004) {
            requestedDirection.copy(this.velocity).setY(0);
        }
        if (requestedDirection.lengthSq() < 0.004) {
            requestedDirection.copy(this.lastMoveDirection).setY(0);
        }
        if (requestedDirection.lengthSq() < 0.004) {
            requestedDirection.set(this.facing, 0, 0);
        }

        requestedDirection.normalize();
        this.jumpDirection.copy(requestedDirection);
        this.lastMoveDirection.copy(requestedDirection);
        this.actionDirection.copy(requestedDirection);
        this.setDirection(directionFromVector(requestedDirection, this.direction));

        if (Math.abs(requestedDirection.x) > 0.08) {
            this.setFacing(requestedDirection.x >= 0 ? 1 : -1);
        }

        const existingSpeed = this.speed();
        const requestedSpeed = THREE.MathUtils.lerp(
            this.minimumJumpSpeed,
            this.runSpeed,
            THREE.MathUtils.clamp(inputMagnitude, 0, 1)
        );
        const carrySpeed = Math.max(existingSpeed, requestedSpeed);
        this.velocity.x = requestedDirection.x * carrySpeed;
        this.velocity.z = requestedDirection.z * carrySpeed;

        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpVelocity = this.jumpForce;
        this.stateLock = 0.08;
        this.setState('takeoff', true);
    }

    playLocked(animationName, minimumDuration = 0) {
        this.setState(animationName, true);
        this.stateLock = Math.max(minimumDuration, this.animator.duration(animationName));
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

    setDirection(direction) {
        if (!direction || this.direction === direction) {
            return;
        }

        this.direction = direction;
        this.animator.setDirection(direction);
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;
        if (this.facing === nextFacing) {
            return;
        }

        this.facing = nextFacing;
        this.animator.setFacing(nextFacing);
    }

    applySpawnPose() {
        // Keep player and NPC sprites at exactly the same world scale from the
        // first rendered frame. Spawn personality is handled by animation and
        // particles instead of changing the body dimensions.
        this.bodyRoot.scale.setScalar(1);
    }

    targetPresentation() {
        return characterPresentationPose({
            state: this.state,
            presentationTime: this.presentationTime,
            stateTime: this.stateTime,
            progress: this.animator.progress(),
            direction: this.direction,
            facing: this.facing,
            jumpVelocity: this.jumpVelocity,
            jumpForce: this.jumpForce,
            velocityX: this.velocity.x,
            depthMotion: this.depthMotion,
            horizontalMotion: this.horizontalMotion,
        });
    }

    updatePresentation(deltaTime) {
        const target = this.targetPresentation();
        const profile = directionProfile(this.direction);
        const motion = this.atlas.motion ?? {};
        const northSouthScale = Number(motion.northSouthScale ?? 0.92);
        const diagonalScale = Number(motion.diagonalScale ?? 0.97);
        const directionDepthScale = Number(motion.directionDepthScale ?? 0.08);

        if (profile.isVertical) {
            target.width *= northSouthScale;
        } else if (profile.isDiagonal) {
            target.width *= diagonalScale;
        }
        target.height *= 1 - profile.depthSign * directionDepthScale * 0.12;
        target.y += profile.depthSign * 0.025;

        const smoothing = this.state === 'dash' ? 22 : 16;
        this.visual.width = damp(this.visual.width, target.width, smoothing, deltaTime);
        this.visual.height = damp(this.visual.height, target.height, smoothing, deltaTime);
        this.visual.bob = damp(this.visual.bob, target.bob, 20, deltaTime);
        this.visual.tilt = damp(this.visual.tilt, target.tilt, 18, deltaTime);
        this.visual.x = damp(this.visual.x, target.x, 20, deltaTime);
        this.visual.y = damp(this.visual.y, target.y, 20, deltaTime);

        const atlasHandlesFacing = this.animator.usesDirectionalFrames();
        const facingScale = atlasHandlesFacing ? 1 : this.facing;
        const spinSign = this.state === 'spin'
            ? Math.sign(Math.cos(this.animator.progress() * Math.PI * 4) || 1)
            : 1;

        this.sprite.scale.set(
            this.baseWidth * this.visual.width * facingScale * spinSign,
            this.baseHeight * this.visual.height,
            1
        );
        this.sprite.position.x = this.visual.x;
        this.sprite.position.y = 0.02 + this.visual.bob + this.visual.y;
        this.sprite.material.rotation = this.visual.tilt;

        const spawnProgress = THREE.MathUtils.clamp(this.presentationTime / 0.62, 0, 1);
        this.applySpawnPose(spawnProgress);

        const jumpHeight = Math.max(this.bodyRoot.position.y, 0);
        const jumpRatio = THREE.MathUtils.clamp(jumpHeight / 3.2, 0, 1);
        const movementSpeed = this.speed();
        this.shadow.scale.set(
            1.4 * (1 - jumpRatio * 0.38) * (1 + Math.abs(this.depthMotion) * 0.03),
            0.62 * (1 - jumpRatio * 0.22),
            1
        );
        this.shadowMaterial.opacity = 0.38 - jumpRatio * 0.24;

        const time = this.presentationTime;
        const locatorPulse = 1 + Math.sin(time * 5.4) * 0.13;
        this.locator.scale.setScalar(0.46 * this.scaleFactor * locatorPulse);
        this.locator.position.y = this.bodyWorldHeight + 0.42 + Math.sin(time * 3.4) * 0.08;
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
            this.bodyRoot.position.y + this.bodyWorldHeight * 0.52,
            this.group.position.z
        );
    }

    visualHeight() {
        return this.bodyWorldHeight;
    }

    speed() {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }

    dispose() {
        this.movementResolver = null;
        this.speech.dispose();
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
