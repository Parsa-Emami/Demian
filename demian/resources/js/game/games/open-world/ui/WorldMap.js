import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';
import { PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

function setText(element, value) {
    if (element) element.textContent = String(value ?? '');
}

function pixel(value) { return Math.round(Number(value) || 0); }

function withAlpha(hex, alpha = '55') {
    return /^#[0-9a-f]{6}$/i.test(hex ?? '') ? `${hex}${alpha}` : '#64748b55';
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
                <header><div><small>DEMIAN // WORLD GRID</small><h2>نقشه جهان</h2></div><button type="button" data-map-close>×</button></header>
                <div class="open-world-map__canvas-wrap"><canvas></canvas></div>
                <footer><div><strong data-map-selection>یک Save Point را انتخاب کن</strong><small data-map-status>نقاط کشف‌شده برای سفر سریع فعال‌اند.</small></div><button type="button" data-map-travel disabled>سفر سریع</button></footer>
            </div>`;
        this.canvas = this.root.querySelector('canvas');
        this.context = this.canvas.getContext('2d', { alpha: false });
        if (this.context) this.context.imageSmoothingEnabled = false;
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

    project(point = {}, width, height) {
        const bounds = this.manifest.bounds;
        const padding = Math.max(24, Math.round(Math.min(width, height) * 0.055));
        return {
            x: padding + (((Number(point.x) || 0) - bounds.minX) / (bounds.maxX - bounds.minX)) * (width - padding * 2),
            y: height - padding - (((Number(point.z) || 0) - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * (height - padding * 2),
        };
    }

    districtCenter(districtId) {
        const chunks = this.manifest.chunks.filter((chunk) => chunk.districtId === districtId);
        if (chunks.length === 0) return { x: 0, z: 0 };
        return {
            x: chunks.reduce((sum, chunk) => sum + chunk.center.x, 0) / chunks.length,
            z: chunks.reduce((sum, chunk) => sum + chunk.center.z, 0) / chunks.length,
        };
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(320, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(220, Math.round(rect.height * dpr));
        return { width: this.canvas.width, height: this.canvas.height };
    }

    drawBackdrop(context, width, height) {
        context.fillStyle = P.void;
        context.fillRect(0, 0, width, height);
        const grid = Math.max(14, Math.round(Math.min(width, height) / 22));
        context.fillStyle = 'rgba(67,230,233,.055)';
        for (let x = 0; x < width; x += grid) context.fillRect(x, 0, 1, height);
        for (let y = 0; y < height; y += grid) context.fillRect(0, y, width, 1);
        context.fillStyle = 'rgba(255,209,102,.045)';
        for (let y = grid; y < height; y += grid * 2) {
            for (let x = grid; x < width; x += grid * 2) context.fillRect(x, y, 2, 2);
        }
    }

    draw() {
        if (!this.context) return;
        const { width, height } = this.resizeCanvas();
        const context = this.context;
        context.imageSmoothingEnabled = false;
        context.textBaseline = 'middle';
        this.drawBackdrop(context, width, height);

        for (const chunk of this.manifest.chunks) {
            const a = this.project({ x: chunk.bounds.minX, z: chunk.bounds.maxZ }, width, height);
            const b = this.project({ x: chunk.bounds.maxX, z: chunk.bounds.minZ }, width, height);
            const discovered = this.discovery.isChunkDiscovered(chunk.id);
            const district = this.manifest.district(chunk.districtId);
            const x = pixel(a.x);
            const y = pixel(a.y);
            const w = Math.max(1, pixel(b.x - a.x));
            const h = Math.max(1, pixel(b.y - a.y));

            context.fillStyle = discovered ? withAlpha(district?.color, '52') : '#03050b';
            context.fillRect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4));
            context.strokeStyle = discovered ? (district?.color ?? '#64748b') : '#1b2436';
            context.lineWidth = discovered ? 2 : 1;
            context.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));

            if (discovered) {
                context.fillStyle = withAlpha(district?.color, 'b0');
                context.fillRect(x + 4, y + 4, Math.max(2, Math.round(w * 0.18)), 2);
            }
        }

        context.textAlign = 'center';
        for (const district of this.manifest.districts) {
            const point = this.project(this.districtCenter(district.id), width, height);
            const discovered = this.manifest.chunks.some(
                (chunk) => chunk.districtId === district.id && this.discovery.isChunkDiscovered(chunk.id)
            );
            const fontSize = Math.max(11, Math.round(width * 0.017));
            context.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
            context.fillStyle = '#050816';
            context.fillText(district.label, pixel(point.x) + 2, pixel(point.y) + 2);
            context.fillStyle = discovered ? P.white : '#46536b';
            context.fillText(district.label, pixel(point.x), pixel(point.y));
        }

        for (const point of this.manifest.savePoints) {
            const projected = this.project(point.position, width, height);
            const unlocked = this.discovery.isSavePointUnlocked(point.id);
            const selected = point.id === this.selectedId;
            const size = Math.max(5, Math.round(width * 0.008));
            const x = pixel(projected.x);
            const y = pixel(projected.y);
            context.fillStyle = unlocked ? (selected ? P.gold : P.green) : '#334155';
            context.fillRect(x - size, y - size, size * 2 + 1, size * 2 + 1);
            context.fillStyle = P.void;
            context.fillRect(x - Math.max(1, size - 2), y - Math.max(1, size - 2), Math.max(1, size * 2 - 3), Math.max(1, size * 2 - 3));
            context.fillStyle = unlocked ? (selected ? P.gold : P.green) : '#334155';
            context.fillRect(x - 1, y - size + 2, 3, Math.max(3, size * 2 - 3));
            context.fillRect(x - size + 2, y - 1, Math.max(3, size * 2 - 3), 3);
        }

        const player = this.project(this.playerPosition, width, height);
        const marker = Math.max(5, Math.round(width * 0.007));
        const px = pixel(player.x);
        const py = pixel(player.y);
        context.fillStyle = P.pinkDark;
        context.fillRect(px - marker - 2, py - marker - 2, marker * 2 + 5, marker * 2 + 5);
        context.fillStyle = P.pink;
        context.fillRect(px - marker, py - marker, marker * 2 + 1, marker * 2 + 1);
        context.fillStyle = P.white;
        context.fillRect(px - 1, py - 1, 3, 3);

        context.strokeStyle = P.cyanDark;
        context.lineWidth = 2;
        context.strokeRect(6, 6, width - 12, height - 12);
        context.strokeStyle = 'rgba(255,209,102,.45)';
        context.lineWidth = 1;
        context.strokeRect(10.5, 10.5, width - 21, height - 21);
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
