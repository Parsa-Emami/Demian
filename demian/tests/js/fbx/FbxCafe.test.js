import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { CAFE_FBX, CAFE_BOUNDS, fbxSourcePoint, CAFE_CHARACTER_SPAWNS } from '../../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import { ROLE_PLAY_NPCS, ROLE_PLAY_PICKUPS, ROLE_PLAY_INTERACTABLES, HIDE_SPOTS } from '../../../resources/js/game/shared/cafe/CafeReferenceLayout.js';
import { fbxCafeAssetUrl } from '../../../resources/js/game/rendering2d/FbxCafeAssets.js';
import manifest from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import NavigationGrid from '../../../resources/js/game/shared/navigation/NavigationGrid.js';
import Collider from '../../../resources/js/game/shared/collision/Collider.js';
const root = new URL('../../../',import.meta.url);
const read = (p) => readFileSync(new URL(p,root));

test('the exact user FBX is retained and its mesh AND trimmed NURBS geometry survives conversion', () => {
    const source=JSON.parse(read('sources/demian-cafe-source.json'));
    const chunks=source.parts.map((part)=>{const bytes=read('sources/'+part.file);assert.equal(bytes.length,part.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);return bytes;});
    const original = gunzipSync(Buffer.concat(chunks));
    assert.equal(createHash('sha256').update(original).digest('hex'),CAFE_FBX.sourceSha256);
    assert.equal(original.subarray(0,18).toString(),'Kaydara FBX Binary');
    assert.equal(CAFE_FBX.modelCounts.NurbsSurface,1563);
    assert.equal(CAFE_FBX.modelCounts.TrimNurbsSurface,929);
    assert.equal(CAFE_FBX.modelCounts.Mesh + CAFE_FBX.modelCounts.emptyMeshes,11616);
});

test('the compressed GLB has valid finite geometry, in-file images and a selectable roof layer', () => {
    const bytes = gunzipSync(read('public/assets/environments/demian-fbx/cafe.glb.gz'));
    assert.equal(bytes.subarray(0,4).toString(),'glTF');assert.equal(bytes.readUInt32LE(4),2);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
    const binaryOffset=28+length;
    assert.equal(gltf.images.length,42);
    assert.ok(gltf.images.every((i) => Number.isInteger(i.bufferView) && !i.uri));
    assert.ok(gltf.nodes.some((n) => n.extras.overhead));
    assert.ok(gltf.nodes.some((n) => !n.extras.overhead));
    assert.ok(gltf.meshes.length<=120,'Merged materials avoid thousands of draw calls.');
    let triangleCount=0;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
        triangleCount += gltf.accessors[primitive.indices].count/3;
        for (const accessorIndex of Object.values(primitive.attributes)) {
            const a=gltf.accessors[accessorIndex],view=gltf.bufferViews[a.bufferView];
            const stride=a.type==='VEC3'?3:2;
            const values=new Float32Array(bytes.buffer,bytes.byteOffset+binaryOffset+view.byteOffset,a.count*stride);
            assert.ok(values.every(Number.isFinite));
        }
    }
    assert.equal(triangleCount,CAFE_FBX.modelCounts.triangles);
});

test('FBX coordinates, exact playable bounds and GitHub Pages asset URLs use one transform', () => {
    assert.deepEqual(fbxSourcePoint(-48.5125,43),{x:0,z:0});
    assert.deepEqual(fbxSourcePoint(-49.5125,42),{x:4,z:-4});
    assert.deepEqual(manifest.bounds,CAFE_BOUNDS);
    assert.equal(new URL(fbxCafeAssetUrl('floorplan.webp','https://example.test/Demian/')).pathname,
        '/Demian/assets/environments/demian-fbx/floorplan.webp');
    assert.ok(Object.isFrozen(CAFE_FBX.colliders[0].halfExtents));
});

test('every authored interaction and hidden-game spawn is reachable on actual collision geometry', () => {
    const grid=new NavigationGrid({...CAFE_BOUNDS,cellSize:.72,allowDiagonal:true});
    grid.rasterizeColliders(CAFE_FBX.colliders.map((d)=>new Collider({...d,type:'static',shape:'aabb'})),{padding:.72});
    const positions=[...CAFE_CHARACTER_SPAWNS,...manifest.savePoints.map((p)=>p.position),
        ...[...ROLE_PLAY_NPCS,...ROLE_PLAY_PICKUPS,...ROLE_PLAY_INTERACTABLES,...HIDE_SPOTS].map((p)=>p.position),
        ...HIDE_SPOTS.map((p)=>p.exitPosition)];
    for(const p of positions) {
        const cell=grid.worldToCell(p);assert.ok(grid.isWalkable(cell.x,cell.z),JSON.stringify(p));
        assert.ok(grid.findPath(manifest.spawn,p).length,`Unreachable ${JSON.stringify(p)}`);
    }
});
