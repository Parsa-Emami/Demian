export default class SessionReplication {
  constructor({ maxSnapshots=32, interpolationDelay=100 }={}) { this.maxSnapshots=maxSnapshots;this.interpolationDelay=interpolationDelay;this.snapshots=[];this.lastSequence=-1; }
  push(snapshot){if(!snapshot||!Number.isInteger(snapshot.sequence)||snapshot.sequence<=this.lastSequence)return false;this.lastSequence=snapshot.sequence;this.snapshots.push(Object.freeze({...snapshot,receivedAt:Number(snapshot.receivedAt??Date.now())}));if(this.snapshots.length>this.maxSnapshots)this.snapshots.splice(0,this.snapshots.length-this.maxSnapshots);return true}
  sample(now=Date.now()){if(!this.snapshots.length)return null;const target=now-this.interpolationDelay;let a=this.snapshots[0],b=this.snapshots.at(-1);for(let i=1;i<this.snapshots.length;i++){if(this.snapshots[i].receivedAt>=target){a=this.snapshots[i-1];b=this.snapshots[i];break}}if(a===b)return a;const t=Math.max(0,Math.min(1,(target-a.receivedAt)/Math.max(1,b.receivedAt-a.receivedAt)));return {...b, state:this.interpolate(a.state,b.state,t)} }
  interpolate(a,b,t){if(!a||!b)return b??a;const out={...b};for(const k of ['x','y','z'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))out[k]=a[k]+(b[k]-a[k])*t;return out}
  clear(){this.snapshots=[];this.lastSequence=-1}
}
