export default class NetworkTransport {
  constructor({ socketFactory, clock = () => Date.now(), maxBackoffMs = 10000 } = {}) { this.socketFactory=socketFactory; this.clock=clock; this.maxBackoffMs=maxBackoffMs; this.socket=null; this.state='offline'; this.attempt=0; this.handlers=new Map(); }
  on(event, fn){const s=this.handlers.get(event)||new Set();s.add(fn);this.handlers.set(event,s);return()=>s.delete(fn)}
  emit(event,payload){this.handlers.get(event)?.forEach(fn=>fn(payload))}
  connect(){if(!this.socketFactory) throw new TypeError('socketFactory is required'); if(this.state==='connecting'||this.state==='connected')return; this.state='connecting'; this.socket=this.socketFactory(); this.socket.onopen=()=>{this.state='connected';this.attempt=0;this.emit('connected')}; this.socket.onmessage=e=>{try{const m=typeof e.data==='string'?JSON.parse(e.data):e.data;if(m?.type)this.emit(m.type,m.payload??m)}catch(error){this.emit('protocolError',error)}}; this.socket.onerror=e=>this.emit('error',e); this.socket.onclose=()=>{this.state='offline';this.emit('disconnected');}; return this; }
  send(type,payload){if(this.state!=='connected'||!this.socket) return false; this.socket.send(JSON.stringify({type,payload,at:this.clock()})); return true}
  disconnect(){this.socket?.close?.();this.socket=null;this.state='offline';}
  reconnectDelay(){return Math.min(this.maxBackoffMs,250*2**this.attempt++)}
}
