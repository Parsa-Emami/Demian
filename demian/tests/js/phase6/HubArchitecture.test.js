import { DynamicDepthSystem } from '../../../src/Infrastructure/Phaser/Hub/DynamicDepthSystem.js';
import test from 'node:test';
import assert from 'node:assert/strict';
test('dynamic depth uses y sorting',()=>{const e={y:120,setDepth(v){this.d=v}};new DynamicDepthSystem().update(e);assert.equal(e.d,120);});
