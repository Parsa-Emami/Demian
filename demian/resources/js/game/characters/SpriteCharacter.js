import * as THREE from 'three';
import SpriteAnimator from './SpriteAnimator';

export default class SpriteCharacter {
    static textureCache = new Map();

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

        this.animationTime = 0;
        this.attackPulse = 0;
        this.winPulse = 0;
        this.jumpSquashPulse = 0;
        this.landPulse = 0;
        this.lastWinBurst = 0;

        this.particles = [];

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

        this.visualRoot = new THREE.Group();
        this.visualRoot.add(this.sprite);

        this.fxRoot = new THREE.Group();

        this.group.add(this.shadow, this.visualRoot, this.fxRoot);

        this.animator = new SpriteAnimator(this.texture, atlas);
        this.animator.play('idle');
    }

    update(deltaTime, input, movementBasis) {
        this.stateLock = Math.max(0, this.stateLock - deltaTime);
        this.animationTime += deltaTime;

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
            this.jumpSquashPulse = 1;
            this.playLocked('jump', 0.38);
            this.emitParticles('dust', 5, {
                speed: 0.9,
                spread: 0.55,
                size: 0.35,
            });
        }

        if (input.attack && this.grounded && this.stateLock <= 0) {
            this.attackPulse = 1;
            this.playLocked(
                'attack',
                Math.max(0.36, this.animator.duration('attack'))
            );
            this.emitParticles('star', 6, {
                speed: 1.4,
                spread: 0.35,
                size: 0.26,
            });
        }

        if (input.win && this.grounded && this.stateLock <= 0) {
            this.winPulse = 1.25;
            this.lastWinBurst = 0;
            this.playLocked(
                'win',
                Math.max(1.05, this.animator.duration('win'))
            );
            this.emitParticles('heart', 8, {
                speed: 1.2,
                spread: 0.45,
                size: 0.28,
            });
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
                this.landPulse = 1;
                this.emitParticles('dust', 6, {
                    speed: 1.1,
                    spread: 0.65,
                    size: 0.38,
                });
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
        this.updatePresentation(deltaTime);
        this.updateParticles(deltaTime);
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

    updatePresentation(deltaTime) {
        this.attackPulse = Math.max(0, this.attackPulse - deltaTime * 3.2);
        this.winPulse = Math.max(0, this.winPulse - deltaTime * 0.9);
        this.jumpSquashPulse = Math.max(0, this.jumpSquashPulse - deltaTime * 5);
        this.landPulse = Math.max(0, this.landPulse - deltaTime * 4.2);

        const time = this.animationTime;
        const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        const jumpHeight = Math.max(this.group.position.y, 0);
        const jumpRatio = THREE.MathUtils.clamp(jumpHeight / 2.8, 0, 1);

        let scaleX = 1;
        let scaleY = 1;
        let bob = 0;
        let tilt = 0;
        let offsetX = 0;

        if (this.state === 'idle') {
            const pulse = Math.sin(time * 3.2);
            bob = pulse * 0.08;
            scaleX += pulse * 0.025;
            scaleY -= pulse * 0.025;
            tilt = Math.sin(time * 1.8) * 0.03;
        }

        if (this.state === 'walk') {
            const walkCycle = time * 8.4;
            const pulse = Math.sin(walkCycle);
            bob = Math.abs(pulse) * 0.12;
            scaleX += Math.cos(walkCycle) * 0.04;
            scaleY -= Math.cos(walkCycle) * 0.04;
            tilt = pulse * 0.05;
        }

        if (this.state === 'run') {
            const runCycle = time * 12.5;
            const pulse = Math.sin(runCycle);
            bob = Math.abs(pulse) * 0.2;
            scaleX += Math.cos(runCycle) * 0.07;
            scaleY -= Math.cos(runCycle) * 0.07;
            tilt = pulse * 0.09;
        }

        if (!this.grounded) {
            const rise = THREE.MathUtils.clamp(this.jumpVelocity / this.jumpForce, -1, 1);
            scaleX += rise > 0 ? -0.08 : 0.08;
            scaleY += rise > 0 ? 0.08 : -0.08;
            tilt += -rise * 0.06 * this.facing;
            bob += 0.05;
        }

        if (this.attackPulse > 0) {
            const attackEase = 1 - Math.pow(1 - this.attackPulse, 2);
            offsetX += this.facing * 0.18 * attackEase;
            scaleX += 0.08 * attackEase;
            scaleY -= 0.08 * attackEase;
            tilt += -0.12 * this.facing * attackEase;
        }

        if (this.winPulse > 0 && this.state === 'win') {
            const cheer = Math.abs(Math.sin(time * 10));
            bob += cheer * 0.22;
            scaleX += cheer * 0.08;
            scaleY -= cheer * 0.08;
            tilt += Math.sin(time * 5) * 0.1;

            this.lastWinBurst += deltaTime;
            if (this.lastWinBurst >= 0.22) {
                this.lastWinBurst = 0;
                this.emitParticles('heart', 2, {
                    speed: 0.9,
                    spread: 0.25,
                    size: 0.22,
                });
            }
        }

        if (this.jumpSquashPulse > 0) {
            scaleX += this.jumpSquashPulse * 0.08;
            scaleY -= this.jumpSquashPulse * 0.08;
        }

        if (this.landPulse > 0) {
            scaleX += this.landPulse * 0.12;
            scaleY -= this.landPulse * 0.12;
            bob -= this.landPulse * 0.05;
        }

        const directionalLean =
            this.grounded && planarSpeed > 0.15
                ? THREE.MathUtils.clamp(planarSpeed / this.runSpeed, 0, 1) * 0.02
                : 0;

        this.sprite.scale.set(
            this.baseWidth * scaleX * this.facing,
            this.baseHeight * scaleY,
            1
        );

        this.sprite.position.set(
            offsetX,
            this.baseHeight * 0.5 + bob,
            0
        );

        this.sprite.rotation.z = tilt + directionalLean * this.facing;

        this.shadow.scale.setScalar(
            1 - jumpRatio * 0.35 + this.landPulse * 0.1
        );

        this.shadowMaterial.opacity = 0.32 - jumpRatio * 0.18;
    }

    emitParticles(kind, count, options = {}) {
        const speed = Number(options.speed ?? 1);
        const spread = Number(options.spread ?? 0.4);
        const size = Number(options.size ?? 0.25);

        for (let i = 0; i < count; i++) {
            const texture = this.getParticleTexture(kind);

            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                toneMapped: false,
            });

            const sprite = new THREE.Sprite(material);

            const baseSize = size * (0.85 + Math.random() * 0.35);
            sprite.scale.set(baseSize, baseSize, 1);
            sprite.position.set(
                (Math.random() - 0.5) * spread,
                0.15 + Math.random() * 0.45,
                (Math.random() - 0.5) * spread
            );

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                kind === 'dust'
                    ? 0.25 + Math.random() * 0.18
                    : 0.55 + Math.random() * 0.55,
                (Math.random() - 0.5) * speed * 0.35
            );

            const particle = {
                kind,
                sprite,
                material,
                velocity,
                life: kind === 'dust' ? 0.38 : 0.8,
                maxLife: kind === 'dust' ? 0.38 : 0.8,
                baseSize,
                drift: (Math.random() - 0.5) * 0.8,
            };

            this.fxRoot.add(sprite);
            this.particles.push(particle);
        }
    }

    updateParticles(deltaTime) {
        for (let index = this.particles.length - 1; index >= 0; index -= 1) {
            const particle = this.particles[index];

            particle.life -= deltaTime;

            if (particle.life <= 0) {
                this.fxRoot.remove(particle.sprite);
                particle.material.dispose();
                this.particles.splice(index, 1);
                continue;
            }

            const alpha = particle.life / particle.maxLife;

            particle.sprite.position.addScaledVector(particle.velocity, deltaTime);
            particle.sprite.position.x += particle.drift * deltaTime * 0.1;

            if (particle.kind !== 'dust') {
                particle.velocity.y += 0.12 * deltaTime;
            }

            particle.material.opacity = alpha;

            const scale =
                particle.baseSize *
                (particle.kind === 'dust'
                    ? 0.9 + (1 - alpha) * 0.45
                    : 0.8 + alpha * 0.4);

            particle.sprite.scale.set(scale, scale, 1);
        }
    }

    getParticleTexture(kind) {
        if (SpriteCharacter.textureCache.has(kind)) {
            return SpriteCharacter.textureCache.get(kind);
        }

        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, size, size);

        if (kind === 'heart') {
            ctx.fillStyle = '#ff7bd8';
            ctx.beginPath();
            ctx.moveTo(32, 52);
            ctx.bezierCurveTo(10, 34, 8, 16, 22, 16);
            ctx.bezierCurveTo(28, 16, 32, 21, 32, 21);
            ctx.bezierCurveTo(32, 21, 36, 16, 42, 16);
            ctx.bezierCurveTo(56, 16, 54, 34, 32, 52);
            ctx.fill();
        } else if (kind === 'star') {
            ctx.fillStyle = '#ffd65a';
            ctx.beginPath();

            const cx = 32;
            const cy = 32;
            const spikes = 5;
            const outer = 18;
            const inner = 8;

            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? outer : inner;
                const angle = (Math.PI / spikes) * i - Math.PI / 2;
                const x = cx + Math.cos(angle) * radius;
                const y = cy + Math.sin(angle) * radius;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(32, 32, 13, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        SpriteCharacter.textureCache.set(kind, texture);

        return texture;
    }

    speed() {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }

    dispose() {
        this.texture.dispose();
        this.material.dispose();
        this.shadow.geometry.dispose();
        this.shadowMaterial.dispose();

        for (const particle of this.particles) {
            particle.material.dispose();
        }

        this.particles = [];
    }
}