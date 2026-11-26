/**
 * Reports target criteria, never a forged production/pass status.
 * A 60 FPS target may only be assessed when a measured 60 FPS segment exists.
 * Physical thermal and battery measurements are always independently signed.
 */
export function evaluateDeviceQaTargets(report, { minActiveMs = 15 * 60_000 } = {}) {
    const frames = report?.frameIntervalMs;
    const segments = Array.isArray(report?.targetSegments) ? report.targetSegments : [];
    const has60 = segments.some(s => s.targetFps === 60 && s.intervals >= 2);
    const activeMs=Number(report?.activeGameplayMs) || 0;
    const fps=Number(report?.averageRenderedFps);
    const p95=Number(frames?.p95);
    const memory=report?.jsHeap ?? {};
    const growthPct=memory.supported && Number.isFinite(memory.firstBytes)
        && memory.firstBytes > 0 && Number.isFinite(memory.lastBytes)
        ? (memory.lastBytes - memory.firstBytes) * 100 / memory.firstBytes : null;
    const checks = {
        fifteenMinutes: { status:activeMs >= minActiveMs?'observed':'insufficient-data', observedMs:activeMs,targetMs:minActiveMs },
        frameP95: { status:frames?.count > 20 && has60 ? p95 <= 20 ? 'within-target':'above-target'
            : 'insufficient-data', observedMs:frames?.count ? p95 : null,targetMs:20 },
        averageFps60: { status:frames?.count > 20 && has60 ? fps >= 55?'within-target':'below-target'
            : 'insufficient-data', observedFps:Number.isFinite(fps)?fps:null,targetFps:60 },
        heapGrowth: { status:growthPct === null || memory.samples < 2 ? 'unsupported'
            : growthPct > 10 ? 'investigate' : 'within-proxy-target',
            observedPercent:growthPct,targetPercent:10 },
        touchToPhoton: { status:'requires-physical-measurement',targetMs:100 },
        thermalAndBattery: { status:'requires-physical-measurement' },
    };
    return {
        schemaVersion:1,evidenceType:'browser-measurements-only',
        productionCertified:false,physicalPhoneVerified:false,checks,
        constraints:['Heap is JavaScript-only and subject to GC effects; it cannot prove a leak.',
            'Frame p95 is submitted RAF interval, not GPU presentation.',
            'The 60 FPS criterion cannot pass on a device configured to 30 FPS.',
            'Touch-to-photon, heat and battery require external physical tools.',
            'A 15-minute measured session on each actual Android/iOS target is required.'],
    };
}
