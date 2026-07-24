import * as THREE from 'three';

export default class TiamCharacter {
    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'Tiam';

        this.velocity = new THREE.Vector3();
        this.state = 'IDLE';
        this.animationTime = 0;
        this.bounds = 18;

        this.build();
    }

    build() {
        this.colors = {
            skin: '#d8a07a',
            hair: '#151515',
            bandana: '#0f0f10',
            shirt: '#1a2246',
            pants: '#5e6168',
            shoes: '#1f1f23',
            sole: '#f5f5f5',
            metal: '#cfd4da',
            accent: '#ef7a9a',
        };

        this.bodyRoot = new THREE.Group();
        this.group.add(this.bodyRoot);

        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.95, 32),
            new THREE.MeshBasicMaterial({
                color: '#000000',
                transparent: true,
                opacity: 0.18,
            })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        this.group.add(shadow);

        this.createLegs();
        this.createTorso();
        this.createArms();
        this.createHead();
    }

    createLegs() {
        this.leftLegPivot = new THREE.Group();
        this.rightLegPivot = new THREE.Group();

        this.leftLegPivot.position.set(-0.33, 1.78, 0);
        this.rightLegPivot.position.set(0.33, 1.78, 0);

        const leftLeg = this.createBox(0.62, 1.75, 0.72, this.colors.pants);
        const rightLeg = this.createBox(0.62, 1.75, 0.72, this.colors.pants);

        leftLeg.position.y = -0.88;
        rightLeg.position.y = -0.88;

        const leftShoe = this.createBox(0.78, 0.38, 1.08, this.colors.shoes);
        const rightShoe = this.createBox(0.78, 0.38, 1.08, this.colors.shoes);

        const leftSole = this.createBox(0.8, 0.1, 1.12, this.colors.sole);
        const rightSole = this.createBox(0.8, 0.1, 1.12, this.colors.sole);

        leftShoe.position.set(0, -1.77, 0.15);
        rightShoe.position.set(0, -1.77, 0.15);

        leftSole.position.set(0, -1.98, 0.15);
        rightSole.position.set(0, -1.98, 0.15);

        this.leftLegPivot.add(leftLeg, leftShoe, leftSole);
        this.rightLegPivot.add(rightLeg, rightShoe, rightSole);

        this.bodyRoot.add(this.leftLegPivot, this.rightLegPivot);
    }

    createTorso() {
        this.torso = this.createBox(1.82, 2.22, 1.02, this.colors.shirt);
        this.torso.position.set(0, 2.95, 0);
        this.bodyRoot.add(this.torso);

        const frontLabel = this.createTextPlane('NO 61', 0.9, 0.28, this.colors.accent);
        frontLabel.position.set(0, 3.07, 0.53);
        this.bodyRoot.add(frontLabel);

        const backLabel = this.createTextPlane('1UP', 0.78, 0.26, '#ffffff');
        backLabel.position.set(0, 3.05, -0.53);
        backLabel.rotation.y = Math.PI;
        this.bodyRoot.add(backLabel);

        const watch = this.createBox(0.28, 0.18, 0.32, '#111827');
        watch.position.set(0.95, 2.08, 0);
        this.bodyRoot.add(watch);
    }

    createArms() {
        this.leftArmPivot = new THREE.Group();
        this.rightArmPivot = new THREE.Group();

        this.leftArmPivot.position.set(-1.08, 3.65, 0);
        this.rightArmPivot.position.set(1.08, 3.65, 0);

        const leftArm = this.createBox(0.44, 1.64, 0.54, this.colors.skin);
        const rightArm = this.createBox(0.44, 1.64, 0.54, this.colors.skin);

        leftArm.position.y = -0.82;
        rightArm.position.y = -0.82;

        const leftHand = this.createBox(0.38, 0.36, 0.42, this.colors.skin);
        const rightHand = this.createBox(0.38, 0.36, 0.42, this.colors.skin);

        leftHand.position.y = -1.68;
        rightHand.position.y = -1.68;

        const sleeveLeft = this.createBox(0.54, 0.52, 0.62, this.colors.shirt);
        const sleeveRight = this.createBox(0.54, 0.52, 0.62, this.colors.shirt);

        sleeveLeft.position.y = -0.15;
        sleeveRight.position.y = -0.15;

        this.leftArmPivot.add(leftArm, leftHand, sleeveLeft);
        this.rightArmPivot.add(rightArm, rightHand, sleeveRight);

        this.bodyRoot.add(this.leftArmPivot, this.rightArmPivot);
    }

    createHead() {
        this.headRoot = new THREE.Group();
        this.headRoot.position.set(0, 4.75, 0);
        this.bodyRoot.add(this.headRoot);

        const head = this.createBox(1.42, 1.42, 1.2, this.colors.skin);
        this.headRoot.add(head);

        const bandanaTop = this.createBox(1.52, 0.42, 1.3, this.colors.bandana);
        bandanaTop.position.set(0, 0.58, 0);
        this.headRoot.add(bandanaTop);

        const bandanaBack = this.createBox(1.35, 1.0, 0.28, this.colors.bandana);
        bandanaBack.position.set(0, 0.1, -0.73);
        this.headRoot.add(bandanaBack);

        const bandanaTailLeft = this.createBox(0.18, 0.46, 0.12, this.colors.bandana);
        const bandanaTailRight = this.createBox(0.18, 0.46, 0.12, this.colors.bandana);

        bandanaTailLeft.position.set(-0.16, -0.35, -0.83);
        bandanaTailRight.position.set(0.16, -0.35, -0.83);

        bandanaTailLeft.rotation.z = -0.45;
        bandanaTailRight.rotation.z = 0.45;

        this.headRoot.add(bandanaTailLeft, bandanaTailRight);

        const hairBack = this.createBox(1.38, 1.45, 0.34, this.colors.hair);
        hairBack.position.set(0, -0.45, -0.63);
        this.headRoot.add(hairBack);

        const hairLeft = this.createBox(0.34, 1.26, 0.28, this.colors.hair);
        const hairRight = this.createBox(0.34, 1.26, 0.28, this.colors.hair);

        hairLeft.position.set(-0.72, -0.52, -0.1);
        hairRight.position.set(0.72, -0.52, -0.1);

        this.headRoot.add(hairLeft, hairRight);

        const leftEye = this.createBox(0.18, 0.1, 0.05, '#111111');
        const rightEye = this.createBox(0.18, 0.1, 0.05, '#111111');

        leftEye.position.set(-0.28, 0.08, 0.62);
        rightEye.position.set(0.28, 0.08, 0.62);

        this.headRoot.add(leftEye, rightEye);

        const mouth = this.createBox(0.28, 0.06, 0.04, '#7f1d1d');
        mouth.position.set(0, -0.32, 0.62);
        this.headRoot.add(mouth);

        const lipPiercing = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 16, 16),
            new THREE.MeshStandardMaterial({
                color: this.colors.metal,
                roughness: 0.3,
                metalness: 0.8,
            })
        );
        lipPiercing.position.set(0.24, -0.35, 0.64);
        this.headRoot.add(lipPiercing);

        this.createGlasses();
        this.createEarrings();
    }

    createGlasses() {
        const material = new THREE.MeshStandardMaterial({
            color: '#111111',
            roughness: 0.4,
            metalness: 0.2,
        });

        const leftFrame = new THREE.Mesh(
            new THREE.TorusGeometry(0.23, 0.03, 12, 24),
            material
        );
        const rightFrame = new THREE.Mesh(
            new THREE.TorusGeometry(0.23, 0.03, 12, 24),
            material
        );
        const bridge = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.04, 0.04),
            material
        );

        leftFrame.position.set(-0.31, 0.12, 0.64);
        rightFrame.position.set(0.31, 0.12, 0.64);
        bridge.position.set(0, 0.12, 0.64);

        this.headRoot.add(leftFrame, rightFrame, bridge);
    }

    createEarrings() {
        const material = new THREE.MeshStandardMaterial({
            color: this.colors.metal,
            roughness: 0.25,
            metalness: 0.9,
        });

        const left = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.02, 10, 24),
            material
        );
        const right = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.02, 10, 24),
            material
        );

        left.rotation.x = Math.PI / 2;
        right.rotation.x = Math.PI / 2;

        left.position.set(-0.86, -0.2, 0.03);
        right.position.set(0.86, -0.2, 0.03);

        this.headRoot.add(left, right);
    }

    createBox(width, height, depth, color) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshStandardMaterial({
                color,
                roughness: 0.88,
                metalness: 0.05,
            })
        );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    createTextPlane(text, width, height, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = color;
        ctx.font = 'bold 34px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
        });

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            material
        );

        return mesh;
    }

    lerpAngle(current, target, alpha) {
        let diff = target - current;

        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        return current + diff * alpha;
    }

    update(deltaTime, input) {
        const direction = new THREE.Vector3(input.x, 0, input.z);
        const hasInput = direction.lengthSq() > 0;
        const run = hasInput && input.run;

        if (hasInput) {
            direction.normalize();
        }

        const targetSpeed = hasInput ? (run ? 5.8 : 2.9) : 0;
        const desiredVelocity = direction.multiplyScalar(targetSpeed);

        const blend = 1 - Math.exp(-(hasInput ? 10 : 14) * deltaTime);
        this.velocity.lerp(desiredVelocity, blend);

        this.group.position.addScaledVector(this.velocity, deltaTime);

        this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -this.bounds, this.bounds);
        this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -this.bounds, this.bounds);

        const planarSpeed = Math.sqrt(
            this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
        );

        if (planarSpeed > 0.05) {
            const targetRotation = Math.atan2(this.velocity.x, this.velocity.z);
            const rotBlend = 1 - Math.exp(-12 * deltaTime);
            this.group.rotation.y = this.lerpAngle(this.group.rotation.y, targetRotation, rotBlend);
        }

        if (planarSpeed < 0.2) {
            this.state = 'IDLE';
        } else if (run) {
            this.state = 'RUN';
        } else {
            this.state = 'WALK';
        }

        this.animate(deltaTime, planarSpeed);
    }

    animate(deltaTime, planarSpeed) {
        const moving = planarSpeed > 0.15;

        if (!moving) {
            this.animationTime += deltaTime * 2.3;

            const idleBob = Math.sin(this.animationTime) * 0.035;
            this.bodyRoot.position.y = idleBob;

            this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, 0, 0.12);
            this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0, 0.12);
            this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0, 0.12);
            this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, 0, 0.12);
            this.bodyRoot.rotation.z = THREE.MathUtils.lerp(this.bodyRoot.rotation.z, 0, 0.12);
            this.headRoot.rotation.z = Math.sin(this.animationTime * 0.9) * 0.015;

            return;
        }

        const running = this.state === 'RUN';
        const frequency = running ? 12.5 : 7.5;
        const legAmplitude = running ? 0.95 : 0.55;
        const armAmplitude = running ? 0.78 : 0.45;
        const bobAmplitude = running ? 0.12 : 0.07;
        const leanAmount = running ? 0.12 : 0.06;

        this.animationTime += deltaTime * frequency;

        const swing = Math.sin(this.animationTime);
        const bob = Math.abs(Math.sin(this.animationTime)) * bobAmplitude;

        this.leftLegPivot.rotation.x = swing * legAmplitude;
        this.rightLegPivot.rotation.x = -swing * legAmplitude;

        this.leftArmPivot.rotation.x = -swing * armAmplitude;
        this.rightArmPivot.rotation.x = swing * armAmplitude;

        this.bodyRoot.position.y = bob;
        this.bodyRoot.rotation.z = Math.sin(this.animationTime * 0.5) * 0.03;
        this.headRoot.rotation.z = Math.sin(this.animationTime * 0.5) * 0.02;
        this.bodyRoot.rotation.x = -leanAmount;
    }
}