export default class EquipmentSystem {
    constructor({ inventory, registry, slots = ['outfit','tool','accessory'] } = {}) { this.inventory=inventory; this.registry=registry; this.slots=new Map(slots.map((s)=>[s,null])); }
    equip(itemId, slot=null){const item=this.registry.get(itemId);const target=slot??item.equipSlot;if(!target||!this.slots.has(target))throw new Error(`Invalid equipment slot: ${target}`);if(!this.inventory.has(itemId))throw new Error(`Item is not in inventory: ${itemId}`);this.slots.set(target,itemId);return item;}
    unequip(slot){const item=this.slots.get(slot)??null;this.slots.set(slot,null);return item;}
    get(slot){return this.slots.get(slot)??null;}
    snapshot(){return Object.freeze(Object.fromEntries(this.slots));}
    import(data={}){for(const slot of this.slots.keys()){const itemId=data[slot]??null;this.slots.set(slot,itemId&&this.registry.has(itemId)?itemId:null);}}
}
