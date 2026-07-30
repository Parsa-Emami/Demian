export default class PriorityQueue {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(value, priority) {
        const item = { value, priority: Number(priority) || 0 };
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) return null;
        const first = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0 && last) {
            this.items[0] = last;
            this.sinkDown(0);
        }
        return first.value;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.items[parent].priority <= this.items[index].priority) break;
            [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
            index = parent;
        }
    }

    sinkDown(index) {
        const length = this.items.length;
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && this.items[left].priority < this.items[smallest].priority) smallest = left;
            if (right < length && this.items[right].priority < this.items[smallest].priority) smallest = right;
            if (smallest === index) break;
            [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
            index = smallest;
        }
    }
}
