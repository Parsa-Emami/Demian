function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
export default class InventorySystem {
    constructor({ registry, capacity = 24, onChange = null } = {}) {
        if (!registry) throw new TypeError('Inventory requires an ItemRegistry.');
        this.registry=registry; this.capacity=Math.max(1, Math.floor(capacity)); this.stacks=[]; this.coins=0; this.onChange=onChange;
    }
    count(itemId) { return this.stacks.filter((s)=>s.itemId===itemId).reduce((sum,s)=>sum+s.quantity,0); }
    has(itemId, amount=1) { return this.count(itemId)>=amount; }
    freeSlots() { return this.capacity-this.stacks.length; }
    canAdd(itemId, amount=1) {
        const item=this.registry.get(itemId); let remaining=Math.max(0,Math.floor(amount));
        this.stacks.filter((s)=>s.itemId===itemId).forEach((s)=>{ remaining-=Math.max(0,item.stackSize-s.quantity); });
        return Math.ceil(Math.max(0,remaining)/item.stackSize)<=this.freeSlots();
    }
    add(itemId, amount=1, metadata={}) {
        const item=this.registry.get(itemId); let remaining=Math.max(0,Math.floor(amount));
        if (!remaining) return 0; if(!this.canAdd(itemId,remaining)) throw new Error('Inventory capacity exceeded.');
        this.stacks.filter((s)=>s.itemId===itemId && s.quantity<item.stackSize).forEach((stack)=>{ const n=Math.min(remaining,item.stackSize-stack.quantity); stack.quantity+=n; remaining-=n; });
        while(remaining>0){ const n=Math.min(remaining,item.stackSize); this.stacks.push({id:`${itemId}:${Date.now()}:${this.stacks.length}`,itemId,quantity:n,metadata:clone(metadata)}); remaining-=n; }
        this.emit('add',{itemId,amount}); return amount;
    }
    remove(itemId, amount=1) {
        let remaining=Math.max(0,Math.floor(amount)); if(this.count(itemId)<remaining) return false;
        for(let i=this.stacks.length-1;i>=0&&remaining>0;i-=1){const s=this.stacks[i]; if(s.itemId!==itemId)continue; const n=Math.min(remaining,s.quantity);s.quantity-=n;remaining-=n;if(s.quantity===0)this.stacks.splice(i,1);} this.emit('remove',{itemId,amount}); return true;
    }
    transact(operations=[]) {
        const before=this.export(); try { for(const op of operations){ if(op.type==='add')this.add(op.itemId,op.amount,op.metadata); else if(op.type==='remove'&&!this.remove(op.itemId,op.amount))throw new Error(`Missing item: ${op.itemId}`); else if(op.type==='coins')this.addCoins(op.amount); } return true; } catch(error){ this.import(before); throw error; }
    }
    addCoins(amount){this.coins=Math.max(0,this.coins+Math.floor(Number(amount)||0));this.emit('coins',{amount});return this.coins;}
    snapshot(){return Object.freeze({capacity:this.capacity,coins:this.coins,stacks:Object.freeze(this.stacks.map((s)=>Object.freeze({...s,metadata:Object.freeze({...s.metadata})})))});}
    export(){return {capacity:this.capacity,coins:this.coins,stacks:clone(this.stacks)};}
    import(data={}){this.capacity=Math.max(1,Math.floor(data.capacity??this.capacity));this.coins=Math.max(0,Math.floor(data.coins??0));this.stacks=Array.isArray(data.stacks)?clone(data.stacks).filter((s)=>this.registry.has(s.itemId)&&s.quantity>0):[];this.emit('import',{});}
    emit(type,detail){this.onChange?.({type,...detail,snapshot:this.snapshot()});}
}
