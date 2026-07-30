import SpeedModifier from './SpeedModifier.js'; import LowGravityModifier from './LowGravityModifier.js'; import FogModifier from './FogModifier.js'; import DoubleScoreModifier from './DoubleScoreModifier.js';
const TYPES=Object.freeze({speed:SpeedModifier,'low-gravity':LowGravityModifier,fog:FogModifier,'double-score':DoubleScoreModifier});
export function createModifier(definition){ const Modifier=TYPES[definition.type]; if(!Modifier)throw new Error(`Unsupported modifier type: ${definition.type}`); return new Modifier(definition); }
export default class ModifierSystem {
 constructor(){ this.runtime=this.createRuntime(); this.modifiers=[]; }
 createRuntime(){ return {movementSpeedMultiplier:1,gravityMultiplier:1,fogDensity:.018,viewDistanceMultiplier:1,scoreMultiplier:1}; }
 apply(definitions=[]){ this.reset(); this.modifiers=definitions.map(createModifier); this.modifiers.forEach((modifier)=>modifier.apply(this.runtime)); return this.snapshot(); }
 reset(){ [...this.modifiers].reverse().forEach((modifier)=>modifier.revert(this.runtime)); this.modifiers=[]; this.runtime=this.createRuntime(); }
 snapshot(){ return Object.freeze({...this.runtime,modifiers:Object.freeze(this.modifiers.map((modifier)=>modifier.snapshot()))}); }
 dispose(){ this.reset(); }
}
