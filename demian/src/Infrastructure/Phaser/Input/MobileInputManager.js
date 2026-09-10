export class MobileInputManager {
  constructor({ root = null, joystick = null } = {}) { this.root=root; this.joystick=joystick; this.held=new Set(); this.pressed=new Set(); this.tap=null; this.disposers=[]; }
  addHandler(handler){ if(typeof handler!=='function') throw new TypeError('Input handler must be a function.'); this.disposers.push(handler); return ()=>{const i=this.disposers.indexOf(handler);if(i>=0)this.disposers.splice(i,1);}; }
  bindAction(element, action, mode='press') { if(!element?.addEventListener||!action) throw new TypeError('A mobile action requires an element and action.'); const down=e=>{e.preventDefault?.(); mode==='hold'?this.held.add(action):this.pressed.add(action); element.setPointerCapture?.(e.pointerId);}; const up=()=>this.held.delete(action); element.addEventListener('pointerdown',down); if(mode==='hold'){element.addEventListener('pointerup',up);element.addEventListener('pointercancel',up);element.addEventListener('lostpointercapture',up);} const off=()=>{element.removeEventListener('pointerdown',down);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',up);element.removeEventListener('lostpointercapture',up);}; this.disposers.push(off); return off; }
  setTapTarget(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return false;this.tap={x,z};return true;}
  update(pointer){if(pointer?.tapTarget)this.setTapTarget(pointer.tapTarget.x,pointer.tapTarget.z); this.disposers.filter(fn=>fn.length===1).forEach(fn=>fn(pointer)); return this.snapshot();}
  consume(action){const hit=this.pressed.has(action);this.pressed.delete(action);return hit;}
  snapshot(){const v=this.joystick?.vector??{x:0,y:0};const out={x:v.x,z:v.y,tap:this.tap,held:new Set(this.held),pressed:new Set(this.pressed)};this.tap=null;this.pressed.clear();return out;}
  clear(){this.held.clear();this.pressed.clear();this.tap=null;this.joystick?.reset?.();}
  dispose(){this.disposers.splice(0).forEach(fn=>fn());this.clear();}
}
