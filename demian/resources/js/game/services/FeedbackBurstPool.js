const PARTICLE_COUNTS = Object.freeze({
    start: 4,
    win: 7,
    lose: 3,
    score: 3,
    discover: 4,
    error: 2,
});

export default class FeedbackBurstPool {
    constructor({ host, now = () => globalThis.performance?.now?.() ?? Date.now(),
        schedule = (fn, ms) => setTimeout(fn, ms),
        cancel = (id) => clearTimeout(id), maxNodes = 10 } = {}) {
        this.host = host;
        this.now = now;
        this.schedule = schedule;
        this.cancel = cancel;
        this.maxNodes = Math.min(12, Math.max(1, Math.trunc(maxNodes)));
        this.nodes = [];
        this.active = new Set();
        this.timers = new Map();
        this.lastPlayed = new Map();
        this.reducedMotion = false;
        this.economy = false;
        this.disposed = false;
    }

    configure({ reducedMotion = false, economy = false } = {}) {
        this.reducedMotion = Boolean(reducedMotion);
        this.economy = Boolean(economy);
        if (this.reducedMotion) this.clear();
    }

    getNode() {
        const idle = this.nodes.find(node => !this.active.has(node));
        if (idle) return idle;
        if (this.nodes.length >= this.maxNodes) return null;
        const element = this.host.ownerDocument.createElement('span');
        element.className = 'feedback-particle';
        element.setAttribute('aria-hidden', 'true');
        element.addEventListener('animationend', () => this.release(element));
        element.hidden = true;
        this.nodes.push(element);
        this.host.appendChild(element);
        return element;
    }

    burst(kind) {
        if (!Object.hasOwn(PARTICLE_COUNTS, kind) || !this.host || this.disposed
            || this.reducedMotion || this.host.isConnected === false) return 0;
        const time = this.now();
        if (time - (this.lastPlayed.get(kind) ?? -Infinity) < 180) return 0;
        const count = Math.min(this.economy ? 2 : PARTICLE_COUNTS[kind],
            this.maxNodes - this.active.size);
        let created = 0;
        const activated = [];
        for (let index = 0; index < count; index++) {
            const node = this.getNode();
            if (!node) break;
            const angle = (index * 2.399963 + (time % 1000) / 550);
            const distance = this.economy ? 22 : 30 + (index % 3) * 11;
            node.style.setProperty('--feedback-dx', Math.round(Math.cos(angle) * distance) + 'px');
            node.style.setProperty('--feedback-dy', Math.round(Math.sin(angle) * distance) + 'px');
            node.dataset.feedbackKind = kind;
            node.hidden = false;
            node.classList.remove('is-active');
            activated.push(node);
            this.active.add(node);
            this.timers.set(node, this.schedule(() => this.release(node), 550));
            created++;
        }
        if (created) {
            void this.host.offsetWidth;
            for (const node of activated) node.classList.add('is-active');
            this.lastPlayed.set(kind, time);
        }
        return created;
    }

    release(node) {
        if (!this.active.has(node)) return;
        this.active.delete(node);
        const timer = this.timers.get(node);
        if (timer !== undefined) this.cancel(timer);
        this.timers.delete(node);
        node.classList.remove('is-active');
        node.hidden = true;
    }

    clear() {
        for (const node of [...this.active]) this.release(node);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.lastPlayed.clear();
        for (const node of this.nodes) node.remove();
        this.nodes.length = 0;
    }
}
