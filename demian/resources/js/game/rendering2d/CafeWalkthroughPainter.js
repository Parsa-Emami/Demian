import { CAFE_MATERIALS as M } from './CafeWalkthroughPalette.js';

const TAU = Math.PI * 2;
const referenceArt = new Map();
let artRevision = 0;
export function cafeArtRevision() { return artRevision; }
function portraitImage(file) {
    if (!file || typeof globalThis.Image !== 'function') return null;
    if (referenceArt.has(file)) return referenceArt.get(file);
    referenceArt.set(file, null);
    const image = new globalThis.Image();
    image.onload = () => { referenceArt.set(file, image); artRevision += 1; };
    image.src = new URL(`assets/reference/cafe/walkthrough/${file}`, globalThis.document.baseURI).href;
    return null;
}
function rect(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(x, y, w, h); }
function round(c, x, y, w, h, radius, color) {
    c.fillStyle = color; c.beginPath(); c.roundRect(x, y, Math.max(.02, w), Math.max(.02, h), radius); c.fill();
}
function ellipse(c, x, y, rx, ry, color) {
    c.fillStyle = color; c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU); c.fill();
}
function line(c, x1, y1, x2, y2, color, width = .06) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function shadow(c, x, y, w, h, radius = .08) { round(c, x + .12, y + .2, w, h, radius, M.shadow); }
function text(c, content, x, y, size = .4, color = M.black, font = 'sans-serif') {
    c.fillStyle = color; c.font = `600 ${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(content, x, y);
}
function wood(c, x, y, w, h, light = false) {
    round(c, x, y, w, h, .06, M.woodDark);
    round(c, x + .07, y + .06, w - .14, h - .16, .04, light ? M.woodLight : M.wood);
    for (let k = 0; k < Math.floor(w / .23); k += 1) {
        const dx = x + .14 + k * .23;
        line(c, dx, y + .1, dx + .04 * Math.sin(k * 2), y + h - .14, k % 3 === 0 ? M.woodLight : M.woodGrain, .025);
    }
    line(c, x + .12, y + .08, x + w - .12, y + .08, '#cfb789', .04);
}
function cups(c, x, y, count = 2) {
    for (let i = 0; i < count; i += 1) {
        ellipse(c, x + i * .35, y, .15, .13, M.cream);
        ellipse(c, x + i * .35, y, .095, .08, '#6d4b35');
        c.strokeStyle = M.white; c.lineWidth = .035; c.strokeRect(x + i * .35 + .12, y - .04, .1, .08);
    }
}
function cane(c, x, y, w, h) {
    rect(c, x, y, w, h, M.cream);
    for (let xx = x + .08; xx < x + w; xx += .13) line(c, xx, y, xx, y + h, M.wood, .035);
    for (let yy = y + .08; yy < y + h; yy += .13) line(c, x, yy, x + w, yy, M.wood, .025);
}

export function cafeItemVisible(camera, entry, padding = 5) {
    const r = camera.worldRect(entry.position, entry.halfExtents);
    const pad = padding * camera.pixelsPerUnit;
    return r.x + r.width + pad >= 0 && r.y + r.height + pad >= 0
        && r.x - pad < camera.viewportWidth && r.y - pad < camera.viewportHeight;
}

/** Small deterministic material painters; all coordinates below are world units. */
export function paintCafeItem(context, camera, entry) {
    if (entry.kind === 'void' || !cafeItemVisible(camera, entry)) return;
    const point = camera.worldToScreen(entry.position);
    const unit = camera.pixelsPerUnit;
    const c = context;
    c.save(); c.translate(point.x, point.y); c.scale(unit, unit);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const hx = entry.halfExtents.x, hz = entry.halfExtents.z;
    const x = -hx, y = -hz, w = hx * 2, h = hz * 2;
    const face = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[entry.facing] ?? 0;

    switch (entry.kind) {
    case 'wall': {
        if (entry.material === 'glass') {
            rect(c, x, y - .6, w, h + .6, M.black);
            rect(c, x + .06, y - .53, w - .12, h + .43, M.glass);
            for (let i = 0; i < w; i += 2.0) {
                line(c, x + i, y - .52, x + i, y + h, M.black, .055);
                drawGlazingMotif(c, x + i + .8, y - .12, .42, Math.round(i) % 4);
            }
        } else {
            shadow(c, x, y, w, h, .02);
            const color = entry.material === 'green-tile' ? M.greenTile : M.wall;
            rect(c, x, y - .2, w, h + .2, M.wallShade);
            rect(c, x, y - .23, w, h, color);
            rect(c, x, y - .26, w, Math.min(.1, h), M.wallTop);
            if (entry.material === 'green-tile') tile(c, x, y, w, h, .65);
        }
        break;
    }
    case 'column':
        shadow(c, x, y, w, h); rect(c, x, y - .3, w, h + .3, '#b9bab5');
        rect(c, x + .09, y - .38, w - .18, h, '#d5d6cf'); rect(c, x + .09, y - .38, .08, h, M.white); break;
    case 'table':
        shadow(c, x, y, w, h, .09); wood(c, x, y - .1, w, h, true);
        if (entry.set === 'flowers') {
            ellipse(c, 0, 0, .2, .25, M.cream);
            for (let i = 0; i < 11; i += 1) ellipse(c, Math.sin(i * 2) * .35, -.1 + Math.cos(i * 2) * .32, .1, .12, i % 2 ? '#d5a5a6' : '#ac5e65');
        } else if (entry.set === 'cups') { cups(c, -.35, -.3, 3); }
        else if (entry.set === 'number') {
            rect(c, -.17, -.2, .34, .42, M.black); text(c, entry.id.endsWith('2') ? '7' : '4', 0, 0, .23, M.white);
        }
        break;
    case 'chair': {
        shadow(c, x, y, w, h); c.rotate(face);
        round(c, -.61, -.58, 1.22, 1.15, .1, M.wood);
        if (entry.style === 'cane') cane(c, -.46, -.43, .92, .81);
        else round(c, -.47, -.43, .94, .8, .1, '#79787b');
        rect(c, -.66, -.77, 1.32, .18, M.woodLight);
        line(c, -.59, -.57, -.59, .65, M.woodDark); line(c, .59, -.57, .59, .65, M.woodDark); break;
    }
    case 'sofa': {
        shadow(c, x, y, w, h, .16);
        const vertical = entry.facing === 'east' || entry.facing === 'west';
        const rw = vertical ? h : w, rh = vertical ? w : h;
        c.rotate(face);
        round(c, -rw / 2, -rh / 2, rw, rh, .14, M.wood);
        round(c, -rw / 2 + .18, -rh / 2 + .1, rw - .36, rh - .2, .22, M.cushionDark);
        const seats = entry.style === 'armchair' ? 1 : 3;
        for (let i = 0; i < seats; i += 1) {
            const sw = (rw - .6) / seats;
            round(c, -rw / 2 + .3 + i * sw, -.14, sw - .05, Math.max(.4, rh / 2 - .05), .14, M.cushion);
            round(c, -rw / 2 + .3 + i * sw, -rh / 2 + .21, sw - .07, rh / 2 - .26, .16, M.cushionLight);
        }
        rect(c, -rw / 2, -rh / 2 + .08, .13, rh - .16, M.woodLight);
        rect(c, rw / 2 - .13, -rh / 2 + .08, .13, rh - .16, M.woodLight);
        if (entry.style !== 'armchair') round(c, -rw / 2 + .25, -.22, .62, .52, .12, '#b4b5b4');
        break;
    }
    case 'counter':
        shadow(c, x, y, w, h); rect(c, x, y, w, h, entry.style === 'concrete' ? M.wallTop : M.woodDark);
        wood(c, x, y - .16, w, h - .12, entry.style !== 'dark-wood');
        line(c, x, y + h - .08, x + w, y + h - .08, entry.style === 'concrete' ? M.stoneLight : M.woodDark, .12); break;
    case 'shelf':
        shadow(c, x, y, w, h);
        if (entry.style === 'mint') {
            rect(c, x, y, w, h, '#759b81');
            for (let row = 0; row < 4; row += 1) {
                const yy = y + row * h / 4;
                rect(c, x + .07, yy + .07, w - .14, h / 4 - .08, '#bdd0b0');
                for (let col = 0; col < 3; col += 1) {
                    const color = ['#c4b5ce', '#d8bc94', '#3f6282', '#576d53'][(row + col) % 4];
                    rect(c, x + .15 + col * .42, yy + .18, .33, .3, color);
                    line(c, x + .17 + col * .42, yy + .27, x + .4 + col * .42, yy + .27, M.white, .04);
                }
            }
            for (const xx of [x, -x - .08]) rect(c, xx, y - .08, .08, h + .16, '#b6d5b4');
        } else {
            rect(c, x, y, w, h, M.wall);
            for (let row = 0; row < 4; row += 1) {
                const yy = y + row * h / 4 + .08;
                wood(c, x, yy + 1.0, w, .17, true);
                for (let j = 0; j < 4; j += 1) {
                    rect(c, x + .09, yy + .1 + j * .18, w - .18, .13, [M.white, '#865a54', '#c4ac81', '#393d39'][(j + row) % 4]);
                }
            }
        }
        break;
    case 'plant': drawPlant(c, entry); break;
    case 'air-conditioner':
        shadow(c, x, y, w, h); round(c, x, y - .55, w, h + .55, .08, M.white);
        for (let i = 0; i < 5; i += 1) rect(c, x + .13, y - .4 + i * .12, w - .26, .055, '#666f6a');
        rect(c, x + .18, .15, w - .36, .24, M.wallShade); text(c, '24°', 0, .26, .15, M.white); break;
    case 'speaker':
        shadow(c, x, y, w, h); round(c, x, y - .35, w, h + .35, .1, M.black);
        ellipse(c, 0, .05, .27, .28, '#787e7b'); ellipse(c, 0, -.33, .13, .14, M.cushion); break;
    case 'sideboard':
        shadow(c, x, y, w, h); wood(c, x, y - .16, w, h, true);
        cane(c, x + .16, y + .08, w * .42, h - .14);
        cane(c, .08, y + .08, w * .42, h - .14);
        if (entry.style === 'black-cane') {
            rect(c, .1, y + .04, w * .42, h - .1, M.black);
            for (let i = 0; i < 3; i += 1) line(c, .26, y + .18 + .22 * i, w / 2 - .2, y + .18 + .22 * i, '#b49d6b', .055);
        }
        if (entry.set === 'radio') {
            round(c, -.55, y - .35, .9, .5, .06, M.black); rect(c, -.48, y - .28, .72, .22, '#b7aa82');
            for (let i = 0; i < 3; i += 1) ellipse(c, -.4 + .25 * i, y + .04, .04, .04, M.metal);
        } else {
            rect(c, -.9, y - .25, 1.2, .55, M.black); ellipse(c, -.36, y + .02, .23, .23, '#5c6261');
            ellipse(c, -.36, y + .02, .07, .07, M.cream); line(c, .17, y - .16, -.1, y + .12, M.metal, .035);
            ellipse(c, 1.4, y + .02, .16, .17, M.white); rect(c, 1.32, y - .2, .16, .25, M.white);
        }
        break;
    case 'mirror': drawStandingMirror(c, entry, w); break;
    case 'vase':
        ellipse(c, 0, 0, hx, hz, '#827365');
        for (let i = 0; i < 6; i += 1) {
            const xx = (i - 3) * .16;
            line(c, 0, 0, xx, -1.8 + .14 * (i % 3), '#a49075', .035);
            line(c, xx * .65, -1, xx + .25, -1.5, '#baaa8d', .025);
        } break;
    case 'stool': shadow(c, x, y, w, h); ellipse(c, 0, 0, hx, hz, M.black); break;
    case 'vanity': rect(c, x, y, w, h, M.greenTile); tile(c, x, y, w, h, .55); break;
    case 'toilet':
        shadow(c, x, y, w, h, .25); round(c, x + .1, y - .08, w - .2, .6, .08, M.white);
        round(c, x + .2, y + .15, w - .4, h - .05, .38, '#b4bab7');
        ellipse(c, 0, .45, hx * .88, hz * .66, M.white); ellipse(c, 0, .44, hx * .57, hz * .4, '#9caea9');
        ellipse(c, 0, .5, hx * .43, hz * .28, '#d8e4dd'); ellipse(c, 0, y + .2, .06, .04, M.metal); break;
    case 'bin':
        shadow(c, x, y, w, h); ellipse(c, 0, 0, hx, hz, entry.style === 'coral' ? M.coral : M.metal);
        ellipse(c, 0, -.06, hx * .76, hz * .65, M.black); break;
    default: drawDecoration(c, entry, x, y, w, h); break;
    }
    c.restore();
}

function tile(c, x, y, w, h, size) {
    for (let yy = y; yy < y + h; yy += size) {
        for (let xx = x; xx < x + w; xx += size) {
            rect(c, xx + .035, yy + .035, Math.max(.01, Math.min(size - .07, x + w - xx - .05)), Math.max(.01, Math.min(size - .07, y + h - yy - .05)), M.greenTileLight);
        }
    }
}

function drawPlant(c, entry) {
    const r = entry.halfExtents.x;
    ellipse(c, .14, .22, r * 1.2, r * .8, M.shadow);
    ellipse(c, 0, 0, r, r * .85, M.planter); ellipse(c, 0, -.1, r * .87, r * .65, M.black);
    if (entry.style === 'cactus') {
        for (let k = 0; k < 5; k += 1) {
            const xx = (k - 2) * .16;
            round(c, xx - .08, -1.25 + .15 * Math.abs(k - 2), .15, 1.2 - .15 * Math.abs(k - 2), .06, M.plantDark);
            line(c, xx, -1.05, xx, -.16, M.plantLight, .028);
        }
        return;
    }
    const count = entry.style === 'palm' || entry.style === 'yucca' ? 10 : 13;
    for (let k = 0; k < count; k += 1) {
        const a = k * 2.39996;
        const xx = Math.cos(a) * r * 1.1, yy = -.4 + Math.sin(a) * r * 1.15;
        line(c, 0, 0, xx, yy, M.plantDark, .04);
        c.save(); c.translate(xx, yy); c.rotate(a);
        ellipse(c, 0, 0, r * (entry.style === 'yucca' ? .6 : .45), r * (entry.style === 'yucca' ? .08 : .24), [M.plant, M.plantLight, M.plantDark][k % 3]);
        line(c, -r * .3, 0, r * .3, 0, M.plantDark, .015); c.restore();
    }
}

function drawStandingMirror(c, entry, width) {
    const tall = 2.7, x = -width / 2;
    const frame = entry.style === 'coral' ? M.coral : M.black;
    shadow(c, x, -tall, width, tall, .12);
    round(c, x, -tall, width, tall, entry.style === 'coral' ? .17 : .02, frame);
    round(c, x + .08, -tall + .1, width - .16, tall - .2, .08, '#afc0b6');
    rect(c, x + .14, -tall + .18, (width - .28) * .35, tall - .35, '#d3ded2');
    line(c, x + .15, -.25, x + width - .15, -2.25, '#edf1da', .04);
    line(c, x + .15, -1.2, x + width - .15, -1.2, '#949e8d', .045);
    if (entry.roosters) {
        for (const xx of [-width * .25, width * .25]) {
            ellipse(c, xx, -tall - .15, .16, .1, M.black);
            line(c, xx + .08, -tall - .17, xx + .08, -tall - .42, M.black, .08);
            ellipse(c, xx + .12, -tall - .42, .07, .06, M.black);
        }
    }
}

export function drawGlazingMotif(c, x, y, radius, variant = 0) {
    c.save(); c.translate(x, y); c.strokeStyle = M.white; c.lineWidth = .025;
    if (variant % 3 === 0) {
        c.strokeRect(-radius, -radius, radius * 2, radius * 2);
        for (let i = 0; i < 12; i += 1) {
            const a = i * TAU / 12;
            line(c, Math.cos(a) * radius * .35, Math.sin(a) * radius * .35, Math.cos(a) * radius * .9, Math.sin(a) * radius * .9, M.white, .025);
        }
        ellipse(c, 0, 0, radius * .23, radius * .23, M.white);
    } else if (variant % 3 === 1) {
        c.strokeRect(-radius, -radius, radius * 2, radius * 2);
        for (let i = 0; i < 7; i += 1) { c.save(); c.rotate(i * TAU / 7); ellipse(c, radius * .45, 0, radius * .35, radius * .12, M.white); c.restore(); }
    } else drawDemianLogo(c, 0, 0, radius * 1.3, M.white);
    c.restore();
}

function drawDemianLogo(c, x, y, size, color = M.black) {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.lineWidth = size * .13;
    c.beginPath(); c.moveTo(-size * .1, -size * .5); c.lineTo(size * .2, -size * .5);
    c.bezierCurveTo(size * .7, -size * .5, size * .7, size * .4, size * .2, size * .4);
    c.lineTo(-size * .4, size * .4); c.lineTo(-size * .4, -size * .2); c.lineTo(size * .15, -size * .2);
    c.lineTo(size * .15, size * .15); c.lineTo(-size * .2, size * .15); c.stroke(); c.restore();
}

function drawDecoration(c, e, x, y, w, h) {
    switch (e.kind) {
    case 'rug': {
        rect(c, x, y, w, h, M.rugDark); rect(c, x + .08, y + .08, w - .16, h - .16, M.rug);
        if (e.pattern === 'plain') break;
        c.strokeStyle = M.rugDetail; c.lineWidth = .08; c.strokeRect(x + .3, y + .3, w - .6, h - .6);
        for (let yy = y + .45; yy < y + h - .35; yy += .48) {
            for (let xx = x + .45; xx < x + w - .35; xx += .48) {
                c.fillStyle = ((Math.round(xx * 10) + Math.round(yy * 10)) % 3) ? M.rugDetail : '#d19c91';
                c.beginPath(); c.moveTo(xx, yy - .065); c.lineTo(xx + .075, yy); c.lineTo(xx, yy + .065); c.lineTo(xx - .075, yy); c.fill();
            }
        }
        for (let i = 0; i < w; i += .22) { line(c, x + i, y - .08, x + i, y + .02, M.cream, .025); line(c, x + i, y + h - .02, x + i, y + h + .08, M.cream, .025); }
        break;
    }
    case 'tile-panel': rect(c, x, y, w, h, M.greenTile); tile(c, x, y, w, h, .5); break;
    case 'bottle-shelf':
        rect(c, x, y, w, h, M.woodDark);
        for (let i = 0; i < Math.floor(h / .5); i += 1) {
            const yy = y + .2 + i * .5;
            round(c, -.14, yy, .27, .32, .02, i % 3 ? '#657a66' : '#6b4738');
            rect(c, -.08, yy - .1, .15, .13, M.metal); rect(c, -.13, yy + .12, .24, .08, i % 4 ? M.white : '#e0c264');
        } break;
    case 'espresso':
        shadow(c, x, y, w, h); round(c, x, y, w, h, .12, M.black);
        rect(c, x + .06, y + .18, w - .12, h * .65, M.metal);
        for (let i = 0; i < 3; i += 1) { ellipse(c, 0, y + .38 + i * .48, .13, .13, M.black); line(c, -.08, y + .38 + i * .48, -.45, y + .38 + i * .48, M.black, .07); }
        cups(c, -.24, y - .08, 2); break;
    case 'grinders':
        for (const yy of [-.3, .3]) { ellipse(c, 0, yy, .3, .27, M.black); ellipse(c, 0, yy, .2, .18, '#82755c'); rect(c, .2, yy - .07, .23, .14, M.metal); } break;
    case 'bar-tools':
        cups(c, -.28, -.4, 2); cups(c, -.28, 0, 2); ellipse(c, 0, .55, .28, .3, M.metal); ellipse(c, 0, .55, .21, .22, '#d1e0c8'); break;
    case 'pos':
        rect(c, -.4, .1, .8, .26, M.black); round(c, x, y - .25, w, h, .07, M.black);
        rect(c, x + .08, y - .16, w - .16, h - .16, '#718b81');
        for (let i = 0; i < 4; i += 1) line(c, x + .18, y + .02 + i * .12, x + w - .18, y + .02 + i * .12, '#bad0b8', .04);
        rect(c, x - .35, .2, .3, .23, M.black); break;
    case 'pastry':
        ellipse(c, 0, 0, hxOf(e), e.halfExtents.z, M.cream); ellipse(c, 0, 0, w * .4, h * .35, '#af8760');
        c.globalAlpha = .45; ellipse(c, 0, -.08, w * .47, h * .47, M.glassLight); c.globalAlpha = 1;
        ellipse(c, -.18, -.18, .13, .07, M.white); break;
    case 'logo': drawDemianLogo(c, 0, -.45, 1.3); break;
    case 'quote':
        c.rotate(-Math.PI / 2);
        (e.lines ?? []).forEach((s, i) => text(c, s, 0, -.75 + i * .35, .22, M.black)); break;
    case 'portraits': {
        const count = e.count ?? 3;
        for (let i = 0; i < count; i += 1) {
            const yy = y + (i + .5) * h / count;
            round(c, -.35, yy - .75, .85, 1.35, .015, M.black);
            rect(c, -.29, yy - .69, .73, 1.22, M.white);
            rect(c, -.21, yy - .61, .57, 1.03, ['#72523f', '#b5a07b', '#655047'][i % 3]);
            const art = portraitImage(e.images?.[i]);
            if (art) c.drawImage(art, -.21, yy - .61, .57, 1.03);
            else {
                ellipse(c, .055, yy - .27, .14, .2, '#c9ab86'); round(c, -.16, yy - .07, .41, .42, .08, ['#54443e', '#d2c49e', '#483f39'][i % 3]);
            }
        } break;
    }
    case 'landscape-photos':
        for (let i = 0; i < 2; i += 1) {
            const xx = -1.0 + i * 1.7;
            rect(c, xx - .6, -.8, 1.2, .82, M.white); rect(c, xx - .48, -.7, .96, .6, '#b7c3be');
            line(c, xx - .48, -.34, xx + .48, -.3, '#657b74', .15);
        } break;
    case 'neon':
        c.shadowColor = e.color; c.shadowBlur = 7;
        text(c, 'Hello', -.25, -3.35, .68, e.color, 'cursive'); text(c, 'gorgeous', .18, -2.7, .64, e.color, 'cursive');
        c.shadowBlur = 0; break;
    case 'basin':
        ellipse(c, .03, .07, w * .53, h * .5, M.shadow);
        ellipse(c, 0, 0, w * .5, h * .5, '#b94e2d'); ellipse(c, 0, -.06, w * .47, h * .44, M.orange);
        ellipse(c, 0, -.06, w * .36, h * .34, '#e58258'); ellipse(c, .02, -.01, .1, .1, M.metal);
        ellipse(c, .02, -.01, .055, .055, M.black); ellipse(c, -.23, -.3, .15, .065, '#ffc29b');
        line(c, -.49, -.53, -.15, -.23, M.metal, .09); ellipse(c, -.49, -.53, .1, .1, '#d4dbd2'); break;
    case 'arched-mirror': {
        const xx = -.4, yy = -1.65;
        c.shadowColor = '#f8ffe2'; c.shadowBlur = 5;
        round(c, xx, yy, .8, 2.5, [.4, .4, .015, .015], '#eef3d5'); c.shadowBlur = 0;
        round(c, xx + .07, yy + .07, .66, 2.36, [.33, .33, .01, .01], '#56645d');
        line(c, xx + .13, yy + .75, xx + .66, yy + .32, '#8a9d83', .025); break;
    }
    case 'soap-towels':
        rect(c, -.3, -.25, .24, .43, '#bcdbcd'); rect(c, -.25, -.33, .2, .13, M.metal);
        ellipse(c, .27, 0, .18, .18, M.white); ellipse(c, .27, 0, .06, .06, '#939d96'); break;
    case 'spray':
        c.strokeStyle = M.metal; c.lineWidth = .065; c.beginPath(); c.moveTo(0, -.4); c.bezierCurveTo(-.55, .45, .6, .75, .14, -.1); c.stroke();
        line(c, .1, -.45, .1, -.1, M.white, .11); break;
    case 'toilet-paper': rect(c, -.17, -.1, .34, .3, M.white); ellipse(c, 0, -.12, .18, .11, '#d2d7cc'); break;
    case 'wc-sign': text(c, 'WC', 0, -.15, .5); break;
    case 'floor-lamp':
        ellipse(c, .08, .1, .31, .22, M.shadow); ellipse(c, 0, 0, .25, .18, M.black);
        line(c, 0, 0, 0, -1.7, M.cream, .055); round(c, -.42, -1.94, .84, .47, .09, M.cream); break;
    case 'sconce':
        ellipse(c, 0, -.35, .7, .7, 'rgba(255,232,168,.11)');
        for (let i = -1; i <= 1; i += 1) { line(c, 0, 0, i * .19, -.4, '#a39263', .04); ellipse(c, i * .19, -.47, .055, .1, M.light); } break;
    case 'linear-light':
        c.globalAlpha = .09; rect(c, -.5, y, 1, h, M.light); c.globalAlpha = .58;
        rect(c, -.04, y, .08, h, M.light); c.globalAlpha = 1; break;
    case 'track-light':
        c.globalAlpha = .4; rect(c, -.025, y, .05, h, M.black);
        for (let yy = y + .8; yy < y + h; yy += 2) { rect(c, -.17, yy, .34, .15, M.black); ellipse(c, 0, yy + .15, .14, .06, M.light); }
        c.globalAlpha = 1; break;
    case 'downlight': ellipse(c, 0, 0, .42, .42, 'rgba(255,239,207,.1)'); ellipse(c, 0, 0, .065, .065, M.white); break;
    case 'panel-door': {
        // Open leaves sit next to an aperture and never pretend to be solid.
        if (e.axis === 'z') {
            rect(c, -.15, -hzOf(e), 1.7, .12, M.black); line(c, -.05, -hzOf(e) + .2, 1.6, -hzOf(e) + 1.1, M.wall, .11);
        } else {
            rect(c, x - .09, -.35, .1, .65, M.black); rect(c, -x, -.35, .1, .65, M.black);
            line(c, x, -.02, x + .12, -1.65, e.style === 'white-panel' ? M.white : M.black, .17);
            line(c, x + .14, -.25, x + .21, -1.42, M.wall, .04);
        } break;
    }
    case 'glass-door':
        rect(c, x, -.6, w, .69, M.black); rect(c, x + .06, -.54, w - .12, .48, M.glassLight);
        line(c, 0, -.6, 0, .14, M.black, .065);
        line(c, -.18, -.47, -.18, -.04, M.black, .05); line(c, .18, -.47, .18, -.04, M.black, .05);
        drawGlazingMotif(c, -1.0, -.28, .3, 2); drawGlazingMotif(c, 1.0, -.28, .3, 1); break;
    }
}
function hxOf(e) { return e.halfExtents.x; }
function hzOf(e) { return e.halfExtents.z; }
