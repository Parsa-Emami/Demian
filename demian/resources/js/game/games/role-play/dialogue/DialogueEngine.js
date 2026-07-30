import DialogueRunner from './DialogueRunner.js';
export default class DialogueEngine{
 constructor({definitions=[],context,onEvent=null}={}){this.definitions=new Map(definitions.map((d)=>[d.id,d]));this.context=context;this.onEvent=onEvent;this.runner=null;this.completed=new Set();this.choiceLog=[];}
 register(definition){if(this.definitions.has(definition.id))throw new Error(`Duplicate dialogue: ${definition.id}`);this.definitions.set(definition.id,definition);return definition;}
 async start(id,startNode=null){const definition=this.definitions.get(id);if(!definition)throw new Error(`Unknown dialogue: ${id}`);this.runner=new DialogueRunner({context:this.context,onEvent:(event)=>{if(event.type==='ended')this.completed.add(id);if(event.type==='choice')this.choiceLog.push(Object.freeze({dialogueId:id,choiceId:event.choiceId,at:Date.now()}));this.onEvent?.(event);}});return this.runner.start(definition,startNode);}
 active(){return this.runner&&!this.runner.ended;}
 async choose(id){return this.runner?.select(id)??null;}
 close(reason='closed'){this.runner?.end(reason);}
 snapshot(){return this.runner?.snapshot()??Object.freeze({ended:true,choices:Object.freeze([])});}
 export(){return {completed:[...this.completed],choices:this.choiceLog.map((entry)=>({...entry}))};}
 import(data={}){this.completed=new Set(data.completed??[]);this.choiceLog=(data.choices??[]).map((entry)=>Object.freeze({...entry}));}
}
