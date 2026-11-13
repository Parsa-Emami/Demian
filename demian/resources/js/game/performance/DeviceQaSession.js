class Distribution {
    constructor() {
        this.buckets = new Uint32Array(1001);
        this.count = 0;
        this.total = 0;
        this.max = 0;
    }

    add(value) {
        if (!Number.isFinite(value) || value < 0) return;
        this.buckets[Math.min(1000, Math.ceil(value))] += 1;
        this.count += 1;
        this.total += value;
        this.max = Math.max(this.max, value);
    }

    percentile(fraction) {
        if (!this.count) return null;
        let sum = 0;
        for (let i = 0; i < this.buckets.length; i += 1) {
            sum += this.buckets[i];
            if (sum >= Math.ceil(this.count * fraction)) return i === 1000 ? this.max : i;
        }
        return null;
    }

    snapshot() {
        return { count: this.count, mean: this.count ? this.total / this.count : null,
            p50: this.percentile(.5), p95: this.percentile(.95), p99: this.percentile(.99), max: this.count ? this.max : null };
    }
}

export default class DeviceQaSession {
    constructor({ now = () => performance.now() } = {}) {
        this.now = now;
        this.running = false;
    }

    start(metadata = {}) {
        this.metadata = { ...metadata };
        this.startedAt = this.now();
        this.endedAt = null;
        this.frames = new Distribution();
        this.frameCpuWork = new Distribution();
        this.dispatchDelay = new Distribution();
        this.nextRenderDelay = new Distribution();
        this.pending = [];
        this.droppedInputs = 0;
        this.discardedInputs = 0;
        this.slowFrames = 0;
        this.missedFrames = 0;
        this.activeMs = 0;
        this.segments = [];
        this.segmentOverflow = 0;
        this.segment = null;
        this.memory = { source: 'performance.memory.usedJSHeapSize', supported: false, samples: 0,
            firstBytes: null, lastBytes: null, peakBytes: null };
        this.markers = [];
        this.markerOverflow = 0;
        this.previous = null;
        this.running = true;
    }

    boundary(label = 'boundary') {
        if (!this.running) return;
        this.previous = null;
        this.discardedInputs += this.pending.length;
        this.pending.length = 0;
        this.segment = null;
        if (this.markers.length < 100) this.markers.push({ elapsedMs: this.now() - this.startedAt, label: String(label).slice(0, 150) });
        else this.markerOverflow += 1;
    }

    input(eventTime, receivedAt = this.now()) {
        if (!this.running || !Number.isFinite(eventTime) || eventTime < 0 || eventTime > receivedAt) return;
        this.dispatchDelay.add(receivedAt - eventTime);
        if (this.pending.length < 128) this.pending.push(eventTime);
        else this.droppedInputs += 1;
    }

    frame(timestamp, targetFps = 60, context = '') {
        if (!this.running || !Number.isFinite(timestamp)) return;
        const fps = targetFps === 30 ? 30 : 60;
        if (!this.segment || this.segment.targetFps !== fps || this.segment.context !== context) {
            this.previous = null;
            this.segment = { targetFps: fps, context, intervals: 0, activeMs: 0, slowFrames: 0 };
            if (this.segments.length < 100) this.segments.push(this.segment);
            else this.segmentOverflow += 1;
        }
        if (this.previous !== null && timestamp > this.previous) {
            const interval = timestamp - this.previous;
            const budget = 1000 / fps;
            this.frames.add(interval);
            this.activeMs += interval;
            this.segment.intervals += 1;
            this.segment.activeMs += interval;
            if (interval > budget * 1.5) {
                this.slowFrames += 1;
                this.segment.slowFrames += 1;
            }
            this.missedFrames += Math.max(0, Math.round(interval / budget) - 1);
        }
        this.previous = timestamp;
        for (const eventTime of this.pending) this.nextRenderDelay.add(Math.max(0, timestamp - eventTime));
        this.pending.length = 0;
    }

    sampleFrameWork(milliseconds) {
        if (!this.running || !Number.isFinite(milliseconds) || milliseconds < 0) return;
        this.frameCpuWork.add(milliseconds);
    }

    sampleMemory(bytes) {
        if (!this.running || !Number.isFinite(bytes) || bytes <= 0) return;
        this.memory.supported = true;
        this.memory.samples += 1;
        this.memory.firstBytes ??= bytes;
        this.memory.lastBytes = bytes;
        this.memory.peakBytes = Math.max(this.memory.peakBytes ?? 0, bytes);
    }

    stop() {
        if (this.running) this.endedAt = this.now();
        this.running = false;
        this.discardedInputs = (this.discardedInputs ?? 0) + (this.pending?.length ?? 0);
        this.pending = [];
        return this.report();
    }

    report() {
        if (!this.frames) return null;
        return {
            schemaVersion: 1, evidenceType: 'unverified-browser-session', physicalPhoneVerified: false,
            metadata: { ...this.metadata }, elapsedMs: (this.endedAt ?? this.now()) - this.startedAt,
            activeGameplayMs: this.activeMs, frameIntervalMs: this.frames.snapshot(),
            frameCpuWorkMs: this.frameCpuWork.snapshot(),
            averageRenderedFps: this.activeMs ? this.frames.count * 1000 / this.activeMs : null,
            slowFrames: this.slowFrames, estimatedMissedFrames: this.missedFrames,
            targetSegments: this.segments.map(segment => ({ ...segment })), segmentOverflow: this.segmentOverflow,
            eventToDispatchMs: this.dispatchDelay.snapshot(), eventToRenderSubmissionMs: this.nextRenderDelay.snapshot(),
            droppedInputSamples: this.droppedInputs, pendingInputSamples: this.pending.length,
            discardedAtBoundaryInputSamples: this.discardedInputs,
            jsHeap: { ...this.memory }, markers: this.markers.map(marker => ({ ...marker })), markerOverflow: this.markerOverflow,
            limitations: ['Percentiles use 1 ms histogram buckets; intervals >= 1000 ms use the observed maximum.',
                'Frames are successful game render submissions while playing, excluding lifecycle boundaries.',
                'Frame CPU work measures JavaScript callback wall time (input, simulation, render submission); it is not GPU execution time, power draw or energy consumption.',
                'Input latency is an event-to-render-submission proxy, not touch-to-photon latency or confirmed action response.',
                'JS heap is browser-specific and excludes decoded images, GPU allocations and resident process memory.',
                'Physical device, thermal state and OS memory require external evidence; this report never certifies them.'],
        };
    }
}
