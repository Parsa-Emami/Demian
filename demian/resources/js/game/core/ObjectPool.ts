export interface Resettable { reset?: (...args: any[]) => void; destroy?: (...args: any[]) => void; }
export class ObjectPool<T extends Resettable> {
  private free: T[] = []; private active = new Set<T>();
  private factory: () => T;
  private maxSize: number;
  constructor(factory: () => T, initialSize = 0, maxSize = Infinity) {
    if (typeof factory !== 'function') throw new TypeError('Object pool factory is required');
    if (!Number.isInteger(initialSize) || initialSize < 0) throw new RangeError('initialSize must be a non-negative integer');
    if (!(maxSize > 0) || maxSize < initialSize) throw new RangeError('maxSize must be >= initialSize');
    this.factory = factory; this.maxSize = maxSize;
    for (let i=0;i<initialSize;i++) this.free.push(factory());
  }
  acquire(...args: any[]): T { const item = this.free.pop() ?? (this.active.size + this.free.length < this.maxSize ? this.factory() : undefined); if (!item) throw new Error('Object pool exhausted'); item.reset?.(...args); this.active.add(item); return item; }
  release(item: T) { if (!this.active.delete(item)) return false; this.free.push(item); return true; }
  releaseAll() { this.active.forEach(x => this.free.push(x)); this.active.clear(); }
  clear(destroy = false) { if (destroy) [...this.free, ...this.active].forEach(x => x.destroy?.()); this.free = []; this.active.clear(); }
  get size() { return this.active.size; } get available() { return this.free.length; }
}
