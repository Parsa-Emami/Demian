import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';
import { PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

function canvasSize(canvas) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return { width, height, dpr };
}

function pixel(value) { return Math.round(Number(value) || 0); }

export default class MiniMap {
    constructor({ host, manifest, discovery, onOpenMap = null } = {}) {
        this.host = host;
        this.manifest = manifest;
        this.discovery = discovery;
        this.onOpenMap = onOpenMap;
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.player = { x: 0, z: 0, forward: { x: 0, z: 1 } };
        this.activeChunks = new Set();
        this.onClick = () => this.onOpenMap?.();
    }

    mount() {
        if (!this.host || this.root) return;
        this.root = document.createElement('button');
        this.root.type = 'button';
        this.root.className = 'open-world-minimap';
        assignUiLayer(this.root, UI_LAYER.LOCAL_RAISED);
        this.root.setAttribute('aria-label', 'بازکردن نقشه جهان');
        this.root.innerHTML = '<canvas aria-hidden="true"></canvas><span>MAP · M</span>';
        this.canvas = this.root.querySelector('canvas');
        this.context = this.canvas.getContext('2d', { alpha: false });
        if (this.context) this.context.imageSmoothingEnabled = false;
        this.root.addEventListener('click', this.onClick);
        this.host.append(this.root);
        this.draw();
    }

    update({ position, forward, activeChunkIds = [] } = {}) {
        if (position) {
            this.player = {
                x: Number(position.x) || 0,
                z: Number(position.z) || 0,
                forward: forward ?? this.player.forward,
            };
        }
        this.activeChunks = new Set(activeChunkIds);
        this.draw();
    }

    project(point, width, height) {
        const bounds = this.manifest.bounds;
        return {
            x: ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * width,
            y: height - ((point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * height,
        };
    }

    draw() {
        if (!this.context || !this.canvas) return;
        const { width, height } = canvasSize(this.canvas);
        const context = this.context;
        context.imageSmoothingEnabled = false;
        context.fillStyle = P.void;
        context.fillRect(0, 0, width, height);

        // Hard 8-bit grid behind chunks.
        context.fillStyle = 'rgba(67,230,233,.05)';
        const grid = Math.max(8, Math.round(width / 8));
        for (let x = 0; x < width; x += grid) context.fillRect(x, 0, 1, height);
        for (let y = 0; y < height; y += grid) context.fillRect(0, y, width, 1);

        for (const chunk of this.manifest.chunks) {
            const topLeft = this.project({ x: chunk.bounds.minX, z: chunk.bounds.maxZ }, width, height);
            const bottomRight = this.project({ x: chunk.bounds.maxX, z: chunk.bounds.minZ }, width, height);
            const discovered = this.discovery.isChunkDiscovered(chunk.id);
            const active = this.activeChunks.has(chunk.id);
            const x = pixel(topLeft.x) + 1;
            const y = pixel(topLeft.y) + 1;
            const w = Math.max(1, pixel(bottomRight.x - topLeft.x) - 2);
            const h = Math.max(1, pixel(bottomRight.y - topLeft.y) - 2);

            context.fillStyle = discovered
                ? (active ? '#164c5a' : '#202b3f')
                : '#05070d';
            context.fillRect(x, y, w, h);
            context.strokeStyle = discovered
                ? (active ? P.cyan : '#52627a')
                : '#151c2c';
            context.lineWidth = active ? 2 : 1;
            context.strokeRect(pixel(topLeft.x) + 0.5, pixel(topLeft.y) + 0.5, Math.max(1, pixel(bottomRight.x - topLeft.x) - 1), Math.max(1, pixel(bottomRight.y - topLeft.y) - 1));
        }

        for (const point of this.manifest.savePoints) {
            if (!this.discovery.isSavePointUnlocked(point.id)) continue;
            const projected = this.project(point.position, width, height);
            const x = pixel(projected.x);
            const y = pixel(projected.y);
            const size = Math.max(3, pixel(width * 0.014));
            context.fillStyle = P.green;
            context.fillRect(x - size, y - size, size * 2 + 1, size * 2 + 1);
            context.fillStyle = P.white;
            context.fillRect(x, y - Math.max(1, size - 1), 1, Math.max(3, size * 2 - 1));
            context.fillRect(x - Math.max(1, size - 1), y, Math.max(3, size * 2 - 1), 1);
        }

        const player = this.project(this.player, width, height);
        const x = pixel(player.x);
        const y = pixel(player.y);
        const fx = Number(this.player.forward?.x) || 0;
        const fz = Number(this.player.forward?.z) || 0;
        const stepX = Math.sign(fx);
        const stepY = -Math.sign(fz);
        const marker = Math.max(3, pixel(width * 0.022));

        context.fillStyle = P.pinkDark;
        context.fillRect(x - marker, y - marker, marker * 2 + 1, marker * 2 + 1);
        context.fillStyle = P.pink;
        context.fillRect(x - marker + 1, y - marker + 1, marker * 2 - 1, marker * 2 - 1);
        context.fillStyle = P.white;
        context.fillRect(x, y, 1, 1);
        context.fillRect(x + stepX * marker, y + stepY * marker, Math.max(1, Math.abs(stepY)), Math.max(1, Math.abs(stepX)));

        context.strokeStyle = P.pink;
        context.lineWidth = 2;
        context.strokeRect(1, 1, width - 2, height - 2);
        context.strokeStyle = P.cyanDark;
        context.lineWidth = 1;
        context.strokeRect(4.5, 4.5, Math.max(1, width - 9), Math.max(1, height - 9));
    }

    dispose() {
        this.root?.removeEventListener('click', this.onClick);
        this.root?.remove();
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.host = null;
    }
}
