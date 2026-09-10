export default class TelemetryBuffer {
  constructor({capacity=256, clock=()=>Date.now()}={}){this.capacity=capacity;this.clock=clock;this.events=[]}
  record(name,data={}){if(!name)return false;this.events.push(Object.freeze({name:String(name),data:Object.freeze({...data}),at:this.clock()}));if(this.events.length>this.capacity)this.events.shift();return true}
  drain(){const out=this.events.slice();this.events.length=0;return out}
  snapshot(){return this.events.slice()}
}
