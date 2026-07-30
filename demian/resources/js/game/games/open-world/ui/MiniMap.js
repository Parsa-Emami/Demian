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
        this.root.setAttribute('aria-label', 'بازکردن نقشه جهان');
        this.root.innerHTML = '<canvas aria-hidden="true"></canvas><span>MAP · M</span>';
        this.canvas = this.root.querySelector('canvas');
        this.context = this.canvas.getContext('2d');
        this.root.addEventListener('click', this.onClick);
        this.host.append(this.root);
        this.draw();
    }

    update({ position, forward, activeChunkIds = [] } = {}) {
        if (position) this.player = { x: Number(position.x) || 0, z: Number(position.z) || 0, forward: forward ?? this.player.forward };
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
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(3, 6, 18, .94)';
        context.fillRect(0, 0, width, height);
        const bounds = this.manifest.bounds;
        for (const chunk of this.manifest.chunks) {
            const topLeft = this.project({ x: chunk.bounds.minX, z: chunk.bounds.maxZ }, width, height);
            const bottomRight = this.project({ x: chunk.bounds.maxX, z: chunk.bounds.minZ }, width, height);
            const discovered = this.discovery.isChunkDiscovered(chunk.id);
            context.fillStyle = discovered ? (this.activeChunks.has(chunk.id) ? 'rgba(34,211,238,.35)' : 'rgba(107,114,128,.2)') : 'rgba(0,0,0,.76)';
            context.fillRect(topLeft.x + 1, topLeft.y + 1, bottomRight.x - topLeft.x - 2, bottomRight.y - topLeft.y - 2);
            context.strokeStyle = discovered ? 'rgba(148,163,184,.35)' : 'rgba(20,24,39,.9)';
            context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        }
        for (const point of this.manifest.savePoints) {
            if (!this.discovery.isSavePointUnlocked(point.id)) continue;
            const projected = this.project(point.position, width, height);
            context.fillStyle = '#34d399';
            context.beginPath();
            context.arc(projected.x, projected.y, Math.max(2, width * 0.014), 0, Math.PI * 2);
            context.fill();
        }
        const player = this.project(this.player, width, height);
        const angle = Math.atan2(this.player.forward?.z ?? 1, this.player.forward?.x ?? 0);
        const size = Math.max(4, width * 0.035);
        context.save();
        context.translate(player.x, player.y);
        context.rotate(-angle + Math.PI / 2);
        context.fillStyle = '#f472b6';
        context.beginPath();
        context.moveTo(0, -size);
        context.lineTo(size * 0.65, size * 0.7);
        context.lineTo(-size * 0.65, size * 0.7);
        context.closePath();
        context.fill();
        context.restore();
        context.strokeStyle = 'rgba(244,114,182,.75)';
        context.strokeRect(1, 1, width - 2, height - 2);
        void bounds;
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
