import MiniMap from './MiniMap.js';
import WorldMap from './WorldMap.js';
import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';

export default class OpenWorldHud {
    constructor({ host, overlayHost = host, manifest, discovery, onFastTravel, onMapClosed } = {}) {
        this.host = host;
        this.overlayHost = overlayHost;
        this.manifest = manifest;
        this.discovery = discovery;
        this.root = null;
        this.stats = null;
        this.miniMap = new MiniMap({ host, manifest, discovery, onOpenMap: () => this.openMap() });
        this.worldMap = new WorldMap({ host: overlayHost, manifest, discovery, onFastTravel, onClose: onMapClosed });
        this.lastPosition = { x: 0, z: 0 };
    }

    mount() {
        if (!this.host || this.root) return;
        this.root = document.createElement('aside');
        this.root.className = 'open-world-streaming-hud';
        assignUiLayer(this.root, UI_LAYER.LOCAL_BASE);
        this.root.innerHTML = '<span><small>CHUNKS</small><b data-world-chunks>0</b></span><span><small>AI</small><b data-world-ai>0</b></span><span><small>DISTRICT</small><b data-world-district>—</b></span>';
        this.host.append(this.root);
        this.miniMap.mount();
        this.worldMap.mount();
    }

    update({ position, forward, chunkStats, aiStats, district, activeChunkIds = [] } = {}) {
        if (position) this.lastPosition = { x: position.x, z: position.z };
        const chunks = this.root?.querySelector('[data-world-chunks]');
        const ai = this.root?.querySelector('[data-world-ai]');
        const districtLabel = this.root?.querySelector('[data-world-district]');
        if (chunks) chunks.textContent = `${chunkStats?.active ?? 0}/${chunkStats?.loaded ?? 0}`;
        if (ai) ai.textContent = String(aiStats?.frameUpdates ?? 0);
        if (districtLabel) districtLabel.textContent = district?.label ?? 'حاشیه شهر';
        this.miniMap.update({ position, forward, activeChunkIds });
        if (this.worldMap.isOpen()) {
            this.worldMap.playerPosition = this.lastPosition;
            this.worldMap.draw();
        }
    }

    openMap() { this.worldMap.open(this.lastPosition); }
    closeMap() { this.worldMap.close(); }
    toggleMap() { this.worldMap.isOpen() ? this.closeMap() : this.openMap(); }
    isMapOpen() { return this.worldMap.isOpen(); }

    dispose() {
        this.miniMap.dispose();
        this.worldMap.dispose();
        this.root?.remove();
        this.root = null;
        this.host = null;
        this.overlayHost = null;
    }
}
