const VERSION=2;function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}function hash(text){let value=2166136261;for(let i=0;i<text.length;i+=1){value^=text.charCodeAt(i);value=Math.imul(value,16777619);}return(value>>>0).toString(16).padStart(8,'0');}
export default class RolePlaySaveStore{
 constructor({storage=globalThis.localStorage,key='demian.role-play.save.v2'}={}){this.storage=storage;this.key=key;}
 createEnvelope(state){const payload={version:VERSION,savedAt:new Date().toISOString(),state:clone(state)};return{...payload,checksum:hash(JSON.stringify(payload))};}
 save(state){const envelope=this.createEnvelope(state);this.storage?.setItem(this.key,JSON.stringify(envelope));return Object.freeze(envelope);}
 load(){const raw=this.storage?.getItem(this.key);if(!raw)return null;try{const parsed=JSON.parse(raw);const migrated=this.migrate(parsed);const checksum=migrated.checksum;const payload={version:migrated.version,savedAt:migrated.savedAt,state:migrated.state};if(checksum!==hash(JSON.stringify(payload)))throw new Error('Role Play save checksum mismatch.');return clone(migrated.state);}catch(error){return null;}}
 migrate(envelope){if(envelope.version===VERSION)return envelope;if(envelope.version===1){const payload={version:VERSION,savedAt:envelope.savedAt??new Date().toISOString(),state:{...envelope.state,equipment:envelope.state?.equipment??{},dialogue:envelope.state?.dialogue??{completed:[]}}};return{...payload,checksum:hash(JSON.stringify(payload))};}throw new Error('Unsupported Role Play save version.');}
 clear(){this.storage?.removeItem(this.key);} static get version(){return VERSION;}
}
