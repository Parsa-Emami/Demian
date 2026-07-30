import BaseObjective, { OBJECTIVE_STATUS } from './BaseObjective.js';
export default class ReachObjective extends BaseObjective { constructor(definition){ super(definition); this.zone=definition.zone; this.target=1; } apply(event){ if(this.status!==OBJECTIVE_STATUS.ACTIVE||event.type!=='reach'||event.zone!==this.zone)return false; return this.complete(); } }
