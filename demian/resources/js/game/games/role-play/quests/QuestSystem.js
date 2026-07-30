import QuestTracker from './QuestTracker.js';
export default class QuestSystem{
 constructor({definitions=[],rewardHandler=null,onEvent=null}={}){this.definitions=new Map(definitions.map((d)=>[d.id,d]));this.trackers=new Map();this.completed=new Set();this.rewarded=new Set();this.rewardHandler=rewardHandler;this.onEvent=onEvent;}
 has(id){return this.definitions.has(id);} status(id){if(this.completed.has(id))return'completed';return this.trackers.get(id)?.status??'not-started';}
 start(id){if(this.completed.has(id))return this.trackers.get(id)?.snapshot()??null;if(this.trackers.has(id))return this.trackers.get(id).snapshot();const definition=this.definitions.get(id);if(!definition)throw new Error(`Unknown quest: ${id}`);if((definition.requiresQuests??[]).some((q)=>!this.completed.has(q)))return false;const tracker=new QuestTracker(definition);this.trackers.set(id,tracker);this.emit('started',tracker);return tracker.snapshot();}
 async dispatch(event){const completed=[];for(const tracker of this.trackers.values()){const before=tracker.status;if(!tracker.apply(event))continue;this.emit('progress',tracker,{event});if(before!=='completed'&&tracker.status==='completed'){this.completed.add(tracker.definition.id);completed.push(tracker.definition.id);await this.reward(tracker);this.emit('completed',tracker);}}return completed;}
 async reward(tracker){const id=tracker.definition.id;if(this.rewarded.has(id))return false;this.rewarded.add(id);await this.rewardHandler?.(tracker.definition.rewards??[],{questId:id});return true;}
 active(){return [...this.trackers.values()].filter((t)=>t.status==='active').map((t)=>t.snapshot());}
 all(){return [...this.trackers.values()].map((t)=>t.snapshot());}
 snapshot(){return Object.freeze({active:Object.freeze(this.active()),completed:Object.freeze([...this.completed]),rewarded:Object.freeze([...this.rewarded])});}
 export(){return{trackers:Object.fromEntries([...this.trackers].map(([id,t])=>[id,t.export()])),completed:[...this.completed],rewarded:[...this.rewarded]};}
 import(data={}){this.completed=new Set(data.completed??[]);this.rewarded=new Set(data.rewarded??[]);for(const[id,state]of Object.entries(data.trackers??{})){const definition=this.definitions.get(id);if(!definition)continue;const tracker=new QuestTracker(definition);tracker.import(state);this.trackers.set(id,tracker);}}
 emit(type,tracker,detail={}){this.onEvent?.({type,questId:tracker.definition.id,snapshot:tracker.snapshot(),...detail});}
}
