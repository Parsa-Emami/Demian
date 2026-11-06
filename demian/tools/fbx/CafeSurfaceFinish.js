import * as THREE from 'three';

export function applyCafeSurfaceFinish(model) {
    const palette = Object.fromEntries(Object.entries({ oak: '#a27a4f', walnut: '#715039', sage: '#617461',
        plaster: '#c8bb9b', trim: '#ead8b5', stone: '#a9ada0', grout: '#6f7c6c' })
        .map(([key, value]) => [key, `vec3(${new THREE.Color(value).toArray().map(v => v.toFixed(6)).join(',')})`]));
    const materials = new Set();
    model.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material.name !== 'unassigned' || materials.has(material)) continue;
            materials.add(material);
            material.color.set('#ffffff');
            material.roughness = .86;
            material.onBeforeCompile = shader => {
                shader.vertexShader = `varying vec3 cafePosition; varying vec3 cafeNormal;\n${shader.vertexShader}`
                    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\ncafePosition = (modelMatrix * vec4(transformed, 1.0)).xyz; cafeNormal = normalize(mat3(modelMatrix) * objectNormal);');
                shader.fragmentShader = `varying vec3 cafePosition; varying vec3 cafeNormal;\n${shader.fragmentShader}`
                    .replace('#include <color_fragment>', `#include <color_fragment>
                    vec2 p = cafePosition.xz;
                    float row = floor(p.y / 1.4);
                    float offset = mod(row, 2.0) * 2.9;
                    float seam = max(step(fract((p.x + offset) / 5.8), .009), step(fract(p.y / 1.4), .014));
                    float grain = .94 + .035 * sin(p.x * 21.0 + sin(p.y * 3.0) * 2.4)
                        + .04 * fract(sin(row * 127.1) * 43758.5453);
                    vec3 wood = ${palette.oak} * grain * (1.0 - seam * .28);
                    vec3 finish = ${palette.plaster};
                    if (cafeNormal.y > .65) {
                        if (cafePosition.y < .65) {
                            vec2 tile = fract(p / 1.25);
                            float joint = max(step(tile.x, .022), step(tile.y, .022));
                            finish = p.y < -98.0 ? mix(${palette.stone}, ${palette.grout}, joint * .55) : wood;
                        } else if (cafePosition.y < 2.4) {
                            finish = ${palette.sage} * (.98 + .02 * sin(p.x * 38.0) * sin(p.y * 38.0));
                        } else if (cafePosition.y < 5.8) {
                            finish = ${palette.walnut} * grain;
                        } else finish = ${palette.trim};
                    } else {
                        finish = cafePosition.y < 4.8 ? ${palette.walnut} : ${palette.plaster};
                    }
                    diffuseColor.rgb = finish;
                    `);
            };
            material.customProgramCacheKey = () => 'demian-cafe-surfaces-v1';
            material.needsUpdate = true;
        }
    });
    return materials.size;
}
