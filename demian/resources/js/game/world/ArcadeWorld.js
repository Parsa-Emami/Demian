import * as THREE from 'three';
import { WORLD_CONFIG } from './WorldConfig';
import { OPEN_WORLD_DISTRICTS, createCabinetDefinitions } from './OpenWorldManifest';

const DISTRICTS = Object.freeze(OPEN_WORLD_DISTRICTS.map((district, index) => Object.freeze({
    ...district,
    accent: [0xff4fd8, 0x8b5cf6, 0x22d3ee][index],
})));

export default class ArcadeWorld {
    constructor(scene, { performanceProfile = null, streamingMode = false } = {}) {
        this.scene = scene;
        this.performanceProfile = performanceProfile;
        this.streamingMode = Boolean(streamingMode);
        this.root = new THREE.Group();
        this.root.name = 'DemianV5OpenArcadeWorld';
        this.time = 0;
        this.floaters = [];
        this.animatedSigns = [];
        this.pulseObjects = [];
        this.rotators = [];
        this.textures = [];
        this.materials = [];
        this.geometries = [];
        this.decorDensity = Number(performanceProfile?.decorDensity ?? 0.8);
        this.cabinets = createCabinetDefinitions(this.decorDensity);

        scene.add(this.root);

        this.createFloor();
        this.createRoadNetwork();
        this.createDistricts();
        if (!this.streamingMode) {
            this.createBoundary();
            this.createBackWall();
        }
        this.createArcadeCabinets();
        this.createFloatingPixels();
    }

    canvasTexture(width, height, draw, { smooth = false } = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = smooth;
        draw(context, width, height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
        texture.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
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
        const texture = this.canvasTexture(512, 512, (context, width, height) => {
            context.fillStyle = '#070a18';
            context.fillRect(0, 0, width, height);

            const tile = 32;
            for (let y = 0; y < height; y += tile) {
                for (let x = 0; x < width; x += tile) {
                    const even = (x / tile + y / tile) % 2 === 0;
                    context.fillStyle = even ? '#0e142b' : '#0a1024';
                    context.fillRect(x, y, tile, tile);
                    context.fillStyle = 'rgba(104, 118, 255, .13)';
                    context.fillRect(x, y, tile, 2);
                    context.fillRect(x, y, 2, tile);
                }
            }

            context.strokeStyle = 'rgba(255, 79, 216, .32)';
            context.lineWidth = 4;
            context.strokeRect(4, 4, width - 8, height - 8);
            context.strokeStyle = 'rgba(34, 211, 238, .22)';
            context.lineWidth = 2;
            context.strokeRect(14, 14, width - 28, height - 28);
        });
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(WORLD_CONFIG.width / 16, WORLD_CONFIG.depth / 16);

        const floor = new THREE.Mesh(
            this.geometry(new THREE.PlaneGeometry(WORLD_CONFIG.width, WORLD_CONFIG.depth)),
            this.basicMaterial({ map: texture })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.025;
        floor.renderOrder = 0;
        this.root.add(floor);
    }

    createRoadNetwork() {
        const roadMaterial = this.basicMaterial({
            color: 0x111936,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
        });
        const linePink = this.basicMaterial({
            color: 0xff4fd8,
            transparent: true,
            opacity: 0.36,
            depthWrite: false,
        });
        const lineCyan = this.basicMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
        });

        const roads = [
            { width: WORLD_CONFIG.width - 4, depth: 7.2, x: 0, z: 1 },
            { width: 8, depth: WORLD_CONFIG.depth - 4, x: 0, z: 0 },
            { width: 5.5, depth: WORLD_CONFIG.depth - 8, x: -28, z: 0 },
            { width: 5.5, depth: WORLD_CONFIG.depth - 8, x: 28, z: 0 },
        ];

        roads.forEach((road) => {
            const mesh = new THREE.Mesh(
                this.geometry(new THREE.PlaneGeometry(road.width, road.depth)),
                roadMaterial
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(road.x, 0.006, road.z);
            mesh.renderOrder = 1;
            this.root.add(mesh);
        });

        for (let x = -42; x <= 42; x += 4) {
            const material = x % 8 === 0 ? linePink : lineCyan;
            const marker = new THREE.Mesh(
                this.geometry(new THREE.PlaneGeometry(2.1, 0.11)),
                material
            );
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(x, 0.014, 1);
            marker.renderOrder = 2;
            this.root.add(marker);
            this.pulseObjects.push({ object: marker, material, phase: x * 0.12, baseOpacity: material.opacity });
        }

        for (const x of [-28, 0, 28]) {
            for (let z = -22; z <= 22; z += 4) {
                const marker = new THREE.Mesh(
                    this.geometry(new THREE.PlaneGeometry(0.11, 2)),
                    x === 0 ? linePink : lineCyan
                );
                marker.rotation.x = -Math.PI / 2;
                marker.position.set(x, 0.015, z);
                marker.renderOrder = 2;
                this.root.add(marker);
            }
        }
    }

    createDistricts() {
        DISTRICTS.forEach((district, index) => {
            const ringMaterial = this.basicMaterial({
                color: district.accent,
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
            });
            const ring = new THREE.Mesh(
                this.geometry(new THREE.RingGeometry(5.2, 5.38, 64)),
                ringMaterial
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(district.x, 0.025, district.z);
            ring.renderOrder = 2;
            this.root.add(ring);
            this.rotators.push({ object: ring, material: ringMaterial, speed: index % 2 ? -0.11 : 0.09, phase: index * 1.7 });

            const innerMaterial = this.basicMaterial({
                color: district.accent,
                transparent: true,
                opacity: 0.075,
                depthWrite: false,
            });
            const inner = new THREE.Mesh(
                this.geometry(new THREE.CircleGeometry(5.15, 64)),
                innerMaterial
            );
            inner.rotation.x = -Math.PI / 2;
            inner.position.set(district.x, 0.017, district.z);
            inner.renderOrder = 1;
            this.root.add(inner);

            const signTexture = this.canvasTexture(512, 140, (context, width, height) => {
                context.clearRect(0, 0, width, height);
                context.fillStyle = 'rgba(3, 5, 16, .94)';
                context.fillRect(8, 8, width - 16, height - 16);
                context.strokeStyle = `#${district.accent.toString(16).padStart(6, '0')}`;
                context.lineWidth = 10;
                context.strokeRect(12, 12, width - 24, height - 24);
                context.fillStyle = '#f8fbff';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.font = '900 46px monospace';
                context.fillText(district.label, width / 2, height / 2);
            }, { smooth: true });

            const sign = new THREE.Sprite(this.spriteMaterial({ map: signTexture }));
            sign.scale.set(6.7, 1.82, 1);
            sign.position.set(district.x, 5.4, district.z - 5.4);
            sign.renderOrder = 9;
            this.root.add(sign);
            this.animatedSigns.push({ object: sign, material: sign.material, baseY: sign.position.y, phase: index * 1.4, baseOpacity: 0.94 });
        });
    }

    createBoundary() {
        const railGeometryHorizontal = this.geometry(new THREE.BoxGeometry(WORLD_CONFIG.width, 0.16, 0.16));
        const railGeometryVertical = this.geometry(new THREE.BoxGeometry(0.16, 0.16, WORLD_CONFIG.depth));
        const materials = [
            this.basicMaterial({ color: 0xff4fd8 }),
            this.basicMaterial({ color: 0x22d3ee }),
        ];

        [
            { x: 0, z: -WORLD_CONFIG.depth / 2, geometry: railGeometryHorizontal, material: materials[0] },
            { x: 0, z: WORLD_CONFIG.depth / 2, geometry: railGeometryHorizontal, material: materials[1] },
            { x: -WORLD_CONFIG.width / 2, z: 0, geometry: railGeometryVertical, material: materials[0] },
            { x: WORLD_CONFIG.width / 2, z: 0, geometry: railGeometryVertical, material: materials[1] },
        ].forEach((definition) => {
            const rail = new THREE.Mesh(definition.geometry, definition.material);
            rail.position.set(definition.x, 0.16, definition.z);
            this.root.add(rail);
        });
    }

    createBackWall() {
        const wallTexture = this.canvasTexture(1536, 300, (context, width, height) => {
            const gradient = context.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#070919');
            gradient.addColorStop(1, '#111a36');
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);

            for (let x = 0; x < width; x += 64) {
                context.fillStyle = x % 128 === 0
                    ? 'rgba(255,79,216,.08)'
                    : 'rgba(34,211,238,.05)';
                context.fillRect(x, 0, 2, height);
            }
            for (let y = 24; y < height; y += 32) {
                context.fillStyle = 'rgba(120,130,255,.07)';
                context.fillRect(0, y, width, 2);
            }

            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '900 116px monospace';
            context.shadowColor = '#ff4fd8';
            context.shadowBlur = 24;
            context.fillStyle = '#ffd43b';
            context.fillText('DEMIAN V5', width / 2, 115);
            context.shadowBlur = 0;
            context.font = '900 34px monospace';
            context.fillStyle = '#8ff8ff';
            context.fillText('OPEN ARCADE WORLD · MOBILE FIRST', width / 2, 220);
        }, { smooth: true });

        const wall = new THREE.Mesh(
            this.geometry(new THREE.PlaneGeometry(WORLD_CONFIG.width, 18)),
            this.basicMaterial({ map: wallTexture })
        );
        wall.position.set(0, 8.8, -WORLD_CONFIG.depth / 2 - 0.25);
        wall.renderOrder = 0;
        this.root.add(wall);
    }

    createCabinetTexture(accent, label) {
        return this.canvasTexture(160, 256, (context, width, height) => {
            context.clearRect(0, 0, width, height);
            context.fillStyle = '#080a16';
            context.fillRect(20, 12, 120, 230);
            context.fillStyle = '#151a36';
            context.fillRect(29, 22, 102, 208);
            context.strokeStyle = accent;
            context.lineWidth = 8;
            context.strokeRect(24, 16, 112, 220);
            context.fillStyle = '#02040b';
            context.fillRect(42, 42, 76, 76);
            context.fillStyle = accent;
            context.fillRect(48, 48, 64, 64);
            context.fillStyle = 'rgba(255,255,255,.34)';
            context.fillRect(52, 52, 56, 8);
            context.fillStyle = '#090b19';
            context.fillRect(38, 132, 84, 50);
            context.fillStyle = '#ff4fd8';
            context.fillRect(54, 146, 16, 16);
            context.fillStyle = '#ffd43b';
            context.fillRect(90, 148, 12, 12);
            context.fillStyle = '#eefcff';
            context.textAlign = 'center';
            context.font = '900 18px monospace';
            context.fillText(label, width / 2, 211);
        });
    }

    createArcadeCabinets() {
        this.cabinets.forEach((cabinet) => {
            const sprite = new THREE.Sprite(
                this.spriteMaterial({
                    map: this.createCabinetTexture(cabinet.accent, cabinet.label),
                })
            );
            sprite.name = `ArcadeCabinet:${cabinet.id}`;
            sprite.scale.set(2.3, 3.75, 1);
            sprite.position.set(cabinet.x, 1.86, cabinet.z);
            sprite.renderOrder = 7;
            this.root.add(sprite);
            this.animatedSigns.push({
                object: sprite,
                material: sprite.material,
                baseY: sprite.position.y,
                phase: cabinet.index * 0.54,
                baseOpacity: 0.96,
                bob: 0.035,
            });
        });
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

        const count = Math.max(10, Math.round(34 * this.decorDensity));
        for (let index = 0; index < count; index += 1) {
            const material = this.spriteMaterial({
                map: texture,
                opacity: 0.4 + Math.random() * 0.4,
            });
            material.color.setHSL((index % 5) / 5, 0.8, 0.68);
            const sprite = new THREE.Sprite(material);
            sprite.scale.setScalar(0.11 + Math.random() * 0.18);
            sprite.position.set(
                (Math.random() * 2 - 1) * (WORLD_CONFIG.bounds.x - 2),
                1.2 + Math.random() * 7.5,
                (Math.random() * 2 - 1) * (WORLD_CONFIG.bounds.z - 1)
            );
            sprite.renderOrder = 4;
            this.floaters.push({
                sprite,
                baseY: sprite.position.y,
                baseX: sprite.position.x,
                phase: Math.random() * Math.PI * 2,
                speed: 0.45 + Math.random() * 0.85,
            });
            this.root.add(sprite);
        }
    }

    update(deltaTime) {
        this.time += deltaTime;

        this.animatedSigns.forEach((item) => {
            const pulse = Math.sin(this.time * 2.25 + item.phase);
            item.material.opacity = THREE.MathUtils.clamp(
                item.baseOpacity + pulse * 0.1,
                0.3,
                1
            );
            if (item.bob || item.baseY) {
                item.object.position.y = item.baseY + Math.sin(this.time * 1.55 + item.phase) * (item.bob ?? 0.055);
            }
        });

        this.pulseObjects.forEach((item) => {
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.1 + item.phase);
            item.material.opacity = item.baseOpacity * (0.58 + pulse * 0.72);
            item.object.scale.x = 0.9 + pulse * 0.18;
        });

        this.rotators.forEach((item) => {
            item.object.rotation.z += deltaTime * item.speed;
            item.material.opacity = 0.25 + (0.5 + 0.5 * Math.sin(this.time * 2 + item.phase)) * 0.28;
        });

        this.floaters.forEach((item, index) => {
            item.sprite.position.y = item.baseY + Math.sin(this.time * item.speed + item.phase) * 0.28;
            item.sprite.position.x = item.baseX + Math.sin(this.time * 0.37 + item.phase) * 0.18;
            item.sprite.material.rotation += deltaTime * (index % 2 === 0 ? 0.36 : -0.32);
        });
    }

    dispose() {
        this.scene.remove(this.root);
        this.textures.forEach((texture) => texture.dispose());
        this.materials.forEach((material) => material.dispose());
        this.geometries.forEach((geometry) => geometry.dispose());
    }
}
