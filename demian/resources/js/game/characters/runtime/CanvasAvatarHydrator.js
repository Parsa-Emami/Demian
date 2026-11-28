import { optionalAssetPolicy } from './MobileNetworkPolicy.js';

export default class CanvasAvatarHydrator {
    constructor({ service, eventBus, schedule = callback => globalThis.setTimeout(callback, 0),
        policy = optionalAssetPolicy }) {
        this.service = service;
        this.schedule = schedule;
        this.policy = policy;
        this.ready = false;
        this.current = null;
        this.subscriptions = [
            eventBus?.on('game:loading', () => this.reset()),
            eventBus?.on('application:menu-shown', () => this.reset()),
            eventBus?.on('game:first-playable-frame', () => {
                this.ready = true;
                this.hydrate();
            }),
        ];
    }

    stage(avatar, variant) {
        this.current = { avatar, variant, pending: false };
        this.hydrate();
    }

    hydrate() {
        const current = this.current;
        if (!this.ready || !current || current.pending || this.policy().reason !== 'normal') return;
        current.pending = true;
        this.schedule(async () => {
            if (this.current !== current || !this.ready) return;
            try {
                const pack = await this.service.loadPack(current.avatar.slug, current.variant,
                    { background: true, speculative: true });
                if (this.current === current && this.ready) current.avatar.replaceVisualAssets(pack.image, pack.atlas, pack.companionImage);
            } catch {}
        });
    }

    reset() {
        this.ready = false;
        this.current = null;
    }

    dispose() {
        this.reset();
        this.subscriptions.forEach(unsubscribe => unsubscribe?.());
        this.subscriptions = [];
    }
}
