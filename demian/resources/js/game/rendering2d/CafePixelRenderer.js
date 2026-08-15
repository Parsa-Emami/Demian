import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';
import { PIXEL_PALETTE as P } from './PixelPalette.js';

function insetRect(rect, amount) {
    return {
        x: rect.x + amount,
        y: rect.y + amount,
        width: Math.max(1, rect.width - amount * 2),
        height: Math.max(1, rect.height - amount * 2),
    };
}

function snapRect(rect) {
    return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
    };
}

function fillRect(ctx, rect, color) {
    const pixel = snapRect(rect);
    ctx.fillStyle = color;
    ctx.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    return pixel;
}

function strokePixelRect(ctx, rect, color, lineWidth = 1) {
    const pixel = snapRect(rect);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(pixel.x + 0.5, pixel.y + 0.5, Math.max(0, pixel.width - 1), Math.max(0, pixel.height - 1));
}

function drawTable(ctx, rect, round = false) {
    rect = snapRect(rect);
    const shadowOffset = Math.max(2, Math.round(Math.min(rect.width, rect.height) * 0.08));

    if (round) {
        ctx.fillStyle = P.shadow;
        ctx.beginPath();
        ctx.ellipse(
            rect.x + rect.width / 2 + shadowOffset,
            rect.y + rect.height / 2 + shadowOffset,
            rect.width / 2,
            rect.height / 2,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.fillStyle = P.woodDark;
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.woodLight;
        ctx.beginPath();
        ctx.ellipse(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2 - 1,
            Math.max(1, rect.width / 2 - 2),
            Math.max(1, rect.height / 2 - 2),
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.fillStyle = P.woodGlow;
        ctx.fillRect(rect.x + Math.round(rect.width * 0.28), rect.y + Math.round(rect.height * 0.28), Math.max(2, Math.round(rect.width * 0.28)), 1);
        return;
    }

    fillRect(ctx, { ...rect, x: rect.x + shadowOffset, y: rect.y + shadowOffset }, P.shadow);
    fillRect(ctx, rect, P.woodDark);
    const top = fillRect(ctx, insetRect(rect, 2), P.woodLight);
    if (top.width >= 8) {
        ctx.fillStyle = P.woodGlow;
        ctx.fillRect(top.x + 2, top.y + 1, Math.max(2, top.width - 5), 1);
        ctx.fillStyle = P.wood;
        for (let x = top.x + 4; x < top.x + top.width - 2; x += 8) {
            ctx.fillRect(x, top.y + 3, 1, Math.max(1, top.height - 5));
        }
    }
}

function drawPlant(ctx, rect) {
    rect = snapRect(rect);
    const cx = Math.round(rect.x + rect.width / 2);
    const cy = Math.round(rect.y + rect.height / 2);
    const unit = Math.max(1, Math.round(Math.min(rect.width, rect.height) / 9));

    ctx.fillStyle = P.shadow;
    ctx.fillRect(cx - unit * 4 + unit, cy + unit * 2, unit * 7, unit * 3);
    ctx.fillStyle = P.woodDark;
    ctx.fillRect(cx - unit * 3, cy + unit, unit * 6, unit * 4);
    ctx.fillStyle = P.counterTop;
    ctx.fillRect(cx - unit * 2, cy + unit, unit * 4, unit);

    const leaves = [
        [-3, -3, P.plantDark], [1, -4, P.plant], [-1, -6, P.plantLight],
        [3, -2, P.plant], [-4, 0, P.plant], [0, -2, P.plantLight], [2, -6, P.plantDark],
    ];
    leaves.forEach(([x, y, color]) => {
        ctx.fillStyle = color;
        ctx.fillRect(cx + x * unit, cy + y * unit, unit * 3, unit * 3);
    });
}

function drawSofa(ctx, rect) {
    rect = snapRect(rect);
    const shadow = Math.max(2, Math.round(Math.min(rect.width, rect.height) * 0.09));
    fillRect(ctx, { ...rect, x: rect.x + shadow, y: rect.y + shadow }, P.shadow);
    fillRect(ctx, rect, P.sofaDark);
    const inner = fillRect(ctx, insetRect(rect, Math.max(2, Math.round(Math.min(rect.width, rect.height) * 0.08))), P.sofa);
    ctx.fillStyle = P.sofaLight;
    ctx.fillRect(inner.x + 1, inner.y + 1, Math.max(1, inner.width - 2), 1);
    ctx.fillStyle = P.sofaDark;
    if (inner.width > inner.height) {
        const sections = Math.max(2, Math.round(inner.width / Math.max(inner.height, 1)));
        for (let i = 1; i < sections; i += 1) {
            const x = inner.x + Math.round((inner.width / sections) * i);
            ctx.fillRect(x, inner.y + 2, 1, Math.max(1, inner.height - 4));
        }
    } else {
        const y = inner.y + Math.round(inner.height / 2);
        ctx.fillRect(inner.x + 2, y, Math.max(1, inner.width - 4), 1);
    }
}

function drawCounter(ctx, rect) {
    rect = snapRect(rect);
    fillRect(ctx, { ...rect, x: rect.x + 3, y: rect.y + 4 }, P.shadow);
    fillRect(ctx, rect, P.counterEdge);
    const body = fillRect(ctx, insetRect(rect, 2), P.counter);
    const topHeight = Math.max(3, Math.round(rect.height * 0.26));
    fillRect(ctx, { x: rect.x, y: rect.y, width: rect.width, height: topHeight }, P.counterTop);
    ctx.fillStyle = P.woodGlow;
    ctx.fillRect(rect.x + 2, rect.y + 1, Math.max(1, rect.width - 4), 1);

    ctx.fillStyle = P.woodDark;
    for (let x = body.x + 5; x < body.x + body.width - 3; x += 11) {
        ctx.fillRect(x, body.y + topHeight, 1, Math.max(1, body.height - topHeight - 2));
    }

    // Tiny espresso-machine/cup silhouettes add recognisable café detail.
    if (rect.width >= 22 && rect.height >= 8) {
        const machineX = rect.x + Math.round(rect.width * 0.68);
        ctx.fillStyle = P.metalDark;
        ctx.fillRect(machineX, rect.y - 3, 8, 4);
        ctx.fillStyle = P.metalLight;
        ctx.fillRect(machineX + 1, rect.y - 2, 6, 1);
        ctx.fillStyle = P.cyan;
        ctx.fillRect(machineX + 5, rect.y - 1, 1, 1);
        ctx.fillStyle = P.cream;
        ctx.fillRect(rect.x + Math.round(rect.width * 0.4), rect.y - 2, 3, 2);
    }
}

function drawWall(ctx, rect) {
    rect = snapRect(rect);
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, P.wallEdge);
    const body = fillRect(ctx, insetRect(rect, 1), P.wall);
    const cap = Math.max(2, Math.round(Math.min(4, rect.height * 0.28)));
    fillRect(ctx, { x: body.x, y: body.y, width: body.width, height: cap }, P.wallTop);
    ctx.fillStyle = P.wallLight;
    ctx.fillRect(body.x + 1, body.y + 1, Math.max(1, body.width - 2), 1);
}

function drawShelf(ctx, rect) {
    rect = snapRect(rect);
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, P.woodDark);
    const body = fillRect(ctx, insetRect(rect, 2), P.wood);
    const rows = Math.max(1, Math.min(3, Math.round(body.height / 7)));
    for (let row = 1; row <= rows; row += 1) {
        const y = body.y + Math.round((body.height / (rows + 1)) * row);
        ctx.fillStyle = P.woodLight;
        ctx.fillRect(body.x, y, body.width, 1);
        for (let x = body.x + 2; x < body.x + body.width - 2; x += 5) {
            const colors = [P.pink, P.gold, P.cyan, P.cream];
            ctx.fillStyle = colors[(x + row) % colors.length];
            ctx.fillRect(x, Math.max(body.y, y - 2), 1, 2);
        }
    }
}

function drawDisplay(ctx, rect) {
    rect = snapRect(rect);
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, P.glassDark);
    const inner = fillRect(ctx, insetRect(rect, 2), P.glass);
    ctx.fillStyle = P.glassLight;
    ctx.fillRect(inner.x + 1, inner.y + 1, Math.max(1, Math.round(inner.width * 0.34)), 1);
    ctx.fillStyle = P.cream;
    for (let x = inner.x + 3; x < inner.x + inner.width - 2; x += 6) {
        ctx.fillRect(x, inner.y + inner.height - 3, 2, 2);
    }
}

function drawFixture(ctx, rect, kind) {
    if (kind === 'plant') return drawPlant(ctx, rect);
    if (kind === 'sofa') return drawSofa(ctx, rect);
    if (kind === 'counter') return drawCounter(ctx, rect);
    if (kind === 'table') return drawTable(ctx, rect, rect.width <= rect.height * 1.45 && rect.height <= rect.width * 1.45);
    if (kind === 'wall') return drawWall(ctx, rect);
    if (kind === 'shelf') return drawShelf(ctx, rect);
    if (kind === 'display') return drawDisplay(ctx, rect);

    const color = kind === 'column' ? P.wallTrim : P.metal;
    fillRect(ctx, { ...rect, x: rect.x + 2, y: rect.y + 3 }, P.shadow);
    fillRect(ctx, rect, P.metalDark);
    fillRect(ctx, insetRect(rect, 1), color);
}

/** Draws the canonical café as a top-down, high-detail 8-bit scene. */
export default class CafePixelRenderer {
    constructor({ bounds = CAFE_BOUNDS, colliders = CAFE_STATIC_COLLIDERS } = {}) {
        this.bounds = bounds;
        this.colliders = colliders;
    }

    draw(ctx, camera, { atmosphere = 'day', grid = true, detail = true } = {}) {
        const a = camera.worldToScreen({ x: this.bounds.minX, z: this.bounds.minZ });
        const b = camera.worldToScreen({ x: this.bounds.maxX, z: this.bounds.maxZ });
        const floor = snapRect({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
        fillRect(ctx, floor, atmosphere === 'night' ? '#afa99e' : P.floorA);

        this.drawFloor(ctx, camera, floor, { grid });
        if (detail) this.drawDecor(ctx, camera);

        const sorted = [...this.colliders].sort((left, right) =>
            (left.position.z - right.position.z) || left.id.localeCompare(right.id)
        );
        for (const collider of sorted) {
            const rect = camera.worldRect(collider.position, collider.halfExtents);
            drawFixture(ctx, rect, collider.kind);
        }

        this.drawDoorAndWindows(ctx, camera);
        this.drawLightPixels(ctx, camera, atmosphere);
        strokePixelRect(ctx, floor, P.wallEdge, 2);

        if (atmosphere === 'night') {
            ctx.fillStyle = 'rgba(11, 16, 32, 0.2)';
            ctx.fillRect(floor.x, floor.y, floor.width, floor.height);
        }
    }

    drawFloor(ctx, camera, floor, { grid = true } = {}) {
        const tile = Math.max(6, Math.round(camera.pixelsPerUnit * 2));
        if (grid) {
            for (let y = Math.floor(floor.y / tile) * tile; y < floor.y + floor.height; y += tile) {
                for (let x = Math.floor(floor.x / tile) * tile; x < floor.x + floor.width; x += tile) {
                    const parity = ((((x / tile) | 0) + ((y / tile) | 0)) & 1);
                    ctx.fillStyle = parity ? P.floorA : P.floorB;
                    ctx.fillRect(x, y, tile, tile);

                    // One-pixel stone grain. Deterministic coordinates avoid
                    // temporal noise while making large floor areas feel authored.
                    if (tile >= 10) {
                        ctx.fillStyle = parity ? '#c1b59f' : '#d3c8b3';
                        ctx.fillRect(x + 2, y + 3, 1, 1);
                        ctx.fillRect(x + tile - 4, y + tile - 3, 1, 1);
                    }
                }
            }

            ctx.fillStyle = P.grout;
            ctx.globalAlpha = 0.55;
            for (let x = floor.x; x <= floor.x + floor.width; x += tile) {
                ctx.fillRect(Math.round(x), floor.y, 1, floor.height);
            }
            for (let y = floor.y; y <= floor.y + floor.height; y += tile) {
                ctx.fillRect(floor.x, Math.round(y), floor.width, 1);
            }
            ctx.globalAlpha = 1;
        }

        // Bright north-west edge and dark south-east edge create a readable
        // 8-bit bevel without gradients or blur.
        ctx.fillStyle = P.floorLight;
        ctx.fillRect(floor.x + 2, floor.y + 2, Math.max(1, floor.width - 4), 1);
        ctx.fillRect(floor.x + 2, floor.y + 2, 1, Math.max(1, floor.height - 4));
        ctx.fillStyle = '#8b7e69';
        ctx.fillRect(floor.x + 2, floor.y + floor.height - 3, Math.max(1, floor.width - 4), 1);
        ctx.fillRect(floor.x + floor.width - 3, floor.y + 2, 1, Math.max(1, floor.height - 4));
    }

    drawDecor(ctx, camera) {
        const rug = snapRect(camera.worldRect({ x: 5.6, z: -2.0 }, { x: 5.7, z: 4.2 }));
        fillRect(ctx, { ...rug, x: rug.x + 2, y: rug.y + 2 }, P.shadow);
        fillRect(ctx, rug, P.rugDark);
        const rugInner = fillRect(ctx, insetRect(rug, 2), P.rug);
        const inset = Math.max(2, Math.round(camera.pixelsPerUnit * 0.28));
        strokePixelRect(ctx, insetRect(rugInner, inset), P.rugDetail, 1);
        ctx.fillStyle = P.rugDetail;
        for (let x = rugInner.x + 5; x < rugInner.x + rugInner.width - 4; x += 9) {
            ctx.fillRect(x, rugInner.y + 3, 2, 1);
            ctx.fillRect(x + 3, rugInner.y + rugInner.height - 4, 2, 1);
        }

        const arcade = snapRect(camera.worldRect({ x: 17.8, z: -9.4 }, { x: 1.25, z: 1.55 }));
        fillRect(ctx, { ...arcade, x: arcade.x + 2, y: arcade.y + 3 }, P.shadow);
        fillRect(ctx, arcade, P.purpleDark);
        const arcadeFace = fillRect(ctx, insetRect(arcade, 2), '#30284f');
        const screen = fillRect(ctx, insetRect(arcadeFace, 3), '#143f51');
        ctx.fillStyle = P.cyan;
        ctx.fillRect(screen.x + 2, screen.y + 2, Math.max(2, screen.width - 4), 1);
        ctx.fillStyle = P.pink;
        ctx.fillRect(Math.round(arcade.x + arcade.width / 2 - 2), Math.round(arcade.y + arcade.height - 5), 4, 3);
        ctx.fillStyle = P.gold;
        ctx.fillRect(Math.round(arcade.x + arcade.width / 2 + 4), Math.round(arcade.y + arcade.height - 4), 2, 2);

        const chalk = snapRect(camera.worldRect({ x: 16.4, z: -15.8 }, { x: 4.7, z: 0.35 }));
        fillRect(ctx, { ...chalk, x: chalk.x + 1, y: chalk.y + 2 }, P.shadow);
        fillRect(ctx, chalk, '#1d302b');
        ctx.fillStyle = P.cream;
        for (let x = chalk.x + 5; x < chalk.x + chalk.width - 4; x += 9) {
            ctx.fillRect(x, Math.round(chalk.y + chalk.height / 2), 5, 1);
        }
        ctx.fillStyle = P.pink;
        ctx.fillRect(chalk.x + 5, chalk.y + 2, 2, 1);
        ctx.fillStyle = P.cyan;
        ctx.fillRect(chalk.x + 10, chalk.y + 2, 3, 1);
    }

    drawDoorAndWindows(ctx, camera) {
        const entrance = snapRect(camera.worldRect({ x: 0, z: 17.6 }, { x: 5.1, z: 0.25 }));
        fillRect(ctx, entrance, P.glassDark);
        fillRect(ctx, insetRect(entrance, 1), P.glass);
        ctx.fillStyle = P.wallTrim;
        ctx.fillRect(Math.round(entrance.x + entrance.width / 2 - 1), entrance.y, 2, entrance.height);
        ctx.fillStyle = P.glassLight;
        ctx.fillRect(entrance.x + 3, entrance.y + 1, Math.max(2, Math.round(entrance.width * 0.24)), 1);

        const northWindows = [
            { x: -15, z: -17.7 }, { x: -5, z: -17.7 }, { x: 5, z: -17.7 }, { x: 15, z: -17.7 },
        ];
        northWindows.forEach((position) => {
            const rect = snapRect(camera.worldRect(position, { x: 3.2, z: 0.22 }));
            fillRect(ctx, rect, P.glassDark);
            const pane = fillRect(ctx, insetRect(rect, 1), P.glass);
            ctx.fillStyle = P.glassLight;
            ctx.fillRect(pane.x + 2, pane.y, Math.max(1, Math.round(pane.width / 3)), 1);
        });
    }

    drawLightPixels(ctx, camera, atmosphere) {
        if (atmosphere === 'night') return;
        const lights = [
            { x: -13, z: 8, color: P.gold },
            { x: 4, z: 4, color: P.cream },
            { x: 14, z: -5, color: P.cyan },
        ];
        const radius = Math.max(4, Math.round(camera.pixelsPerUnit * 1.5));
        ctx.save();
        ctx.globalAlpha = 0.11;
        lights.forEach((light) => {
            const p = camera.worldToScreen(light);
            ctx.fillStyle = light.color;
            for (let y = -radius; y <= radius; y += 3) {
                for (let x = -radius; x <= radius; x += 3) {
                    if (x * x + y * y > radius * radius) continue;
                    if ((((x + y) / 3) | 0) % 2 !== 0) continue;
                    ctx.fillRect(p.x + x, p.y + y, 1, 1);
                }
            }
        });
        ctx.restore();
    }
}
