const SOUNDS = Object.freeze({
    walk: [108, 62, .085, .036, 'triangle'],
    sprint: [166, 62, .12, .075, 'triangle'],
    shadow: [91, 43, .18, .085, 'triangle'],
    metal: [684, 95, .35, .15, 'triangle'],
    power: [207, 377, .15, .092, 'sine'],
    card: [436, 668, .17, .105, 'sine'],
    chase: [187, 54, .48, .18, 'triangle'],
    escaped: [358, 716, .43, .125, 'sine'],
    caught: [154, 42, .4, .155, 'triangle'],
    timeout: [173, 68, .3, .1, 'sine'],
    'last-minute': [282, 180, .22, .11, 'sine'],
});

export default class AfterHoursAudio {
    constructor() {
        this.context = null;
        this.master = null;
        this.enabled = true;
        this.voices = new Set();
    }

    unlock() {
        if (!this.enabled) return;
        try {
            const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
            if (!Audio) return;
            if (!this.context) {
                this.context = new Audio({ latencyHint: 'interactive' });
                this.master = this.context.createGain();
                this.master.gain.value = .53;
                this.master.connect(this.context.destination);
            }
            this.context.resume().catch(() => undefined);
        } catch {}
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.master) this.master.gain.value = enabled ? .53 : 0;
        if (!enabled) this.stop();
    }

    play(type, origin, listener) {
        if (!this.enabled || this.context?.state !== 'running' || document.hidden || this.voices.size >= 6) return;
        const voice = SOUNDS[type];
        if (!voice) return;
        const [start, end, length, volume, wave] = voice;
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const panner = typeof this.context.createStereoPanner === 'function' && origin
            ? this.context.createStereoPanner() : null;
        const attenuation = origin ? 1 / (1 + Math.hypot(origin.x - listener.x, origin.z - listener.z) / 13) : 1;
        osc.type = wave;
        osc.frequency.setValueAtTime(start, now);
        osc.frequency.exponentialRampToValueAtTime(end, now + length);
        gain.gain.setValueAtTime(.001, now);
        gain.gain.linearRampToValueAtTime(volume * attenuation, now + .016);
        gain.gain.exponentialRampToValueAtTime(.001, now + length);
        osc.connect(gain);
        if (panner) {
            panner.pan.value = Math.max(-1, Math.min(1, (origin.x - listener.x) / 14));
            gain.connect(panner);
            panner.connect(this.master);
        } else {
            gain.connect(this.master);
        }
        this.voices.add(osc);
        osc.onended = () => {
            this.voices.delete(osc);
            osc.disconnect();
            gain.disconnect();
            panner?.disconnect();
        };
        osc.start(now);
        osc.stop(now + length);
    }

    stop() { for (const voice of this.voices) voice.stop(); }

    dispose() {
        this.stop();
        this.context?.close().catch(() => undefined);
        this.context = null;
        this.master = null;
    }
}
