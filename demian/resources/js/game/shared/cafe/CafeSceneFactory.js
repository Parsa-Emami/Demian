import * as THREE from 'three';
import { markCafeEnvironment } from './CafeEnvironmentContract.js';

function createCanvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    draw(context, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function addMesh(parent, geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function createChair(parent, materials, { x, z, y = 0, rotation = 0 } = {}) {
    const chair = new THREE.Group();
    const wood = materials.wood;
    const cushion = materials.cushion;

    addMesh(chair, new THREE.BoxGeometry(0.9, 0.1, 0.9), wood, { y: 0.9 });
    addMesh(chair, new THREE.BoxGeometry(0.84, 0.08, 0.82), cushion, { y: 0.95, z: 0.02 });
    addMesh(chair, new THREE.BoxGeometry(0.86, 0.9, 0.1), wood, { y: 1.34, z: -0.38 });
    addMesh(chair, new THREE.BoxGeometry(0.86, 0.08, 0.72), wood, { y: 1.6, z: -0.08 });
    [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]].forEach(([cx, cz]) => {
        addMesh(chair, new THREE.BoxGeometry(0.08, 0.9, 0.08), wood, { x: cx, y: 0.45, z: cz });
    });
    chair.position.set(x, y, z);
    chair.rotation.y = rotation;
    parent.add(chair);
}

function createTable(parent, materials, { x, z, width, depth, height = 0.78, topThickness = 0.1, rotation = 0 } = {}) {
    const table = new THREE.Group();
    addMesh(table, new THREE.BoxGeometry(width, topThickness, depth), materials.woodDark, { y: height });
    const legOffsetX = width / 2 - 0.22;
    const legOffsetZ = depth / 2 - 0.22;
    [[-legOffsetX, -legOffsetZ], [legOffsetX, -legOffsetZ], [-legOffsetX, legOffsetZ], [legOffsetX, legOffsetZ]].forEach(([lx, lz]) => {
        addMesh(table, new THREE.BoxGeometry(0.12, height, 0.12), materials.woodDark, { x: lx, y: height / 2, z: lz });
    });
    table.position.set(x, 0, z);
    table.rotation.y = rotation;
    parent.add(table);
    return table;
}

function createPlant(parent, materials, { x, z, scale = 1, height = 1.4 } = {}) {
    const group = new THREE.Group();
    addMesh(group, new THREE.CylinderGeometry(0.34 * scale, 0.4 * scale, 0.48 * scale, 18), materials.pot, { y: 0.24 * scale });
    const stemMaterial = materials.branch;
    for (let index = 0; index < 4; index += 1) {
        const stem = addMesh(group, new THREE.CylinderGeometry(0.03 * scale, 0.04 * scale, height * 0.75, 8), stemMaterial, {
            x: (index - 1.5) * 0.05 * scale,
            y: 0.35 * scale + (height * 0.75) / 2,
            z: (index % 2 === 0 ? -0.05 : 0.05) * scale,
            rz: THREE.MathUtils.degToRad(index * 2 - 3),
            rx: THREE.MathUtils.degToRad(index - 1.5),
        });
        stem.userData.decorative = true;
    }
    for (let layer = 0; layer < 4; layer += 1) {
        const leafCount = 5 + layer;
        for (let index = 0; index < leafCount; index += 1) {
            const angle = (index / leafCount) * Math.PI * 2 + layer * 0.3;
            const radius = 0.17 * scale + layer * 0.07 * scale;
            const leaf = addMesh(group, new THREE.SphereGeometry(0.12 * scale, 10, 8), materials.leaf, {
                x: Math.cos(angle) * radius,
                y: 0.85 * scale + layer * 0.25 * scale,
                z: Math.sin(angle) * radius,
                sx: 1.5,
                sy: 0.5,
                sz: 0.9,
                rz: angle,
            });
            leaf.userData.decorative = true;
        }
    }
    group.position.set(x, 0, z);
    parent.add(group);
    return group;
}

function createShelfBooks(parent, materials, { x, y, z, width = 8.4 } = {}) {
    const shelfGroup = new THREE.Group();
    const supports = [-width / 2 + 0.35, 0, width / 2 - 0.35];
    supports.forEach((offset) => {
        addMesh(shelfGroup, new THREE.BoxGeometry(0.12, 6.5, 0.12), materials.metal, { x: offset, y: 3.2, z: 0 });
    });
    const shelfYs = [0.6, 1.9, 3.2, 4.5];
    shelfYs.forEach((offsetY, row) => {
        addMesh(shelfGroup, new THREE.BoxGeometry(width, 0.13, 0.52), materials.wood, { y: offsetY, z: 0 });
        const start = -width / 2 + 0.7;
        const bookCount = 9 + row;
        for (let index = 0; index < bookCount; index += 1) {
            const hue = (index * 0.09 + row * 0.07) % 1;
            const color = new THREE.Color().setHSL(hue, 0.38, 0.62);
            const bookMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.03 });
            addMesh(shelfGroup, new THREE.BoxGeometry(0.18 + (index % 3) * 0.05, 0.34 + (index % 4) * 0.1, 0.18), bookMaterial, {
                x: start + index * (width - 1.4) / Math.max(1, bookCount - 1),
                y: offsetY + 0.18,
                z: 0.02,
                rz: THREE.MathUtils.degToRad((index % 4) - 1.5),
            });
        }
    });
    shelfGroup.position.set(x, y, z);
    parent.add(shelfGroup);
}

function createSofa(parent, materials, { x, z, width = 4, depth = 1.2, rotation = 0 } = {}) {
    const sofa = new THREE.Group();
    addMesh(sofa, new THREE.BoxGeometry(width, 0.42, depth), materials.sofa, { y: 0.42 });
    addMesh(sofa, new THREE.BoxGeometry(width, 0.7, 0.18), materials.sofa, { y: 0.82, z: -depth / 2 + 0.08 });
    addMesh(sofa, new THREE.BoxGeometry(0.18, 0.62, depth - 0.04), materials.sofa, { x: -width / 2 + 0.09, y: 0.72 });
    addMesh(sofa, new THREE.BoxGeometry(0.18, 0.62, depth - 0.04), materials.sofa, { x: width / 2 - 0.09, y: 0.72 });
    for (let index = 0; index < Math.max(2, Math.floor(width)); index += 1) {
        addMesh(sofa, new THREE.BoxGeometry(Math.min(1.1, width / 2.4), 0.22, 0.5), materials.sofaCushion, {
            x: -width / 2 + 0.7 + index * Math.min(1.0, width / Math.max(2, Math.floor(width))),
            y: 0.74,
            z: 0.0,
        });
    }
    sofa.position.set(x, 0, z);
    sofa.rotation.y = rotation;
    parent.add(sofa);
}

function createLamp(parent, materials, { x, z, height = 1.8 } = {}) {
    const lamp = new THREE.Group();
    addMesh(lamp, new THREE.CylinderGeometry(0.04, 0.04, height, 10), materials.black, { y: height / 2 });
    addMesh(lamp, new THREE.CylinderGeometry(0.22, 0.28, 0.05, 14), materials.black, { y: 0.02 });
    addMesh(lamp, new THREE.CylinderGeometry(0.22, 0.36, 0.36, 18, 1, true), materials.shade, { y: height - 0.2 });
    const glow = addMesh(lamp, new THREE.SphereGeometry(0.11, 10, 8), materials.warmLight, { y: height - 0.25 });
    glow.material.emissiveIntensity = 1.8;
    lamp.position.set(x, 0, z);
    parent.add(lamp);
}

function createSconce(parent, materials, { x, y, z, rotationY = 0 } = {}) {
    const group = new THREE.Group();
    addMesh(group, new THREE.BoxGeometry(0.08, 0.22, 0.08), materials.black, { y: 0.22 });
    addMesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.48, 8), materials.black, { y: 0.05, rz: Math.PI / 2, x: 0.16 });
    const bulbA = addMesh(group, new THREE.SphereGeometry(0.08, 10, 8), materials.warmLight, { x: 0.3, y: 0.34, z: 0.18 });
    const bulbB = addMesh(group, new THREE.SphereGeometry(0.08, 10, 8), materials.warmLight, { x: 0.3, y: 0.34, z: -0.18 });
    bulbA.material.emissiveIntensity = 1.9;
    bulbB.material.emissiveIntensity = 1.9;
    group.position.set(x, y, z);
    group.rotation.y = rotationY;
    parent.add(group);
}

export function createCafeEnvironment(scene, { includeCeiling = false } = {}) {
    const group = new THREE.Group();
    group.name = 'ReferenceCafeEnvironment';

    const floorTexture = createCanvasTexture(1024, 1024, (context, width, height) => {
        context.fillStyle = '#d8d4ca';
        context.fillRect(0, 0, width, height);
        const tile = 128;
        context.strokeStyle = 'rgba(120, 118, 112, 0.28)';
        context.lineWidth = 4;
        for (let x = 0; x <= width; x += tile) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        for (let y = 0; y <= height; y += tile) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }
        for (let i = 0; i < 800; i += 1) {
            const alpha = Math.random() * 0.05;
            context.fillStyle = `rgba(255,255,255,${alpha})`;
            context.fillRect(Math.random() * width, Math.random() * height, 3 + Math.random() * 12, 3 + Math.random() * 12);
        }
    });
    floorTexture.repeat.set(4, 3);

    const wallTexture = createCanvasTexture(1024, 1024, (context, width, height) => {
        context.fillStyle = '#6b6c68';
        context.fillRect(0, 0, width, height);
        for (let i = 0; i < 2200; i += 1) {
            const alpha = 0.015 + Math.random() * 0.03;
            const tone = 98 + Math.floor(Math.random() * 30);
            context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
            const size = 8 + Math.random() * 28;
            context.fillRect(Math.random() * width, Math.random() * height, size, size * (0.2 + Math.random() * 0.8));
        }
    });
    wallTexture.repeat.set(2.4, 1.6);

    const ceilingTexture = createCanvasTexture(1024, 1024, (context, width, height) => {
        context.fillStyle = '#f2f2ea';
        context.fillRect(0, 0, width, height);
        const cell = 64;
        context.strokeStyle = 'rgba(0,0,0,0.55)';
        context.lineWidth = 2.5;
        for (let x = 0; x <= width; x += cell) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        for (let y = 0; y <= height; y += cell) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }
        context.fillStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 900; i += 1) {
            context.fillRect(Math.random() * width, Math.random() * height, 2, 2);
        }
    });
    ceilingTexture.repeat.set(3.5, 2.6);

    const rugTexture = createCanvasTexture(512, 512, (context, width, height) => {
        context.fillStyle = '#5a1521';
        context.fillRect(0, 0, width, height);
        context.strokeStyle = '#8d3f4a';
        context.lineWidth = 18;
        context.strokeRect(18, 18, width - 36, height - 36);
        context.strokeStyle = '#c49a68';
        context.lineWidth = 6;
        context.strokeRect(42, 42, width - 84, height - 84);
        context.strokeStyle = 'rgba(196,154,104,0.35)';
        context.lineWidth = 2;
        for (let y = 72; y < height - 72; y += 24) {
            context.beginPath();
            context.moveTo(62, y);
            context.lineTo(width - 62, y);
            context.stroke();
        }
    });

    const tileTexture = createCanvasTexture(512, 256, (context, width, height) => {
        context.fillStyle = '#3fa37e';
        context.fillRect(0, 0, width, height);
        const cell = 32;
        context.strokeStyle = 'rgba(255,255,255,0.68)';
        context.lineWidth = 2;
        for (let x = 0; x <= width; x += cell) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        for (let y = 0; y <= height; y += cell) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }
        for (let i = 0; i < 80; i += 1) {
            context.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
            context.fillRect(Math.random() * width, Math.random() * height, 18 + Math.random() * 22, 10 + Math.random() * 18);
        }
    });
    tileTexture.repeat.set(2.5, 1.1);

    const materials = {
        floor: new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.97, metalness: 0.02 }),
        wall: new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.96, metalness: 0.01 }),
        ceiling: new THREE.MeshStandardMaterial({ map: ceilingTexture, roughness: 0.9, metalness: 0.02 }),
        wood: new THREE.MeshStandardMaterial({ color: 0xa86e3d, roughness: 0.62, metalness: 0.06 }),
        woodDark: new THREE.MeshStandardMaterial({ color: 0x73472b, roughness: 0.64, metalness: 0.08 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0xcdcdc5, roughness: 0.96, metalness: 0.02 }),
        black: new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.72, metalness: 0.22 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x1f2227, roughness: 0.56, metalness: 0.52 }),
        glass: new THREE.MeshStandardMaterial({ color: 0xd7ecf0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 }),
        leaf: new THREE.MeshStandardMaterial({ color: 0x5f8055, roughness: 0.84, metalness: 0.02 }),
        pot: new THREE.MeshStandardMaterial({ color: 0x222629, roughness: 0.88, metalness: 0.08 }),
        branch: new THREE.MeshStandardMaterial({ color: 0x6b5b48, roughness: 0.92, metalness: 0.01 }),
        sofa: new THREE.MeshStandardMaterial({ color: 0x394047, roughness: 0.94, metalness: 0.02 }),
        sofaCushion: new THREE.MeshStandardMaterial({ color: 0x4b525b, roughness: 0.96, metalness: 0.01 }),
        cushion: new THREE.MeshStandardMaterial({ color: 0xb1a49a, roughness: 0.96, metalness: 0.01 }),
        frame: new THREE.MeshStandardMaterial({ color: 0x6f492f, roughness: 0.58, metalness: 0.12 }),
        warmLight: new THREE.MeshStandardMaterial({ color: 0xffe4af, emissive: 0xffd279, emissiveIntensity: 1.4, roughness: 0.18 }),
        shade: new THREE.MeshStandardMaterial({ color: 0xe1d2b9, roughness: 0.82, metalness: 0.03 }),
        mirror: new THREE.MeshStandardMaterial({ color: 0xa1b0b7, metalness: 0.88, roughness: 0.16 }),
        rug: new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 0.96, metalness: 0.01 }),
        greenTile: new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.9, metalness: 0.02 }),
    };

    const floor = addMesh(group, new THREE.PlaneGeometry(48, 36), materials.floor, { rx: -Math.PI / 2, y: 0 });
    floor.receiveShadow = true;

    const wallHeight = 4.2;
    const cameraOccluders = {
        north: [addMesh(group, new THREE.BoxGeometry(48, wallHeight, 0.4), materials.wall, { x: 0, y: wallHeight / 2, z: -18.1 })],
        west: [addMesh(group, new THREE.BoxGeometry(0.4, wallHeight, 36), materials.wall, { x: -24.1, y: wallHeight / 2, z: 0 })],
        east: [addMesh(group, new THREE.BoxGeometry(0.4, wallHeight, 36), materials.wall, { x: 24.1, y: wallHeight / 2, z: 0 })],
        south: [
            addMesh(group, new THREE.BoxGeometry(18, wallHeight, 0.4), materials.wall, { x: -15, y: wallHeight / 2, z: 18.1 }),
            addMesh(group, new THREE.BoxGeometry(18, wallHeight, 0.4), materials.wall, { x: 15, y: wallHeight / 2, z: 18.1 }),
        ],
        ceiling: [],
    };

    if (includeCeiling) {
        cameraOccluders.ceiling.push(
            addMesh(group, new THREE.PlaneGeometry(48, 36), materials.ceiling, { rx: Math.PI / 2, y: wallHeight - 0.02 })
        );
    }

    group.userData.cameraOccluders = cameraOccluders;
    group.userData.cafeBounds = Object.freeze({ minX: -24, maxX: 24, minZ: -18, maxZ: 18, wallHeight });
    markCafeEnvironment(group);

    [-7.2, 7.2].forEach((x) => {
        addMesh(group, new THREE.BoxGeometry(1.4, wallHeight, 1.4), materials.concrete, { x, y: wallHeight / 2, z: 0.5 });
        addMesh(group, new THREE.BoxGeometry(1.4, wallHeight, 1.4), materials.concrete, { x, y: wallHeight / 2, z: -8.2 });
    });

    addMesh(group, new THREE.BoxGeometry(48, 0.2, 2.2), materials.wall, { x: 0, y: 3.1, z: -3.2 });
    addMesh(group, new THREE.BoxGeometry(48, 0.2, 2.2), materials.wall, { x: 0, y: 3.1, z: -13.4 });

    const entranceFrame = new THREE.Group();
    addMesh(entranceFrame, new THREE.BoxGeometry(12, 0.16, 0.12), materials.black, { y: 3.6, z: 17.84 });
    addMesh(entranceFrame, new THREE.BoxGeometry(0.12, 3.6, 0.12), materials.black, { x: -6, y: 1.8, z: 17.84 });
    addMesh(entranceFrame, new THREE.BoxGeometry(0.12, 3.6, 0.12), materials.black, { x: 6, y: 1.8, z: 17.84 });
    addMesh(entranceFrame, new THREE.BoxGeometry(0.12, 3.6, 0.12), materials.black, { x: 0, y: 1.8, z: 17.84 });
    addMesh(entranceFrame, new THREE.PlaneGeometry(5.85, 3.35), materials.glass, { x: -3.0, y: 1.72, z: 17.77 });
    addMesh(entranceFrame, new THREE.PlaneGeometry(5.85, 3.35), materials.glass, { x: 3.0, y: 1.72, z: 17.77 });
    group.add(entranceFrame);

    createPlant(group, materials, { x: -15.0, z: 15.5, scale: 1.1, height: 1.7 });
    createPlant(group, materials, { x: 0.0, z: 15.7, scale: 1.35, height: 1.9 });
    createPlant(group, materials, { x: 14.8, z: 15.5, scale: 1.15, height: 1.75 });
    createPlant(group, materials, { x: 19.8, z: 8.5, scale: 1.25, height: 1.55 });
    createPlant(group, materials, { x: 15.6, z: -3.2, scale: 0.95, height: 1.35 });
    createPlant(group, materials, { x: -19.4, z: 2.8, scale: 0.75, height: 1.2 });
    createPlant(group, materials, { x: -21.2, z: 8.4, scale: 0.95, height: 1.1 });
    createPlant(group, materials, { x: -4.9, z: 3.9, scale: 1.0, height: 1.8 });

    const counter = new THREE.Group();
    addMesh(counter, new THREE.BoxGeometry(13.6, 1.05, 2.3), materials.concrete, { x: 15.8, y: 0.53, z: 8.0 });
    addMesh(counter, new THREE.BoxGeometry(2.3, 1.05, 17.3), materials.concrete, { x: 11.65, y: 0.53, z: 1.6 });
    addMesh(counter, new THREE.BoxGeometry(13.9, 0.12, 2.55), materials.woodDark, { x: 15.8, y: 1.12, z: 8.0 });
    addMesh(counter, new THREE.BoxGeometry(2.55, 0.12, 17.6), materials.woodDark, { x: 11.65, y: 1.12, z: 1.6 });
    addMesh(counter, new THREE.BoxGeometry(11.8, 1.15, 0.2), materials.greenTile, { x: 16.2, y: 1.35, z: -0.92 });
    addMesh(counter, new THREE.BoxGeometry(11.8, 0.18, 0.5), materials.wood, { x: 16.2, y: 2.28, z: -0.8 });
    for (let i = 0; i < 10; i += 1) {
        const bottleMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.03 * i, 0.5, 0.3 + (i % 3) * 0.1), roughness: 0.32, metalness: 0.18 });
        addMesh(counter, new THREE.CylinderGeometry(0.1, 0.1, 0.5 + (i % 2) * 0.05, 10), bottleMaterial, { x: 11.8 + i * 0.9, y: 2.6, z: -0.75 });
    }
    addMesh(counter, new THREE.BoxGeometry(1.4, 0.92, 0.9), materials.black, { x: 12.9, y: 1.58, z: 8.15 });
    addMesh(counter, new THREE.BoxGeometry(1.2, 0.78, 0.7), materials.black, { x: 12.3, y: 1.52, z: 4.0 });
    addMesh(counter, new THREE.BoxGeometry(1.9, 1.25, 0.9), materials.metal, { x: 13.6, y: 1.72, z: 2.1 });
    addMesh(counter, new THREE.BoxGeometry(1.8, 1.15, 1.6), materials.black, { x: -19.0, y: 0.62, z: 10.2 });
    group.add(counter);

    addMesh(group, new THREE.BoxGeometry(1.25, 3.0, 0.48), materials.concrete, { x: -18.0, y: 2.2, z: 2.7 });

    createShelfBooks(group, materials, { x: -10.7, y: 0.2, z: 4.0, width: 8.6 });

    createTable(group, materials, { x: -11.5, z: 7.7, width: 6.8, depth: 11.6, height: 0.8 });
    const communalChairPositions = [
        [-15.5, 12.0, 0], [-12.8, 12.0, 0], [-10.2, 12.0, 0], [-7.6, 12.0, 0],
        [-15.5, 3.4, Math.PI], [-12.8, 3.4, Math.PI], [-10.2, 3.4, Math.PI], [-7.6, 3.4, Math.PI],
        [-16.2, 10.0, Math.PI / 2], [-16.2, 7.6, Math.PI / 2], [-16.2, 5.2, Math.PI / 2],
        [-6.8, 10.0, -Math.PI / 2], [-6.8, 7.6, -Math.PI / 2], [-6.8, 5.2, -Math.PI / 2],
    ];
    communalChairPositions.forEach(([x, z, rotation]) => createChair(group, materials, { x, z, rotation }));
    addMesh(group, new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa03e3f, roughness: 0.82 }), { x: -11.4, y: 0.95, z: 7.7, sx: 1.0, sy: 0.9, sz: 1.0 });

    const merchShelf = new THREE.Group();
    addMesh(merchShelf, new THREE.BoxGeometry(2.1, 0.12, 0.7), materials.wood, { y: 0.6 });
    addMesh(merchShelf, new THREE.BoxGeometry(2.1, 0.12, 0.7), materials.wood, { y: 1.3 });
    addMesh(merchShelf, new THREE.BoxGeometry(2.1, 0.12, 0.7), materials.wood, { y: 2.0 });
    addMesh(merchShelf, new THREE.BoxGeometry(0.08, 2.3, 0.08), materials.metal, { x: -0.95, y: 1.15 });
    addMesh(merchShelf, new THREE.BoxGeometry(0.08, 2.3, 0.08), materials.metal, { x: 0.95, y: 1.15 });
    addMesh(merchShelf, new THREE.BoxGeometry(0.08, 2.3, 0.08), materials.metal, { x: -0.3, y: 1.15 });
    addMesh(merchShelf, new THREE.BoxGeometry(0.08, 2.3, 0.08), materials.metal, { x: 0.3, y: 1.15 });
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 5; col += 1) {
            const productMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL((row * 0.18 + col * 0.09) % 1, 0.42, 0.66),
                roughness: 0.68,
                metalness: 0.06,
            });
            addMesh(merchShelf, new THREE.BoxGeometry(0.22 + (col % 2) * 0.08, 0.3 + (row % 2) * 0.08, 0.18), productMaterial, {
                x: -0.8 + col * 0.4,
                y: 0.82 + row * 0.7,
                z: 0.0,
            });
        }
    }
    merchShelf.position.set(-18.5, 0.0, 12.6);
    group.add(merchShelf);

    const mirror = new THREE.Group();
    addMesh(mirror, new THREE.BoxGeometry(1.3, 2.35, 0.1), materials.frame, { y: 1.2 });
    addMesh(mirror, new THREE.BoxGeometry(1.0, 2.0, 0.04), materials.mirror, { y: 1.2, z: 0.06 });
    mirror.position.set(-2.9, 0.0, -0.2);
    mirror.rotation.y = THREE.MathUtils.degToRad(-4);
    group.add(mirror);

    const rug = addMesh(group, new THREE.PlaneGeometry(10.5, 6.2), materials.rug, { x: 5.2, y: 0.012, z: -1.8, rx: -Math.PI / 2 });
    rug.receiveShadow = true;

    createTable(group, materials, { x: 5.6, z: -1.6, width: 4.1, depth: 2.5, height: 0.74 });
    [[3.1, -0.2, 0.4], [8.1, -0.2, -0.5], [3.1, -3.0, 1.8], [8.0, -3.0, -2.1]].forEach(([x, z, rotation]) => {
        createChair(group, materials, { x, z, rotation });
    });

    createTable(group, materials, { x: -8.5, z: -7.5, width: 2.7, depth: 2.7, height: 0.72 });
    createChair(group, materials, { x: -10.4, z: -7.5, rotation: Math.PI / 2 });
    createChair(group, materials, { x: -6.6, z: -7.5, rotation: -Math.PI / 2 });
    createChair(group, materials, { x: -8.5, z: -5.6, rotation: 0 });
    createChair(group, materials, { x: -8.5, z: -9.4, rotation: Math.PI });

    createTable(group, materials, { x: 10.8, z: -7.8, width: 2.7, depth: 2.7, height: 0.72 });
    createChair(group, materials, { x: 8.9, z: -7.8, rotation: Math.PI / 2 });
    createChair(group, materials, { x: 12.7, z: -7.8, rotation: -Math.PI / 2 });
    createChair(group, materials, { x: 10.8, z: -5.9, rotation: 0 });
    createChair(group, materials, { x: 10.8, z: -9.7, rotation: Math.PI });

    createSofa(group, materials, { x: -18.1, z: -6.2, width: 2.2, depth: 9.8, rotation: Math.PI / 2 });
    createSofa(group, materials, { x: -14.3, z: -11.9, width: 2.25, depth: 2.25, rotation: 0 });
    createSofa(group, materials, { x: -9.1, z: -14.25, width: 7.9, depth: 2.2, rotation: 0 });
    createTable(group, materials, { x: -11.0, z: -10.3, width: 2.9, depth: 1.5, height: 0.46 });
    createLamp(group, materials, { x: -15.2, z: -8.9, height: 1.7 });

    createSconce(group, materials, { x: -23.7, y: 2.2, z: -8.3, rotationY: Math.PI / 2 });
    createSconce(group, materials, { x: -23.7, y: 2.2, z: -13.4, rotationY: Math.PI / 2 });
    createLamp(group, materials, { x: 18.1, z: -8.0, height: 1.75 });

    const frameColors = [0xb87a52, 0x956041, 0x7d4a2f];
    [0, 1, 2].forEach((index) => {
        const x = 5.5 + index * 1.8;
        const frame = addMesh(group, new THREE.BoxGeometry(1.3, 1.8, 0.08), materials.frame, { x, y: 2.2, z: -2.9 });
        addMesh(group, new THREE.BoxGeometry(0.95, 1.45, 0.03), new THREE.MeshStandardMaterial({ color: frameColors[index], roughness: 0.88 }), { x, y: 2.2, z: -2.84 });
        frame.userData.decorative = true;
    });

    const linearLightMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f5eb, emissive: 0xfff4d0, emissiveIntensity: 1.6, roughness: 0.22, metalness: 0.04 });
    addMesh(group, new THREE.BoxGeometry(0.15, 0.15, 8.4), linearLightMaterial, { x: 2.5, y: 3.7, z: -0.8, rz: THREE.MathUtils.degToRad(28) });
    addMesh(group, new THREE.BoxGeometry(0.15, 0.15, 6.2), linearLightMaterial, { x: 16.4, y: 3.7, z: 7.8, rz: Math.PI / 2 });

    const signMaterial = new THREE.MeshStandardMaterial({ color: 0x212225, roughness: 0.72, metalness: 0.12 });
    addMesh(group, new THREE.BoxGeometry(0.12, 1.2, 4.2), signMaterial, { x: 11.4, y: 3.0, z: 8.2, rz: THREE.MathUtils.degToRad(90) });

    scene.add(group);
    return group;
}


/**
 * Prevents the outside wall or ceiling from covering the café when a gameplay
 * camera follows a character from beyond the room bounds.
 */
export function updateCafeEnvironmentVisibility(environment, camera) {
    const occluders = environment?.userData?.cameraOccluders;
    const bounds = environment?.userData?.cafeBounds;
    if (!occluders || !bounds || !camera?.position) return;

    const setVisible = (items, visible) => items?.forEach?.((item) => { item.visible = visible; });
    const margin = 0.35;
    setVisible(occluders.south, camera.position.z <= bounds.maxZ - margin);
    setVisible(occluders.north, camera.position.z >= bounds.minZ + margin);
    setVisible(occluders.west, camera.position.x >= bounds.minX + margin);
    setVisible(occluders.east, camera.position.x <= bounds.maxX - margin);
    setVisible(occluders.ceiling, camera.position.y < bounds.wallHeight - 0.15);
}
