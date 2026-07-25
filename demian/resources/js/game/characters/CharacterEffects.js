import * as THREE from 'three';

export default class CharacterEffects {
    constructor(scene, owner) {
        this.scene = scene;
        this.owner = owner;
        this.time = 0;
        this.dustTimer = 0;
        this.particles = [];
        this.textures = {
            dust: this.createTexture('dust'),
            star: this.createTexture('star'),
            heart: this.createTexture('heart'),
            slash: this.createTexture('slash'),
            sparkle: this.createTexture('sparkle'),
        };
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
        });
    }

    onStateChanged(state, facing) {
        const position = this.owner.group.position.clone();

        if (state === 'attack') {
            position.x += facing * 0.95;
            position.y += 1.45;
            this.spawn('slash', {
                position,
                scale: 1.65,
                life: 0.42,
                growth: 1.2,
                spin: -facing * 1.9,
            });

            for (let index = 0; index < 4; index += 1) {
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

        if (state === 'win') {
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

        if (state === 'jump') {
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
        position.x -= this.owner.facing * 0.35;

        this.spawn('dust', {
            position,
            scale: speed > this.owner.walkSpeed * 1.35 ? 0.33 : 0.24,
            life: 0.48,
            velocity: new THREE.Vector3(
                -this.owner.facing * (0.35 + Math.random() * 0.4),
                0.15 + Math.random() * 0.25,
                (Math.random() - 0.5) * 0.35
            ),
            growth: 0.55,
        });
    }

    landing() {
        const position = this.owner.group.position.clone();

        for (let index = 0; index < 7; index += 1) {
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

    update(deltaTime, speed) {
        this.time += deltaTime;
        this.emitMovementDust(deltaTime, speed);

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
            const scale =
                particle.startScale * (1 + progress * particle.growth);
            particle.sprite.scale.setScalar(Math.max(scale, 0.001));
            particle.material.opacity = Math.max(
                0,
                1 - progress * progress
            );

            if (particle.life <= 0) {
                this.scene.remove(particle.sprite);
                particle.material.dispose();
                this.particles.splice(index, 1);
            }
        }
    }

    dispose() {
        this.particles.forEach(({ sprite, material }) => {
            this.scene.remove(sprite);
            material.dispose();
        });
        this.particles = [];
        Object.values(this.textures).forEach((texture) => texture.dispose());
    }
}
