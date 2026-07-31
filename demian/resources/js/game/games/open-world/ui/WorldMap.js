import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';

function setText(element, value) {
    if (element) element.textContent = String(value ?? '');
}

export default class WorldMap {
    constructor({ host, manifest, discovery, onFastTravel = null, onClose = null } = {}) {
        this.host = host;
        this.manifest = manifest;
        this.discovery = discovery;
        this.onFastTravel = onFastTravel;
        this.onClose = onClose;
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.selectedId = null;
        this.playerPosition = { x: 0, z: 0 };
        this.boundClick = (event) => this.selectFromPointer(event);
        this.boundKey = (event) => { if (event.key === 'Escape') this.close(); };
    }

    mount() {
        if (!this.host || this.root) return;
        this.root = document.createElement('section');
        this.root.className = 'open-world-map';
        assignUiLayer(this.root, UI_LAYER.LOCAL_BASE);
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.innerHTML = `
            <div class="open-world-map__panel" role="dialog" aria-modal="true" aria-label="نقشه شهر دمیان">
                <header><div><small>DEMIAN CITY</small><h2>نقشه جهان</h2></div><button type="button" data-map-close>×</button></header>
                <div class="open-world-map__canvas-wrap"><canvas></canvas></div>
                <footer><div><strong data-map-selection>یک Save Point را انتخاب کن</strong><small data-map-status>نقاط کشف‌شده برای سفر سریع فعال‌اند.</small></div><button type="button" data-map-travel disabled>سفر سریع</button></footer>
            </div>`;
        this.canvas = this.root.querySelector('canvas');
        this.context = this.canvas.getContext('2d');
        this.closeButton = this.root.querySelector('[data-map-close]');
        this.travelButton = this.root.querySelector('[data-map-travel]');
        this.selectionLabel = this.root.querySelector('[data-map-selection]');
        this.statusLabel = this.root.querySelector('[data-map-status]');
        this.closeButton.addEventListener('click', () => this.close());
        this.travelButton.addEventListener('click', () => this.travel());
        this.canvas.addEventListener('click', this.boundClick);
        this.host.append(this.root);
    }

    open(position = null) {
        if (!this.root) this.mount();
        if (position) this.playerPosition = { x: Number(position.x) || 0, z: Number(position.z) || 0 };
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', this.boundKey);
        this.draw();
        this.closeButton?.focus();
    }

    close() {
        if (!this.root || this.root.hidden) return;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', this.boundKey);
        this.onClose?.();
    }

    isOpen() { return Boolean(this.root && !this.root.hidden); }

    project(point, width, height) {
        const bounds = this.manifest.bounds;
        const padding = 28;
        return {
            x: padding + ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * (width - padding * 2),
            y: height - padding - ((point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * (height - padding * 2),
        };
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(320, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(220, Math.round(rect.height * dpr));
        return { width: this.canvas.width, height: this.canvas.height };
    }

    draw() {
        if (!this.context) return;
        const { width, height } = this.resizeCanvas();
        const context = this.context;
        context.fillStyle = '#050714';
        context.fillRect(0, 0, width, height);
        for (const chunk of this.manifest.chunks) {
            const a = this.project({ x: chunk.bounds.minX, z: chunk.bounds.maxZ }, width, height);
            const b = this.project({ x: chunk.bounds.maxX, z: chunk.bounds.minZ }, width, height);
            const discovered = this.discovery.isChunkDiscovered(chunk.id);
            const district = this.manifest.district(chunk.districtId);
            context.fillStyle = discovered ? `${district?.accent ?? '#64748b'}44` : 'rgba(0,0,0,.72)';
            context.fillRect(a.x + 1, a.y + 1, b.x - a.x - 2, b.y - a.y - 2);
            context.strokeStyle = discovered ? 'rgba(148,163,184,.32)' : 'rgba(15,23,42,.9)';
            context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        }
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const district of this.manifest.districts) {
            const point = this.project(district.center, width, height);
            const districtDiscovered = this.manifest.chunks.some(
                (chunk) => chunk.districtId === district.id && this.discovery.isChunkDiscovered(chunk.id)
            );
            context.fillStyle = districtDiscovered ? '#e2e8f0' : '#334155';
            context.font = `700 ${Math.max(12, width * 0.018)}px sans-serif`;
            context.fillText(district.label, point.x, point.y);
        }
        for (const point of this.manifest.savePoints) {
            const projected = this.project(point.position, width, height);
            const unlocked = this.discovery.isSavePointUnlocked(point.id);
            context.fillStyle = unlocked ? (point.id === this.selectedId ? '#facc15' : '#34d399') : '#334155';
            context.beginPath();
            context.arc(projected.x, projected.y, Math.max(6, width * 0.009), 0, Math.PI * 2);
            context.fill();
        }
        const player = this.project(this.playerPosition, width, height);
        context.fillStyle = '#f472b6';
        context.beginPath();
        context.arc(player.x, player.y, Math.max(5, width * 0.008), 0, Math.PI * 2);
        context.fill();
    }

    selectFromPointer(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
        const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
        let nearest = null;
        let distance = Infinity;
        for (const point of this.manifest.savePoints) {
            const projected = this.project(point.position, this.canvas.width, this.canvas.height);
            const candidate = Math.hypot(projected.x - x, projected.y - y);
            if (candidate < distance) { nearest = point; distance = candidate; }
        }
        if (!nearest || distance > Math.max(24, this.canvas.width * 0.035)) return;
        this.selectedId = nearest.id;
        const unlocked = this.discovery.isSavePointUnlocked(nearest.id);
        setText(this.selectionLabel, nearest.label);
        setText(this.statusLabel, unlocked ? 'این Save Point برای سفر سریع آماده است.' : 'ابتدا این Save Point را در جهان فعال کن.');
        this.travelButton.disabled = !unlocked;
        this.draw();
    }

    async travel() {
        const point = this.manifest.savePoint(this.selectedId);
        if (!point || !this.discovery.isSavePointUnlocked(point.id)) return;
        this.travelButton.disabled = true;
        setText(this.statusLabel, 'در حال بارگذاری مقصد…');
        try {
            await this.onFastTravel?.(point);
            this.close();
        } finally {
            this.travelButton.disabled = false;
        }
    }

    dispose() {
        document.removeEventListener('keydown', this.boundKey);
        this.canvas?.removeEventListener('click', this.boundClick);
        this.root?.remove();
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.host = null;
    }
}
