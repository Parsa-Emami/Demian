import { CAFE_SOUNDTRACKS, cafeMusicFrame } from './CafeSoundtrack.js';
export const FEEDBACK_TONES = Object.freeze({
    start: [392, 587, .18, .065, 'sine', 180],
    win: [523, 880, .32, .09, 'triangle', 250],
    lose: [294, 175, .22, .07, 'triangle', 220],
    score: [587, 784, .12, .046, 'sine', 140],
    discover: [440, 659, .21, .052, 'triangle', 230],
    ui: [440, 523, .065, .023, 'sine', 85],
    error: [261, 196, .15, .04, 'triangle', 260],
    jump: [360, 620, .12, .048, 'sine', 110],
    collision: [210, 115, .18, .066, 'triangle', 175],
    interaction: [420, 550, .09, .038, 'sine', 90],
    combo: [565, 990, .18, .065, 'triangle', 130],
});

function audioFactory() {
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return Audio ? new Audio({ latencyHint: 'interactive' }) : null;
}

function disconnect(node) {
    try { node?.disconnect?.(); } catch {}
}

export default class FeedbackAudioEngine {
    constructor({ createContext = audioFactory, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
        this.createContext = createContext;
        this.now = now;
        this.context = null;
        this.master = null;
        this.sfxBus = null;
        this.musicBus = null;
        this.voices = new Set();
        this.musicNodes = [];
        this.musicTimer = null;
        this.musicStep = 0;
        this.lastPlayed = new Map();
        this.soundEnabled = true;
        this.musicEnabled = true;
        this.hidden = false;
        this.paused = true;
        this.gameId = null;
        this.disposed = false;
    }

    unlock() {
        if (this.disposed || this.hidden || (!this.soundEnabled && !this.musicEnabled)) return false;
        try {
            if (!this.context) {
                this.context = this.createContext();
                if (!this.context) return false;
                this.master = this.context.createGain();
                this.sfxBus = this.context.createGain();
                this.musicBus = this.context.createGain();
                this.master.gain.value = .8;
                this.sfxBus.gain.value = this.soundEnabled ? .6 : 0;
                this.musicBus.gain.value = this.musicEnabled ? .3 : 0;
                this.sfxBus.connect(this.master);
                this.musicBus.connect(this.master);
                this.master.connect(this.context.destination);
            }
            if (this.context.state !== 'running') {
                const result = this.context.resume?.();
                Promise.resolve(result).then(() => this.syncMusic()).catch(() => undefined);
            }
            this.syncMusic();
            return true;
        } catch {
            return false;
        }
    }

    configure({ soundEnabled = true, musicEnabled = true } = {}) {
        if (this.disposed) return;
        this.soundEnabled = Boolean(soundEnabled);
        this.musicEnabled = Boolean(musicEnabled);
        if (this.sfxBus) this.sfxBus.gain.value = this.soundEnabled ? .6 : 0;
        if (this.musicBus) this.musicBus.gain.value = this.musicEnabled ? .3 : 0;
        if (!this.soundEnabled) this.stopVoices();
        this.syncMusic();
    }

    setGame(gameId, { paused = false } = {}) {
        if (this.disposed) return;
        const changed = gameId !== this.gameId;
        this.gameId = gameId && Object.hasOwn(CAFE_SOUNDTRACKS, gameId) ? gameId : null;
        this.paused = Boolean(paused);
        if (changed) this.stopMusic();
        this.syncMusic();
    }

    setPaused(paused) {
        if (this.disposed) return;
        this.paused = Boolean(paused);
        if (this.paused) this.stopVoices();
        this.syncMusic();
    }

    setHidden(hidden) {
        if (this.disposed) return;
        this.hidden = Boolean(hidden);
        if (this.hidden) this.stopVoices();
        this.syncMusic();
    }

    play(kind) {
        const cue = FEEDBACK_TONES[kind];
        if (!cue || this.disposed || this.hidden || !this.soundEnabled
            || this.context?.state !== 'running' || this.voices.size >= 4) return false;
        const [start, end, duration, level, waveform, cooldown] = cue;
        const time = this.now();
        if ((time - (this.lastPlayed.get(kind) ?? -Infinity)) < cooldown) return false;
        try {
            const now = this.context.currentTime;
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            const voice = { osc, gain };
            osc.type = waveform;
            osc.frequency.setValueAtTime(start, now);
            osc.frequency.exponentialRampToValueAtTime(end, now + duration);
            gain.gain.setValueAtTime(.0001, now);
            gain.gain.linearRampToValueAtTime(level, now + .015);
            gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
            osc.connect(gain);
            gain.connect(this.sfxBus);
            osc.onended = () => this.releaseVoice(voice);
            this.voices.add(voice);
            osc.start(now);
            osc.stop(now + duration + .005);
            this.lastPlayed.set(kind, time);
            return true;
        } catch {
            this.stopVoices();
            return false;
        }
    }

    releaseVoice(voice) {
        this.voices.delete(voice);
        disconnect(voice.osc);
        disconnect(voice.gain);
    }

    stopVoices() {
        for (const voice of [...this.voices]) {
            try { voice.osc.stop(); } catch {}
            this.releaseVoice(voice);
        }
    }

    syncMusic() {
        const shouldPlay = !this.disposed && !this.hidden && !this.paused
            && this.musicEnabled && this.gameId && this.context?.state === 'running';
        if (!shouldPlay) {
            this.stopMusic();
            return;
        }
        if (this.musicNodes.length) return;
        try {
            const frame = cafeMusicFrame(this.gameId, 0);
            if (!frame) return;
            for (const [frequency, wave] of [[frame.leadHz, frame.leadWave], [frame.bassHz, 'sine']]) {
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();
                osc.type = wave;
                osc.frequency.value = frequency;
                gain.gain.value = .0001;
                osc.connect(gain);
                gain.connect(this.musicBus);
                osc.start();
                this.musicNodes.push({ osc, gain });
            }
            this.musicStep = 0;
            this.advanceMusic();
        } catch {
            this.stopMusic();
        }
    }

    /**
     * Schedule one note at a time, always reusing two oscillators. Timers are
     * canceled on pause, mute, hidden tab, game switch and disposal.
     */
    advanceMusic() {
        if (this.disposed || this.hidden || this.paused || !this.musicEnabled
            || this.musicNodes.length !== 2 || this.context?.state !== 'running') return;
        const frame = cafeMusicFrame(this.gameId, this.musicStep);
        if (!frame) return;
        const now = this.context.currentTime;
        if (!Number.isFinite(now)) return;
        try {
            for (const [index, target] of [frame.leadHz, frame.bassHz].entries()) {
                const { osc, gain } = this.musicNodes[index];
                const volume = index === 0 ? .034 : .016;
                osc.frequency.setValueAtTime(target, now);
                gain.gain.setValueAtTime(.0001, now);
                gain.gain.linearRampToValueAtTime(volume, now + .05);
                gain.gain.setValueAtTime(volume, now + frame.beatSeconds * .53);
                gain.gain.linearRampToValueAtTime(.0001, now + frame.beatSeconds * .91);
            }
            this.musicStep++;
            this.musicTimer = globalThis.setTimeout(() => {
                this.musicTimer = null;
                this.advanceMusic();
            }, Math.max(50, Math.round(frame.beatSeconds * 1000)));
            this.musicTimer?.unref?.();
        } catch {
            this.stopMusic();
        }
    }

    stopMusic() {
        if (this.musicTimer !== null) globalThis.clearTimeout(this.musicTimer);
        this.musicTimer = null;
        this.musicStep = 0;
        for (const { osc, gain } of this.musicNodes) {
            try { osc.stop(); } catch {}
            disconnect(osc);
            disconnect(gain);
        }
        this.musicNodes.length = 0;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.stopMusic();
        this.stopVoices();
        this.lastPlayed.clear();
        disconnect(this.sfxBus);
        disconnect(this.musicBus);
        disconnect(this.master);
        try { this.context?.close?.()?.catch?.(() => undefined); } catch {}
        this.context = null;
        this.master = null;
        this.musicBus = null;
        this.sfxBus = null;
    }
}
