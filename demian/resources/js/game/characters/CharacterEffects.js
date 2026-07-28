import * as THREE from 'three';

export default class CharacterEffects {
    constructor(scene, owner) {
        this.scene = scene;
        this.owner = owner;
        this.time = 0;
        this.dustTimer = 0;
        this.ghostTimer = 0;
        this.particles = [];
        this.intensity = owner.isPlayerControlled ? 1 : 0.28;
        this.particleBudget = (window.matchMedia?.('(pointer: coarse)').matches ?? false) ? 48 : 92;
        this.textures = {
            dust: this.createTexture('dust'),
            star: this.createTexture('star'),
            heart: this.createTexture('heart'),
            slash: this.createTexture('slash'),
            sparkle: this.createTexture('sparkle'),
            note: this.createTexture('note'),
            zzz: this.createTexture('zzz'),
            impact: this.createTexture('impact'),
            speed: this.createTexture('speed'),
        };
    }

    setIntensity(intensity) {
        this.intensity = THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1);
    }

    createTexture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, 128, 128);
        context.imageSmoothingEnabled = false;

        if (type === 'dust') {
            context.fillStyle = 'rgba(210, 225, 255, 0.9)';
            context.fillRect(34, 58, 60, 22);
            context.fillRect(24, 66, 18, 12);
            context.fillRect(88, 50, 18, 14);
        }

        if (type === 'star' || type === 'sparkle') {
            context.save();
            context.translate(64, 64);
            context.beginPath();
            const points = type === 'star' ? 5 : 4;
            const outer = type === 'star' ? 44 : 50;
            const inner = type === 'star' ? 19 : 10;

            for (let index = 0; index < points * 2; index += 1) {
                const radius = index % 2 === 0 ? outer : inner;
                const angle = -Math.PI / 2 + (Math.PI * index) / points;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }

            context.closePath();
            context.fillStyle = type === 'star' ? '#ffd43b' : '#8ff8ff';
            context.fill();
            context.lineWidth = 8;
            context.strokeStyle = '#fff4bd';
            context.stroke();
            context.restore();
        }

        if (type === 'heart') {
            context.fillStyle = '#ff63c7';
            context.beginPath();
            context.moveTo(64, 104);
            context.bezierCurveTo(18, 72, 18, 34, 44, 30);
            context.bezierCurveTo(58, 28, 64, 40, 64, 48);
            context.bezierCurveTo(64, 40, 70, 28, 84, 30);
            context.bezierCurveTo(110, 34, 110, 72, 64, 104);
            context.fill();
        }

        if (type === 'note') {
            context.fillStyle = '#7cf8ff';
            context.font = '900 82px Arial, sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('♪', 64, 66);
        }

        if (type === 'zzz') {
            context.fillStyle = '#c4b5fd';
            context.font = '900 48px Arial, sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('Zzz', 64, 66);
        }

        if (type === 'impact') {
            context.save();
            context.translate(64, 64);
            context.strokeStyle = '#ffffff';
            context.lineWidth = 8;
            context.shadowColor = '#7cf8ff';
            context.shadowBlur = 18;
            for (let index = 0; index < 8; index += 1) {
                context.rotate(Math.PI / 4);
                context.beginPath();
                context.moveTo(22, 0);
                context.lineTo(52, 0);
                context.stroke();
            }
            context.restore();
        }

        if (type === 'speed') {
            context.strokeStyle = 'rgba(165, 243, 252, 0.95)';
            context.lineWidth = 8;
            context.lineCap = 'round';
            context.beginPath();
            context.moveTo(18, 42);
            context.lineTo(108, 42);
            context.moveTo(30, 64);
            context.lineTo(112, 64);
            context.moveTo(12, 86);
            context.lineTo(94, 86);
            context.stroke();
        }

        if (type === 'slash') {
            context.strokeStyle = '#ffd43b';
            context.lineWidth = 16;
            context.lineCap = 'round';
            context.shadowColor = '#ff5cca';
            context.shadowBlur = 18;
            context.beginPath();
            context.arc(62, 72, 42, -1.35, 1.15);
            context.stroke();
            context.strokeStyle = '#ffffff';
            context.lineWidth = 5;
            context.beginPath();
            context.arc(62, 72, 42, -1.35, 1.15);
            context.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
    }

    spawn(type, options = {}) {
        if (this.intensity <= 0 || (this.intensity < 1 && Math.random() > this.intensity)) {
            return;
        }

        if (this.particles.length >= this.particleBudget * Math.max(this.intensity, 0.25)) {
            return;
        }

        const material = new THREE.SpriteMaterial({
            map: this.textures[type],
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            opacity: options.opacity ?? 1,
        });
        const sprite = new THREE.Sprite(material);
        const position = options.position ?? this.owner.group.position;

        sprite.position.copy(position);
        sprite.position.y += options.y ?? 0.15;
        sprite.position.z += options.z ?? 0;
        sprite.scale.setScalar(options.scale ?? 0.45);
        sprite.renderOrder = 30;
        this.scene.add(sprite);

        this.particles.push({
            sprite,
            material,
            velocity: (options.velocity ?? new THREE.Vector3()).clone(),
            life: options.life ?? 0.6,
            maxLife: options.life ?? 0.6,
            startScale: options.scale ?? 0.45,
            growth: options.growth ?? 0.5,
            spin: options.spin ?? 0,
            gravity: options.gravity ?? 0,
            ownsTexture: false,
        });
    }

    spawnGhost(options = {}) {
        if (this.intensity < 0.7 || this.particles.length >= this.particleBudget || !this.owner.texture) {
            return;
        }

        const texture = this.owner.texture.clone();
        texture.image = this.owner.texture.image;
        texture.offset.copy(this.owner.texture.offset);
        texture.repeat.copy(this.owner.texture.repeat);
        texture.wrapS = this.owner.texture.wrapS;
        texture.wrapT = this.owner.texture.wrapT;
        texture.magFilter = this.owner.texture.magFilter;
        texture.minFilter = this.owner.texture.minFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            opacity: options.opacity ?? 0.34,
            color: options.color ?? 0x9ae6ff,
        });
        const sprite = new THREE.Sprite(material);
        sprite.center.copy(this.owner.sprite.center);
        sprite.position.copy(this.owner.group.position);
        sprite.position.y += this.owner.bodyRoot.position.y + this.owner.sprite.position.y;
        sprite.scale.copy(this.owner.sprite.scale);
        sprite.renderOrder = 16;
        this.scene.add(sprite);

        const life = options.life ?? 0.24;
        this.particles.push({
            sprite,
            material,
            velocity: (options.velocity ?? new THREE.Vector3()).clone(),
            life,
            maxLife: life,
            startScale: 1,
            growth: options.growth ?? 0.06,
            spin: 0,
            gravity: 0,
            ownsTexture: true,
            preserveScale: true,
        });
    }

    onStateChanged(state, facing) {
        const position = this.owner.group.position.clone();

        if (['attack', 'combo', 'uppercut', 'cast'].includes(state)) {
            position.x += facing * 0.95;
            position.y += 1.45;
            this.spawn('slash', {
                position,
                scale: 1.65,
                life: 0.42,
                growth: 1.2,
                spin: -facing * 1.9,
            });

            const burstCount = state === 'combo' ? 7 : state === 'cast' ? 9 : 4;
            for (let index = 0; index < burstCount; index += 1) {
                this.spawn('sparkle', {
                    position,
                    scale: 0.18 + index * 0.035,
                    life: 0.42 + index * 0.05,
                    velocity: new THREE.Vector3(
                        facing * (0.8 + Math.random() * 1.2),
                        0.8 + Math.random() * 1.3,
                        (Math.random() - 0.5) * 0.7
                    ),
                    gravity: 2.2,
                    spin: (Math.random() - 0.5) * 5,
                });
            }
        }

        if (state === 'win' || state === 'celebrate') {
            for (let index = 0; index < 10; index += 1) {
                const angle = (Math.PI * 2 * index) / 10;
                this.spawn(index % 3 === 0 ? 'heart' : 'star', {
                    position,
                    y: 1.5,
                    scale: 0.22 + Math.random() * 0.18,
                    life: 0.9 + Math.random() * 0.5,
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * (0.8 + Math.random() * 1.4),
                        1.1 + Math.random() * 1.7,
                        Math.sin(angle) * 0.65
                    ),
                    gravity: 2.1,
                    spin: (Math.random() - 0.5) * 6,
                });
            }
        }


        if (state === 'dash' || state === 'dodge' || state === 'slide') {
            const direction = this.owner.actionDirection?.clone() ?? new THREE.Vector3(facing, 0, 0);

            for (let index = 0; index < 8; index += 1) {
                this.spawn(index % 3 === 0 ? 'sparkle' : 'dust', {
                    position,
                    scale: 0.2 + Math.random() * 0.18,
                    life: 0.34 + Math.random() * 0.24,
                    velocity: direction.clone().multiplyScalar(-1.4 - Math.random() * 2.2).add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 0.9,
                            0.35 + Math.random() * 0.85,
                            (Math.random() - 0.5) * 0.9
                        )
                    ),
                    gravity: 1.8,
                    growth: 0.7,
                    spin: (Math.random() - 0.5) * 5,
                });
            }
        }

        if (state === 'dance' || state === 'laugh') {
            for (let index = 0; index < 8; index += 1) {
                this.spawn(index % 2 === 0 ? 'note' : 'heart', {
                    position,
                    y: 1.25 + Math.random() * 0.65,
                    scale: 0.2 + Math.random() * 0.16,
                    life: 0.8 + Math.random() * 0.55,
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 1.8,
                        0.8 + Math.random() * 1.4,
                        (Math.random() - 0.5) * 0.55
                    ),
                    gravity: 1.4,
                    spin: (Math.random() - 0.5) * 4,
                });
            }
        }

        if (state === 'wave' || state === 'salute' || state === 'pose' || state === 'spin') {
            for (let index = 0; index < 7; index += 1) {
                const angle = (Math.PI * 2 * index) / 7;
                this.spawn('sparkle', {
                    position,
                    y: 1.25,
                    scale: 0.16 + Math.random() * 0.13,
                    life: 0.65 + Math.random() * 0.4,
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * (0.7 + Math.random()),
                        0.65 + Math.random() * 1.25,
                        Math.sin(angle) * 0.55
                    ),
                    gravity: 1.5,
                    spin: (Math.random() - 0.5) * 6,
                });
            }
        }

        if (state === 'sleep') {
            for (let index = 0; index < 3; index += 1) {
                this.spawn('zzz', {
                    position,
                    y: 1.45 + index * 0.36,
                    scale: 0.2 + index * 0.05,
                    life: 1.1 + index * 0.25,
                    velocity: new THREE.Vector3(0.15 * facing, 0.55 + index * 0.12, 0),
                    growth: 0.25,
                });
            }
        }

        if (state === 'jump' || state === 'takeoff') {
            for (let index = 0; index < 4; index += 1) {
                this.spawn('dust', {
                    position,
                    scale: 0.24 + index * 0.05,
                    life: 0.46,
                    velocity: new THREE.Vector3(
                        (index - 1.5) * 0.48,
                        0.4 + Math.random() * 0.3,
                        (Math.random() - 0.5) * 0.4
                    ),
                    growth: 0.5,
                });
            }
        }
    }

    emitMovementDust(deltaTime, speed) {
        this.dustTimer -= deltaTime;

        if (this.dustTimer > 0 || !this.owner.grounded || speed < 0.4) {
            return;
        }

        this.dustTimer = speed > this.owner.walkSpeed * 1.35 ? 0.085 : 0.16;
        const position = this.owner.group.position.clone();
        const travel = this.owner.velocity.clone();
        travel.y = 0;

        if (travel.lengthSq() < 0.01) {
            travel.set(this.owner.facing, 0, 0);
        } else {
            travel.normalize();
        }

        position.addScaledVector(travel, -0.38);
        const side = new THREE.Vector3(-travel.z, 0, travel.x);
        const backwardSpeed = 0.35 + Math.random() * 0.4;

        this.spawn('dust', {
            position,
            scale: speed > this.owner.walkSpeed * 1.35 ? 0.33 : 0.24,
            life: 0.48,
            velocity: travel
                .clone()
                .multiplyScalar(-backwardSpeed)
                .addScaledVector(side, (Math.random() - 0.5) * 0.45)
                .add(new THREE.Vector3(0, 0.15 + Math.random() * 0.25, 0)),
            growth: 0.55,
        });
    }

    landing(impact = 0) {
        const position = this.owner.group.position.clone();

        if (impact > this.owner.jumpForce * 1.05) {
            this.spawn('impact', {
                position,
                y: 0.18,
                scale: 1.05,
                life: 0.34,
                growth: 1.15,
            });
        }

        const count = impact > this.owner.jumpForce * 1.15 ? 10 : 7;
        for (let index = 0; index < count; index += 1) {
            const direction = index % 2 === 0 ? -1 : 1;
            this.spawn('dust', {
                position,
                scale: 0.23 + Math.random() * 0.12,
                life: 0.55,
                velocity: new THREE.Vector3(
                    direction * (0.5 + Math.random() * 1.5),
                    0.25 + Math.random() * 0.45,
                    (Math.random() - 0.5) * 0.7
                ),
                growth: 0.65,
            });
        }
    }

    skid() {
        const position = this.owner.group.position.clone();
        const direction = this.owner.lastMoveDirection.clone().normalize();
        for (let index = 0; index < 6; index += 1) {
            this.spawn(index % 2 ? 'dust' : 'speed', {
                position,
                scale: 0.2 + index * 0.025,
                life: 0.34 + index * 0.035,
                velocity: direction.clone().multiplyScalar(-1.2 - index * 0.15).add(
                    new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.35, (Math.random() - 0.5) * 0.6)
                ),
                growth: 0.55,
            });
        }
    }

    update(deltaTime, speed) {
        this.time += deltaTime;
        this.ghostTimer -= deltaTime;
        this.emitMovementDust(deltaTime, speed);

        if (['dash', 'slide'].includes(this.owner.state) && this.ghostTimer <= 0) {
            this.ghostTimer = 0.055;
            this.spawnGhost({ life: 0.22, opacity: 0.3 });
        } else if (this.owner.state === 'sprint' && speed > this.owner.runSpeed && this.ghostTimer <= 0) {
            this.ghostTimer = 0.12;
            this.spawnGhost({ life: 0.17, opacity: 0.18 });
        }

        for (let index = this.particles.length - 1; index >= 0; index -= 1) {
            const particle = this.particles[index];
            particle.life -= deltaTime;
            particle.velocity.y -= particle.gravity * deltaTime;
            particle.sprite.position.addScaledVector(
                particle.velocity,
                deltaTime
            );
            particle.sprite.material.rotation += particle.spin * deltaTime;

            const progress = 1 - particle.life / particle.maxLife;
            if (!particle.preserveScale) {
                const scale = particle.startScale * (1 + progress * particle.growth);
                particle.sprite.scale.setScalar(Math.max(scale, 0.001));
            } else {
                particle.sprite.scale.multiplyScalar(1 + particle.growth * deltaTime);
            }
            particle.material.opacity = Math.max(
                0,
                1 - progress * progress
            );

            if (particle.life <= 0) {
                this.scene.remove(particle.sprite);
                if (particle.ownsTexture) {
                    particle.material.map?.dispose();
                }
                particle.material.dispose();
                this.particles.splice(index, 1);
            }
        }
    }

    dispose() {
        this.particles.forEach(({ sprite, material }) => {
            this.scene.remove(sprite);
            if (material.map && !Object.values(this.textures).includes(material.map)) {
                material.map.dispose();
            }
            material.dispose();
        });
        this.particles = [];
        Object.values(this.textures).forEach((texture) => texture.dispose());
    }
}
