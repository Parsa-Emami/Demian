import { evaluateCondition } from './DialogueCondition.js';import { executeDialogueActions } from './DialogueAction.js';
export default class DialogueRunner{
 constructor({context,onEvent=null}={}){this.context=context;this.onEvent=onEvent;this.definition=null;this.nodeId=null;this.history=[];this.ended=true;}
 async start(definition,startNode=null){this.definition=definition;this.nodeId=startNode??definition.start;this.history=[];this.ended=false;await this.enterNode(this.nodeId);this.emit('started');return this.snapshot();}
 current(){return this.ended?null:this.definition?.nodes?.[this.nodeId]??null;}
 choices(){return (this.current()?.choices??[]).filter((choice)=>evaluateCondition(choice.condition,this.context));}
 async enterNode(nodeId){const node=this.definition.nodes[nodeId];if(!node)throw new Error(`Missing dialogue node: ${nodeId}`);this.nodeId=nodeId;this.history.push(nodeId);await executeDialogueActions(node.actions??[],this.context);this.emit('node');if(node.end&&!(node.choices?.length))this.end('node-end');}
 async select(choiceId){if(this.ended)return null;const choice=this.choices().find((entry)=>entry.id===choiceId);if(!choice)throw new Error(`Dialogue choice is not available: ${choiceId}`);await executeDialogueActions(choice.actions??[],this.context);this.emit('choice',{choiceId});if(choice.next)await this.enterNode(choice.next);else this.end('choice-end');return this.snapshot();}
 end(reason='closed'){if(this.ended)return;this.ended=true;this.emit('ended',{reason});}
 emit(type,detail={}){this.onEvent?.({type,dialogueId:this.definition?.id,nodeId:this.nodeId,...detail,snapshot:this.snapshot()});}
 snapshot(){const node=this.current();return Object.freeze({dialogueId:this.definition?.id??null,nodeId:this.ended?null:this.nodeId,ended:this.ended,speaker:node?.speaker??this.definition?.speaker??null,text:node?.text??'',choices:Object.freeze(this.choices().map((c)=>Object.freeze({id:c.id,text:c.text}))),history:Object.freeze([...this.history])});}
}
