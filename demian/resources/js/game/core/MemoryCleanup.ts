export class MemoryCleanup {
  private disposers = new Set<() => void>();
  track(disposer: () => void) { this.disposers.add(disposer); return () => this.disposers.delete(disposer); }
  trackEvent(emitter: any, event: string, handler: (...args: any[]) => void) { emitter?.on?.(event, handler); return this.track(() => emitter?.off?.(event, handler)); }
  trackTimer(timer: any) { return this.track(() => { timer?.remove?.(); timer?.destroy?.(); }); }
  dispose() { [...this.disposers].reverse().forEach(fn => { try { fn(); } catch {} }); this.disposers.clear(); }
  get size() { return this.disposers.size; }
}
