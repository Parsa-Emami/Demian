export const EVENT_CONFIG = Object.freeze({
    player: Object.freeze({ radius: 0.54, speed: 5.15, runMultiplier: 1.32, maxHealth: 100 }),
    collectionRadius: 0.88,
    attack: Object.freeze({ range: 2.55, cooldown: 0.28, damage: 1 }),
    enemy: Object.freeze({ radius: 0.48, contactRange: 1.05, damage: 12, damageCooldown: 0.9, repathSeconds: 0.7 }),
    camera: Object.freeze({ height: 18, distance: 16, smoothing: 4.8 }),
});
