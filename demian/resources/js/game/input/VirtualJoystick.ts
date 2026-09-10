/** Framework-agnostic virtual joystick. DOM binding is optional so the class
 * can be used by Phaser scenes and deterministic tests alike. */
export class VirtualJoystick {
  private vector = { x: 0, y: 0, magnitude: 0 };
  private pointerId: number | null = null;
  private listeners = new Set<(value: Readonly<{x:number;y:number;magnitude:number}>) => void>();
  constructor(private readonly options: { deadZone?: number; maxRadius?: number; element?: any } = {}) {
    if (options.element?.addEventListener) this.bind(options.element);
  }
  onChange(listener: (value: Readonly<{x:number;y:number;magnitude:number}>) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get value() { return Object.freeze({ ...this.vector }); }
  setVector(x: number, y: number) {
    const length = Math.hypot(Number(x) || 0, Number(y) || 0);
    const scale = length > 1 ? 1 / length : 1;
    const nx = (Number(x) || 0) * scale, ny = (Number(y) || 0) * scale;
    const dead = Math.min(Math.max(this.options.deadZone ?? 0.12, 0), 0.9);
    const magnitude = Math.min(Math.max((Math.min(length, 1) - dead) / (1 - dead), 0), 1);
    this.vector = { x: nx * magnitude, y: ny * magnitude, magnitude };
    this.listeners.forEach(listener => listener(this.value));
    return this.value;
  }
  reset() { return this.setVector(0, 0); }
  private bind(element: any) {
    const point = (event: any) => { if (this.pointerId !== event.pointerId) return; const r = element.getBoundingClientRect(); const radius = this.options.maxRadius ?? Math.min(r.width, r.height) * .4; this.setVector((event.clientX - (r.left+r.width/2))/radius, (event.clientY - (r.top+r.height/2))/radius); };
    const down = (event: any) => { event.preventDefault?.(); this.pointerId = event.pointerId; element.setPointerCapture?.(event.pointerId); point(event); };
    const up = (event: any) => { if (this.pointerId !== event.pointerId) return; this.pointerId = null; this.reset(); };
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', point); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); element.addEventListener('lostpointercapture', up);
    (this as any).unbind = () => { element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', point); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); element.removeEventListener('lostpointercapture', up); };
  }
  destroy() { (this as any).unbind?.(); this.listeners.clear(); this.reset(); }
}
