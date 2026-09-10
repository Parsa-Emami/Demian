/** Fixed-step client prediction with authoritative reconciliation. */
export default class ClientPrediction {
  constructor({ simulate, clone = value => structuredClone(value), maxPending = 128 } = {}) { if (typeof simulate !== 'function') throw new TypeError('simulate is required'); this.simulate=simulate; this.clone=clone; this.maxPending=maxPending; this.sequence=0; this.state=null; this.pending=[]; }
  start(state){this.state=this.clone(state);this.pending=[];this.sequence=0;return this.clone(this.state)}
  submit(input, dt){if(this.state===null) throw new Error('Prediction is not started.'); const command=Object.freeze({sequence:++this.sequence,input:this.clone(input),dt}); this.state=this.simulate(this.clone(this.state),this.clone(input),dt);this.pending.push(command);if(this.pending.length>this.maxPending)this.pending.shift();return {command,state:this.clone(this.state)}}
  reconcile(authoritative){if(!authoritative||!Number.isInteger(authoritative.sequence))return false;this.state=this.clone(authoritative.state);this.pending=this.pending.filter(command=>command.sequence>authoritative.sequence);for(const command of this.pending)this.state=this.simulate(this.clone(this.state),this.clone(command.input),command.dt);return true}
  snapshot(){return {state:this.clone(this.state),pending:this.pending.map(command=>({...command,input:this.clone(command.input)})),sequence:this.sequence}}
}
