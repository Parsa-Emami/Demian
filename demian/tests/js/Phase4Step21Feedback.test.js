import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import EventBus from '../../resources/js/game/core/EventBus.js';
import FeedbackAudioEngine from '../../resources/js/game/services/FeedbackAudioEngine.js';
import FeedbackBurstPool from '../../resources/js/game/services/FeedbackBurstPool.js';
import GameFeedbackDirector from '../../resources/js/game/services/GameFeedbackDirector.js';

class FakeParam {
    constructor() { this.value = 0; }
    setValueAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeNode {
    constructor() {
        this.gain = new FakeParam();
        this.frequency = new FakeParam();
        this.started = 0;
        this.stopped = 0;
    }
    connect() {}
    disconnect() {}
    start() { this.started++; }
    stop() {
        if (this.stopped++) throw new Error('voice stopped twice');
        this.onended?.();
    }
}

class FakeAudioContext {
    constructor() {
        this.state = 'running';
        this.destination = {};
        this.currentTime = 10;
        this.oscillators = [];
        this.closed = false;
    }
    createGain() { return new FakeNode(); }
    createOscillator() {
        const voice = new FakeNode();
        this.oscillators.push(voice);
        return voice;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
}

function fakeHost() {
    const host = {
        isConnected: true, nodes: [],
        ownerDocument: { createElement() {
            const classes = new Set();
            return {
                isConnected: true,
                dataset: {}, hidden: true, offsetWidth: 8,
                style: { setProperty() {} },
                classList: { add(key) { classes.add(key); }, remove(key) { classes.delete(key); } },
                setAttribute() {}, addEventListener(name, handler) { this[name] = handler; },
                remove() { this.isConnected = false; },
            };
        } },
        appendChild(node) { this.nodes.push(node); },
    };
    return host;
}

test('Step 21 audio never creates an AudioContext before a user gesture', () => {
    let created = 0;
    const audio = new FeedbackAudioEngine({ createContext: () => { created++; return new FakeAudioContext(); } });
    audio.setGame('dino-run');
    assert.equal(audio.play('score'), false);
    assert.equal(created, 0);
    assert.equal(audio.musicNodes.length, 0);
    assert.equal(audio.unlock(), true);
    assert.equal(created, 1);
    assert.equal(audio.musicNodes.length, 2);
    audio.dispose();
    assert.equal(audio.context, null);
});

test('Step 21 audio enforces cooldown, bounded polyphony, mute and music lifecycle', () => {
    let clock = 1000;
    const context = new FakeAudioContext();
    const audio = new FeedbackAudioEngine({ createContext: () => context, now: () => clock });
    audio.setGame('after-hours');
    audio.unlock();
    assert.equal(audio.musicNodes.length, 2);
    assert.equal(audio.play('score'), true);
    assert.equal(audio.play('score'), false);
    for (const name of ['start', 'win', 'lose', 'discover', 'ui', 'error']) {
        clock += 300;
        audio.play(name);
    }
    assert.ok(audio.voices.size <= 4);
    audio.configure({ soundEnabled: false, musicEnabled: true });
    assert.equal(audio.voices.size, 0);
    assert.equal(audio.play('score'), false);
    assert.equal(audio.musicNodes.length, 2);
    audio.configure({ soundEnabled: false, musicEnabled: false });
    assert.equal(audio.musicNodes.length, 0);
    audio.configure({ soundEnabled: true, musicEnabled: true });
    assert.equal(audio.musicNodes.length, 2);
    audio.setPaused(true);
    assert.equal(audio.musicNodes.length, 0);
    audio.setPaused(false);
    assert.equal(audio.musicNodes.length, 2);
    audio.setHidden(true);
    assert.equal(audio.musicNodes.length, 0);
    audio.dispose();
    audio.dispose();
    assert.equal(context.closed, true);
});

test('Step 21 gracefully degrades on browsers without Web Audio', () => {
    const audio = new FeedbackAudioEngine({ createContext: () => null });
    assert.equal(audio.unlock(), false);
    audio.setGame('open-world');
    assert.equal(audio.play('start'), false);
    assert.doesNotThrow(() => audio.dispose());
});

test('Step 21 visual effects are pooled, throttled and disabled under reduced motion', () => {
    let clock = 500;
    let sequence = 0;
    const tasks = new Map();
    const host = fakeHost();
    const visual = new FeedbackBurstPool({
        host, maxNodes: 6, now: () => clock,
        schedule: handler => { const id = ++sequence; tasks.set(id, handler); return id; },
        cancel: id => tasks.delete(id),
    });
    assert.equal(visual.burst('win'), 6);
    assert.equal(visual.active.size, 6);
    assert.equal(visual.burst('win'), 0);
    assert.equal(visual.nodes.length, 6);
    const [first] = visual.nodes;
    first.animationend?.();
    assert.equal(visual.active.size, 5);
    clock += 400;
    assert.equal(visual.burst('score'), 1);
    visual.configure({ reducedMotion: true });
    assert.equal(visual.active.size, 0);
    assert.equal(tasks.size, 0);
    assert.equal(visual.burst('score'), 0);
    visual.configure({ reducedMotion: false, economy: true });
    clock += 400;
    assert.equal(visual.burst('score'), 2);
    visual.dispose();
    assert.equal(tasks.size, 0);
    assert.equal(visual.nodes.length, 0);
    assert.equal(host.nodes.every(node => !node.isConnected), true);
});

test('Step 21 feedback director isolates six games, pauses and clears state', () => {
    const host = fakeHost();
    const handlers = new Map();
    const root = {
        querySelector() { return host; },
        addEventListener(name, fn) { handlers.set(name, fn); },
        removeEventListener(name) { handlers.delete(name); },
    };
    const sounds = [];
    const audio = {
        voices: new Set(), musicNodes: [], settings: null,
        configure(settings) { this.settings = settings; },
        unlock() { sounds.push('unlock'); },
        play(kind) { sounds.push(kind); },
        setGame(gameId) { this.gameId = gameId; },
        setPaused(value) { this.paused = value; },
        setHidden(value) { this.hidden = value; },
        stopVoices() {}, dispose() { this.disposed = true; },
    };
    let now = 1000;
    const bus = new EventBus();
    const service = new GameFeedbackDirector({ root, eventBus: bus, audio, now: () => now });
    service.boot();
    service.boot();
    service.configure({ soundEnabled: true, musicEnabled: false });
    const games = ['dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash', 'open-world'];
    for (const gameId of games) {
        bus.emit('game:session-started', { gameId });
        assert.equal(service.snapshot().gameId, gameId);
        bus.emit('feedback:cue', { gameId: 'not-active', kind: 'passed' });
        const before = service.snapshot().effectNodes;
        now += 400;
        bus.emit('feedback:cue', { gameId, kind: gameId === 'dino-run' ? 'passed' : 'discovery' });
        assert.ok(service.snapshot().effectNodes >= before);
        bus.emit('game:loading', { gameId });
        assert.equal(service.snapshot().gameId, null);
        assert.equal(service.snapshot().activeEffects, 0);
        now += 400;
    }
    bus.emit('game:session-started', { gameId: 'dino-run' });
    bus.emit('game:session-paused', { gameId: 'dino-run' });
    assert.equal(service.snapshot().activeEffects, 0);
    const count = sounds.length;
    bus.emit('feedback:cue', { gameId: 'dino-run', kind: 'passed' });
    assert.equal(sounds.length, count);
    bus.emit('game:session-resumed', { gameId: 'dino-run' });
    assert.equal(audio.paused, false);
    bus.emit('game:completed', { gameId: 'dino-run', won: false });
    assert.equal(sounds.at(-1), 'lose');
    service.dispose();
    service.dispose();
    assert.equal(handlers.size, 0);
    assert.equal(audio.disposed, true);
});

const game = (name) => readFileSync(new URL('../../resources/js/game/games/' + name, import.meta.url), 'utf8');
const application = readFileSync(new URL('../../resources/js/game/application/GameApplication.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../resources/views/demian.blade.php', import.meta.url), 'utf8');
const style = readFileSync(new URL('../../resources/css/phase4-step21-feedback.css', import.meta.url), 'utf8');

test('Step 21 all six games have event-driven feedback without score or replay changes', () => {
    for (const path of [
        'dino-run/DinoRunGame.js', 'after-hours/AfterHoursGame.js',
        'cafe-rush/CafeRushGame.js', 'cafe-critters/CafeCrittersGame.js',
        'coffee-crash/CoffeeCrashGame.js',
    ]) assert.match(game(path), /eventBus\.emit\('feedback:cue'/);
    assert.match(game('open-world/OpenWorldGame.js'), /eventBus\.emit\('world:chunk-discovered'/);
    assert.match(application, /this\.feedback\.boot\(\)/);
    assert.match(application, /this\.feedback\.dispose\(\)/);
    assert.match(html, /data-game-feedback-host[^>]*aria-hidden="true"[^>]*inert/);
});

test('Step 21 visual effects remain noninteractive and respect motion settings', () => {
    assert.match(style, /pointer-events: none/);
    assert.match(style, /prefers-reduced-motion: reduce/);
    assert.match(style, /data-motion="reduced"/);
    assert.doesNotMatch(style, /z-index:\s*\d/);
});
