import * as THREE from 'three';

export default class CharacterSpeechBubble {
    constructor(owner, config = {}) {
        this.owner = owner;
        this.messages = Array.isArray(config.messages)
            ? config.messages.filter((message) => String(message).trim())
            : [];
        this.duration = Math.max(Number(config.duration) || 3.2, 1.2);
        this.remaining = 0;
        this.lastIndex = -1;
        this.texture = null;

        this.material = new THREE.SpriteMaterial({
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            opacity: 0,
        });
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.visible = false;
        this.sprite.renderOrder = 60;
        this.owner.group.add(this.sprite);
    }

    showRandom() {
        if (this.messages.length === 0) {
            return;
        }

        let index = Math.floor(Math.random() * this.messages.length);

        if (this.messages.length > 1 && index === this.lastIndex) {
            index = (index + 1 + Math.floor(Math.random() * (this.messages.length - 1))) % this.messages.length;
        }

        this.lastIndex = index;
        this.show(this.messages[index]);
    }

    show(message) {
        this.replaceTexture(this.createTexture(String(message)));
        this.remaining = this.duration;
        this.material.opacity = 1;
        this.sprite.visible = true;
    }

    createTexture(message) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 320;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;

        const lines = this.wrapText(context, message, 850, 58);
        const lineHeight = 72;
        const bubbleHeight = Math.min(245, 92 + lines.length * lineHeight);
        const top = 18;
        const left = 42;
        const width = 940;
        const radius = 42;

        context.save();
        context.shadowColor = 'rgba(0, 0, 0, 0.55)';
        context.shadowBlur = 24;
        context.shadowOffsetY = 10;
        this.roundedRect(context, left, top, width, bubbleHeight, radius);
        context.fillStyle = 'rgba(7, 10, 28, 0.96)';
        context.fill();
        context.restore();

        this.roundedRect(context, left, top, width, bubbleHeight, radius);
        context.lineWidth = 8;
        context.strokeStyle = '#7cf8ff';
        context.stroke();

        context.beginPath();
        context.moveTo(470, top + bubbleHeight - 2);
        context.lineTo(540, top + bubbleHeight - 2);
        context.lineTo(505, top + bubbleHeight + 48);
        context.closePath();
        context.fillStyle = 'rgba(7, 10, 28, 0.96)';
        context.fill();
        context.lineWidth = 8;
        context.strokeStyle = '#7cf8ff';
        context.stroke();

        context.direction = 'rtl';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '900 58px Tahoma, Arial, sans-serif';
        context.fillStyle = '#ffffff';
        context.shadowColor = 'rgba(255, 79, 216, 0.6)';
        context.shadowBlur = 10;

        const centerY = top + bubbleHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
            context.fillText(line, canvas.width / 2, centerY + index * lineHeight);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    wrapText(context, message, maxWidth, fontSize) {
        context.font = `900 ${fontSize}px Tahoma, Arial, sans-serif`;
        const words = message.trim().split(/\s+/);
        const lines = [];
        let current = '';

        words.forEach((word) => {
            const candidate = current ? `${current} ${word}` : word;

            if (context.measureText(candidate).width <= maxWidth || !current) {
                current = candidate;
                return;
            }

            lines.push(current);
            current = word;
        });

        if (current) {
            lines.push(current);
        }

        return lines.slice(0, 3);
    }

    roundedRect(context, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + width - r, y);
        context.quadraticCurveTo(x + width, y, x + width, y + r);
        context.lineTo(x + width, y + height - r);
        context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        context.lineTo(x + r, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - r);
        context.lineTo(x, y + r);
        context.quadraticCurveTo(x, y, x + r, y);
        context.closePath();
    }

    replaceTexture(texture) {
        this.texture?.dispose();
        this.texture = texture;
        this.material.map = texture;
        this.material.needsUpdate = true;
    }

    update(deltaTime) {
        if (!this.sprite.visible) {
            return;
        }

        this.remaining = Math.max(0, this.remaining - deltaTime);
        const elapsed = this.duration - this.remaining;
        const enter = Math.min(elapsed / 0.18, 1);
        const exit = Math.min(this.remaining / 0.35, 1);
        const opacity = Math.min(enter, exit);
        const pulse = 1 + Math.sin(elapsed * 4.8) * 0.015;

        this.material.opacity = opacity;
        this.sprite.scale.set(6.5 * pulse, 2.03 * pulse, 1);
        this.sprite.position.set(
            0,
            this.owner.bodyRoot.position.y + this.owner.baseHeight + 1.12 + Math.sin(elapsed * 3.2) * 0.05,
            0.08
        );

        if (this.remaining <= 0) {
            this.sprite.visible = false;
            this.material.opacity = 0;
        }
    }

    dispose() {
        this.owner.group.remove(this.sprite);
        this.texture?.dispose();
        this.material.dispose();
    }
}
