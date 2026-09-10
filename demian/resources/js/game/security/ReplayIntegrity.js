/** Hash-chain integrity for local replay/evidence payloads. */
export default class ReplayIntegrity {
  constructor({ hash = ReplayIntegrity.fnv1a } = {}) { this.hash=hash; }
  seal(events){let previous='0';return events.map((event,index)=>{const payload=JSON.stringify({index,event,previous});const digest=this.hash(payload);previous=digest;return Object.freeze({index,event,previous:digest})})}
  verify(sealed){let previous='0';for(let i=0;i<sealed.length;i++){const item=sealed[i];if(item.index!==i)return false;const expected=this.hash(JSON.stringify({index:i,event:item.event,previous}));if(expected!==item.previous)return false;previous=expected}return true}
  static fnv1a(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
}
