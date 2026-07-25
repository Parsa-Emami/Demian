import * as THREE from 'three';

export default class ArcadeWorld {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'Demian2DArcadeWorld';
        this.time = 0;
        this.floaters = [];
        this.animatedSigns = [];
        this.textures = [];
        this.materials = [];
        this.geometries = [];

        scene.add(this.root);

        this.createFloor();
        this.createBackWall();
        this.createStage();
        this.createArcadeCabinets();
        this.createSideDecorations();
        this.createFloatingPixels();
    }

    canvasTexture(width, height, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        draw(context, width, height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        this.textures.push(texture);
        return texture;
    }

    basicMaterial(options) {
        const material = new THREE.MeshBasicMaterial({
            transparent: false,
            toneMapped: false,
            ...options,
        });
        this.materials.push(material);
        return material;
    }

    spriteMaterial(options) {
        const material = new THREE.SpriteMaterial({
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            ...options,
        });
        this.materials.push(material);
        return material;
    }

    geometry(geometry) {
        this.geometries.push(geometry);
        return geometry;
    }

    createFloor() {
        const floorTexture = this.canvasTexture(512, 320, (context, w, h) => {
            context.fillStyle = '#080b1c';
            context.fillRect(0, 0, w, h);

            const tile = 32;
            for (let y = 0; y < h; y += tile) {
                for (let x = 0; x < w; x += tile) {
                    const even = (x / tile + y / tile) % 2 === 0;
                    context.fillStyle = even ? '#10152d' : '#0c1126';
                    context.fillRect(x, y, tile, tile);
                    context.fillStyle = 'rgba(99, 102, 241, 0.12)';
                    context.fillRect(x, y, tile, 2);
                    context.fillRect(x, y, 2, tile);
                }
            }

            context.strokeStyle = '#ff4fd8';
            context.lineWidth = 4;
            context.strokeRect(8, 8, w - 16, h - 16);
            context.strokeStyle = '#22d3ee';
            context.lineWidth = 2;
            context.strokeRect(18, 18, w - 36, h - 36);

            for (let x = 44; x < w; x += 96) {
                context.fillStyle = '#2639a8';
                context.fillRect(x, h / 2 - 3, 52, 6);
                context.fillStyle = '#f04bc2';
                context.fillRect(x + 12, h / 2 - 1, 28, 2);
            }
        });

        const floor = new THREE.Mesh(
            this.geometry(new THREE.PlaneGeometry(30, 19)),
            this.basicMaterial({ map: floorTexture })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.02;
        floor.renderOrder = 0;
        this.root.add(floor);

        const outerGlow = new THREE.Mesh(
            this.geometry(new THREE.RingGeometry(4.2, 4.42, 64)),
            this.basicMaterial({
                color: 0x7847ff,
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
            })
        );
        outerGlow.rotation.x = -Math.PI / 2;
        outerGlow.position.y = 0.025;
        outerGlow.renderOrder = 1;
        this.root.add(outerGlow);
        this.animatedSigns.push({
            object: outerGlow,
            material: outerGlow.material,
            phase: 0,
            baseOpacity: 0.58,
        });
    }

    createBackWall() {
        const wallTexture = this.canvasTexture(1024, 384, (context, w, h) => {
            const gradient = context.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, '#080a1b');
            gradient.addColorStop(1, '#121530');
            context.fillStyle = gradient;
            context.fillRect(0, 0, w, h);

            for (let y = 16; y < h; y += 32) {
                context.fillStyle = 'rgba(117, 128, 255, 0.09)';
                context.fillRect(0, y, w, 2);
            }

            for (let x = 0; x < w; x += 64) {
                context.fillStyle = 'rgba(255, 79, 216, 0.045)';
                context.fillRect(x, 0, 2, h);
            }

            context.fillStyle = '#050714';
            context.fillRect(118, 55, w - 236, 188);
            context.strokeStyle = '#7c3aed';
            context.lineWidth = 12;
            context.strokeRect(118, 55, w - 236, 188);
            context.strokeStyle = '#ff4fd8';
            context.lineWidth = 4;
            context.strokeRect(136, 73, w - 272, 152);

            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '900 106px monospace';
            context.fillStyle = '#ffd43b';
            context.shadowColor = '#ff4fd8';
            context.shadowBlur = 20;
            context.fillText('TIAM', w / 2, 138);
            context.shadowBlur = 0;
            context.font = '900 28px monospace';
            context.fillStyle = '#8ff8ff';
            context.fillText('DEMIAN 2D ARCADE', w / 2, 204);

            context.fillStyle = '#ff4fd8';
            context.fillRect(54, 292, 42, 18);
            context.fillRect(66, 280, 18, 42);
            context.fillStyle = '#22d3ee';
            context.fillRect(w - 96, 292, 42, 18);
            context.fillRect(w - 84, 280, 18, 42);
        });

        const wall = new THREE.Mesh(
            this.geometry(new THREE.PlaneGeometry(31.5, 11.8)),
            this.basicMaterial({ map: wallTexture })
        );
        wall.position.set(0, 5.55, -9.55);
        wall.renderOrder = 0;
        this.root.add(wall);

        const topBar = new THREE.Mesh(
            this.geometry(new THREE.BoxGeometry(31.5, 0.16, 0.16)),
            this.basicMaterial({ color: 0xff4fd8 })
        );
        topBar.position.set(0, 11.38, -9.45);
        this.root.add(topBar);
    }

    createStage() {
        const stageTexture = this.canvasTexture(256, 256, (context, w, h) => {
            context.fillStyle = '#101329';
            context.fillRect(0, 0, w, h);
            context.strokeStyle = '#ff4fd8';
            context.lineWidth = 14;
            context.strokeRect(14, 14, w - 28, h - 28);
            context.strokeStyle = '#22d3ee';
            context.lineWidth = 6;
            context.strokeRect(32, 32, w - 64, h - 64);
            context.fillStyle = 'rgba(255, 212, 59, 0.2)';
            context.fillRect(80, 80, 96, 96);
            context.fillStyle = '#ffd43b';
            context.fillRect(114, 58, 28, 140);
            context.fillRect(58, 114, 140, 28);
        });

        const stage = new THREE.Mesh(
            this.geometry(new THREE.CircleGeometry(4.05, 64)),
            this.basicMaterial({ map: stageTexture })
        );
        stage.rotation.x = -Math.PI / 2;
        stage.position.y = 0.015;
        stage.renderOrder = 1;
        this.root.add(stage);
    }

    createCabinetTexture(accent, label) {
        return this.canvasTexture(160, 256, (context, w, h) => {
            context.clearRect(0, 0, w, h);
            context.fillStyle = '#070914';
            context.fillRect(22, 14, 116, 226);
            context.fillStyle = '#171b36';
            context.fillRect(30, 24, 100, 206);
            context.strokeStyle = accent;
            context.lineWidth = 8;
            context.strokeRect(24, 16, 112, 220);
            context.fillStyle = '#03040b';
            context.fillRect(42, 46, 76, 72);
            context.fillStyle = accent;
            context.fillRect(48, 52, 64, 60);
            context.fillStyle = 'rgba(255,255,255,.36)';
            context.fillRect(52, 56, 56, 8);
            context.fillStyle = '#090b19';
            context.fillRect(38, 132, 84, 50);
            context.fillStyle = '#ff4fd8';
            context.fillRect(54, 146, 16, 16);
            context.fillStyle = '#ffd43b';
            context.fillRect(90, 148, 12, 12);
            context.fillStyle = '#e8f8ff';
            context.textAlign = 'center';
            context.font = '900 18px monospace';
            context.fillText(label, w / 2, 211);
            context.fillStyle = '#0a0c1b';
            context.fillRect(12, 232, 136, 12);
        });
    }

    createArcadeCabinets() {
        const definitions = [
            [-11.3, -6.9, '#ff4fd8', 'PLAY'],
            [-7.9, -7.3, '#8b5cf6', 'JUMP'],
            [7.9, -7.3, '#22d3ee', 'RUN'],
            [11.3, -6.9, '#fbbf24', 'WIN'],
        ];

        definitions.forEach(([x, z, accent, label], index) => {
            const sprite = new THREE.Sprite(
                this.spriteMaterial({
                    map: this.createCabinetTexture(accent, label),
                })
            );
            sprite.scale.set(2.7, 4.35, 1);
            sprite.position.set(x, 2.15, z);
            sprite.renderOrder = 8;
            this.root.add(sprite);

            this.animatedSigns.push({
                object: sprite,
                material: sprite.material,
                phase: index * 0.9,
                baseOpacity: 0.96,
                bob: 0.035,
                baseY: sprite.position.y,
            });
        });
    }

    createSideDecorations() {
        const scoreTexture = this.canvasTexture(320, 128, (context, w, h) => {
            context.clearRect(0, 0, w, h);
            context.fillStyle = 'rgba(4, 6, 18, .92)';
            context.fillRect(4, 4, w - 8, h - 8);
            context.strokeStyle = '#22d3ee';
            context.lineWidth = 8;
            context.strokeRect(8, 8, w - 16, h - 16);
            context.textAlign = 'center';
            context.font = '900 29px monospace';
            context.fillStyle = '#ff4fd8';
            context.fillText('HIGH SCORE', w / 2, 46);
            context.font = '900 38px monospace';
            context.fillStyle = '#ffd43b';
            context.fillText('001337', w / 2, 91);
        });

        const score = new THREE.Sprite(this.spriteMaterial({ map: scoreTexture }));
        score.scale.set(4.5, 1.8, 1);
        score.position.set(-10.8, 5.75, -8.85);
        score.renderOrder = 5;
        this.root.add(score);

        const statusTexture = this.canvasTexture(320, 128, (context, w, h) => {
            context.clearRect(0, 0, w, h);
            context.fillStyle = 'rgba(4, 6, 18, .92)';
            context.fillRect(4, 4, w - 8, h - 8);
            context.strokeStyle = '#ff4fd8';
            context.lineWidth = 8;
            context.strokeRect(8, 8, w - 16, h - 16);
            context.font = '900 28px monospace';
            context.textAlign = 'center';
            context.fillStyle = '#8ff8ff';
            context.fillText('PLAYER 1', w / 2, 43);
            context.font = '900 42px monospace';
            context.fillStyle = '#ff63c7';
            context.fillText('♥ ♥ ♥', w / 2, 94);
        });

        const status = new THREE.Sprite(
            this.spriteMaterial({ map: statusTexture })
        );
        status.scale.set(4.5, 1.8, 1);
        status.position.set(10.8, 5.75, -8.85);
        status.renderOrder = 5;
        this.root.add(status);

        for (const x of [-14.45, 14.45]) {
            const rail = new THREE.Mesh(
                this.geometry(new THREE.BoxGeometry(0.16, 1.2, 18.5)),
                this.basicMaterial({ color: x < 0 ? 0xff4fd8 : 0x22d3ee })
            );
            rail.position.set(x, 0.58, -0.1);
            this.root.add(rail);
        }
    }

    createFloatingPixels() {
        const texture = this.canvasTexture(32, 32, (context) => {
            context.clearRect(0, 0, 32, 32);
            context.fillStyle = '#ffffff';
            context.fillRect(10, 2, 12, 28);
            context.fillRect(2, 10, 28, 12);
            context.fillStyle = '#8ff8ff';
            context.fillRect(12, 6, 8, 20);
            context.fillRect(6, 12, 20, 8);
        });

        for (let index = 0; index < 18; index += 1) {
            const material = this.spriteMaterial({
                map: texture,
                opacity: 0.55 + Math.random() * 0.35,
            });
            material.color.setHSL((index % 4) / 4, 0.78, 0.68);
            const sprite = new THREE.Sprite(material);
            sprite.scale.setScalar(0.12 + Math.random() * 0.18);
            sprite.position.set(
                (Math.random() - 0.5) * 28,
                1.1 + Math.random() * 7.5,
                -8.8 + Math.random() * 17
            );
            sprite.renderOrder = 4;
            this.floaters.push({
                sprite,
                baseY: sprite.position.y,
                baseX: sprite.position.x,
                phase: Math.random() * Math.PI * 2,
                speed: 0.55 + Math.random() * 0.9,
            });
            this.root.add(sprite);
        }
    }

    update(deltaTime) {
        this.time += deltaTime;

        this.animatedSigns.forEach((item) => {
            const pulse = Math.sin(this.time * 2.6 + item.phase);
            item.material.opacity = THREE.MathUtils.clamp(
                item.baseOpacity + pulse * 0.12,
                0.18,
                1
            );

            if (item.bob) {
                item.object.position.y =
                    item.baseY + Math.sin(this.time * 1.8 + item.phase) * item.bob;
            }
        });

        this.floaters.forEach((item, index) => {
            item.sprite.position.y =
                item.baseY + Math.sin(this.time * item.speed + item.phase) * 0.25;
            item.sprite.position.x =
                item.baseX + Math.sin(this.time * 0.42 + item.phase) * 0.12;
            item.sprite.material.rotation +=
                deltaTime * (index % 2 === 0 ? 0.45 : -0.4);
        });
    }

    dispose() {
        this.scene.remove(this.root);
        this.textures.forEach((texture) => texture.dispose());
        this.materials.forEach((material) => material.dispose());
        this.geometries.forEach((geometry) => geometry.dispose());
    }
}
