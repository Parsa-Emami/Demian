export const COLLISION_LAYERS = Object.freeze({
    NONE: 0,
    WORLD: 1 << 0,
    CHARACTER: 1 << 1,
    TRIGGER: 1 << 2,
    INTERACTABLE: 1 << 3,
    SENSOR: 1 << 4,
    ALL: 0x7fffffff,
});

export function collisionMask(...layers) {
    return layers.reduce((mask, layer) => mask | Number(layer || 0), 0);
}
