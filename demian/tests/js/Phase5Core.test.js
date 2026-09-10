import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool } from '../../resources/js/game/core/ObjectPool.ts';
import { AnimationRegistry } from '../../resources/js/game/core/AnimationRegistry.ts';
import { SceneManager } from '../../resources/js/game/core/SceneManager.ts';
import { MemoryCleanup } from '../../resources/js/game/core/MemoryCleanup.ts';

test('phase 5 pool recycles objects', () => { const p = new ObjectPool(() => ({ reset() {} }), 1); const x = p.acquire(); p.release(x); assert.equal(p.available, 1); assert.equal(p.acquire(), x); });
test('animation registry is idempotent', () => { const r = new AnimationRegistry(); assert.equal(r.register({ key:'idle', frames:[] }), true); assert.equal(r.register({ key:'idle', frames:[] }), false); });
test('scene manager switches and disposes', () => { let stopped = 0; const m = new SceneManager(); m.register('a', { scene:{ start(){}, stop(){ stopped++; } } }); m.register('b', { scene:{ start(){}, stop(){} } }); m.start('a'); m.switchTo('b'); assert.equal(stopped, 1); });
test('memory cleanup is idempotent', () => { let n=0; const c = new MemoryCleanup(); c.track(() => n++); c.dispose(); c.dispose(); assert.equal(n,1); });
