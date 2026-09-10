import { VirtualJoystick } from './VirtualJoystick';
export type MobileInputSnapshot = Readonly<{ x:number; z:number; tap: Readonly<{x:number;z:number}>|null; held: ReadonlySet<string>; pressed: ReadonlySet<string> }>;
/** Owns touch controls and guarantees a clean release on cancel/visibility loss. */
export class MobileInputManager {
  private held = new Set<string>(); private pressed = new Set<string>(); private tap: {x:number;z:number}|null = null;
  private joystick: VirtualJoystick|null = null; private disposers: Array<()=>void> = [];
  constructor(private readonly root: any = null) { if (root?.addEventListener) { const clear=()=>this.clear(); root.addEventListener('visibilitychange',clear); root.addEventListener('blur',clear); this.disposers.push(()=>root.removeEventListener('visibilitychange',clear),()=>root.removeEventListener('blur',clear)); } }
  bindJoystick(joystick: VirtualJoystick) { this.joystick?.destroy(); this.joystick=joystick; return joystick.onChange(()=>{}); }
  bindAction(element:any, action:string, mode:'press'|'hold'='press') { if (!element?.addEventListener || !action) throw new TypeError('A mobile action requires an element and action.'); const down=(e:any)=>{e.preventDefault?.(); if(mode==='hold') this.held.add(action); else this.pressed.add(action); element.setPointerCapture?.(e.pointerId);}; const up=()=>this.held.delete(action); element.addEventListener('pointerdown',down); if(mode==='hold'){element.addEventListener('pointerup',up);element.addEventListener('pointercancel',up);element.addEventListener('lostpointercapture',up);} const off=()=>{element.removeEventListener('pointerdown',down);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',up);element.removeEventListener('lostpointercapture',up);}; this.disposers.push(off); return off; }
  setTapTarget(x:number,z:number) { if (!Number.isFinite(x)||!Number.isFinite(z)) return false; this.tap={x,z}; return true; }
  consume(action:string) { const value=this.pressed.has(action); this.pressed.delete(action); return value; }
  snapshot(): MobileInputSnapshot { const v=this.joystick?.value ?? {x:0,y:0,magnitude:0}; const out={x:v.x,z:v.y,tap:this.tap,held:new Set(this.held),pressed:new Set(this.pressed)}; this.tap=null; this.pressed.clear(); return out; }
  clear() { this.held.clear(); this.pressed.clear(); this.tap=null; this.joystick?.reset(); }
  dispose() { this.disposers.splice(0).forEach(off=>off()); this.joystick?.destroy(); this.joystick=null; this.clear(); }
}
