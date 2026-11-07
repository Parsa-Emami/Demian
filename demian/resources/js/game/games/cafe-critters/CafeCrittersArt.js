const TABLE_ART = Object.freeze({
    sun: '<circle cx="24" cy="24" r="9" fill="#f9c36e" stroke="#9b6037" stroke-width="2"/><path d="M24 6v5m0 26v5M6 24h5m26 0h5M11 11l4 4m18 18 4 4m0-26-4 4M15 33l-4 4" fill="none" stroke="#c9874f" stroke-linecap="round" stroke-width="2.5"/>',
    moon: '<path d="M29 7a18 18 0 1 0 12 25C27 37 17 22 29 7Z" fill="#e4e6be" stroke="#577084" stroke-width="2"/><path d="M37 8v10m-5-5h10" stroke="#8ca5a2" stroke-width="2" stroke-linecap="round"/>',
    cardamom: '<path d="M10 34C1 24 15 9 23 10c7 8-2 25-13 24Z" fill="#91a26f" stroke="#4b6648" stroke-width="2"/><path d="M25 38c-7-8 3-25 13-27 8 6-1 24-13 27Z" fill="#b7c184" stroke="#4b6648" stroke-width="2"/><path d="m11 30 9-15m8 18 8-16m-2 20 5-4" stroke="#577252" stroke-linecap="round" stroke-width="1.5"/>',
    berries: '<path d="M22 15c-2-8 7-10 12-8-2 6-5 8-12 8Z" fill="#87a36d" stroke="#405849" stroke-width="2"/><g stroke="#633b52" stroke-width="2"><circle cx="16" cy="24" r="8" fill="#bf6d7d"/><circle cx="30" cy="23" r="8" fill="#a35473"/><circle cx="24" cy="33" r="8" fill="#88506e"/></g><path d="m13 21 2-2m12 1 2-2m-9 12 2-2" stroke="#f3baaf" stroke-width="2" stroke-linecap="round"/>',
    seeds: '<g stroke="#865936" stroke-width="1.8"><ellipse cx="13" cy="19" rx="4.8" ry="9" transform="rotate(-38 13 19)" fill="#ddaa65"/><ellipse cx="31" cy="17" rx="4.7" ry="9" transform="rotate(31 31 17)" fill="#eac288"/><ellipse cx="24" cy="32" rx="4.7" ry="9" transform="rotate(61 24 32)" fill="#c9925b"/></g><path d="m12 15 3 5m17-7-2 5m-3 12-5 3" stroke="#fff0b6" stroke-width="1.3" stroke-linecap="round"/>',
    vase: '<path d="M23 24V8m1 12 10-12M22 17l-9-7" fill="none" stroke="#456b56" stroke-width="2.4" stroke-linecap="round"/><path d="M22 12c-7-2-8-8-7-11 5 1 10 5 7 11Zm5 0c3-7 8-9 13-8-1 6-6 9-13 8ZM20 19c-6 0-12-2-12-8 6-1 11 2 12 8Z" fill="#81a281" stroke="#456b56" stroke-width="1.5"/><path d="M16 23h16l-1 5c11 14-6 19-14 12-6-3-5-8 0-12Z" fill="#c59278" stroke="#724c43" stroke-width="2"/><path d="M16 32c6 3 10 3 17 0" fill="none" stroke="#f7d4a7" stroke-width="2"/>',
    book: '<path d="M6 15c8-4 14-4 18 2 5-6 11-6 18-2l-1 21c-7-3-12-3-17 1-5-4-11-5-17-1Z" fill="#8ca691" stroke="#395b51" stroke-width="2"/><path d="M8 12c7-2 12-1 16 3 4-4 10-5 16-3l-1 20c-6-3-11-2-15 1-5-3-10-4-15-1Z" fill="#f3e5c0" stroke="#907a63" stroke-width="1.4"/><path d="M24 16v16m-12-13 8 2m-8 3 8 2m8-5 8-2m-8 7 8-2" fill="none" stroke="#9d9b79" stroke-width="1.2" stroke-linecap="round"/>',
    ribbon: '<path d="M22 22c-5 5-10 12-11 17l7-3 4 4c0-7 2-11 4-16 1 5 5 11 11 13l-1-6 4-5c-7 1-10-1-13-5Z" fill="#c3868a" stroke="#81566c" stroke-width="1.8"/><path d="M24 21C9 26 5 19 7 11c6-3 12 0 17 9 5-9 11-12 17-9 2 8-2 15-17 10Z" fill="#e8afab" stroke="#81566c" stroke-width="2"/><circle cx="24" cy="21" r="4.5" fill="#c97584" stroke="#81566c" stroke-width="1.6"/>',
});

const GUEST_ART = Object.freeze({
    hali: `
        <path d="M24 65c-10-5-15-15-8-17 6-1 11 7 15 8" fill="#b2ce96"/>
        <ellipse cx="50" cy="60" rx="26" ry="19" fill="#87ab79"/>
        <path class="critters-ear" d="M39 35C21 32 23 12 21 6c18 3 29 10 26 28M51 35C51 13 62 8 79 6c-2 18-12 29-28 29" fill="#9ac58d"/>
        <path d="M34 16l9 15m27-15-13 16" fill="none" stroke="#e6e7af"/>
        <path d="M27 48c2-13 15-19 27-18 17 1 27 12 25 25-2 12-13 17-29 16-15 0-25-8-23-23Z" fill="#c7d9a2"/>
        <path d="M46 68c-3 5-1 10 7 9m10-9c4 5 4 8-4 9" fill="none"/>
        <circle cx="42" cy="50" r="3.1" fill="#263e3c" stroke="none"/><circle cx="63" cy="49" r="3.1" fill="#263e3c" stroke="none"/>
        <path d="M50 55q3 3 6 0" fill="none"/><path d="M34 56h5m29 0h5" stroke="#ce8a8b"/>
        <path d="M83 29v12m-6-6h12M14 35v8m-4-4h8" stroke="#f6e8b2"/>`,
    rosha: `
        <path d="M52 69c15 10 35 5 38-8 6-21-19-23-19-36-9 6-14 18-9 27 3 5 8 8 7 12-3 6-13 5-17 5Z" fill="#cb825c"/>
        <path d="M71 25c0 8 9 14 15 19-9 3-16 1-21-6 2-7 4-10 6-13Z" fill="#f7d8a3"/>
        <ellipse cx="42" cy="64" rx="20" ry="14" fill="#c77456"/>
        <path d="M19 39 17 16l20 14 20-3 16-14-3 25c10 19-3 30-26 31C23 69 9 55 19 39Z" fill="#d8895e"/>
        <path d="M23 32l-2-10 12 8m26-1 9-9-2 12" fill="#f2bf98"/>
        <path d="M18 50c10-4 17 1 26 8 8-7 19-11 29-8-1 13-14 20-29 20-15-1-26-7-26-20Z" fill="#f8dfb5" stroke="none"/>
        <path d="M31 46h3m20 0h3M41 55q4 5 7 0" fill="none" stroke-width="3"/>`,
    varagh: `
        <path d="M24 54 8 46l11 16-4 7 23-6" fill="#557c82"/>
        <path d="M20 54c5-11 16-18 28-16C49 17 69 15 80 26c12 11 7 37-10 45-16 8-46 5-50-8-1-3-1-6 0-9Z" fill="#82aeb0"/>
        <path d="M50 48c16-10 34-6 33 6-4 15-23 24-43 17Z" fill="#d5e0bd" stroke="none"/>
        <path class="critters-wing" d="M23 55q20-25 35-4-9 19-27 19Z" fill="#558895"/>
        <path d="m80 38 13 5-12 5" fill="#e6ab61"/><circle cx="72" cy="33" r="3.2" fill="#293f40" stroke="none"/>
        <path d="m52 73-4 7m15-8 1 7" stroke="#986343"/>`,
    tootak: `
        <path d="m15 57-6-7 9-6-3-11 12-1 2-11 13 6 8-11 8 10 13-4 2 11 12 3-5 11 10 7-11 9c-3 12-16 16-34 16-20 0-32-9-30-22Z" fill="#8e688c"/>
        <path d="m20 46 15-11 8 6 10-7 10 5m-33 9-4 7m14-10-4 5" fill="none" stroke="#c5a4ae"/>
        <path d="M42 57c1-8 10-14 20-13 9 1 14 9 17 13l8 3-7 8c-6 7-22 8-32 3-6-3-8-7-6-14Z" fill="#f0c5ab"/>
        <circle cx="65" cy="55" r="3" fill="#42384d" stroke="none"/><circle cx="86" cy="60" r="3" fill="#42384d" stroke="none"/>
        <path d="M49 74v5m16-5 2 4" fill="none"/>`,
    noktak: `
        <path class="critters-wing" d="M48 47C19 41 17 14 36 17c13 2 15 15 15 23 2-12 7-28 22-24 20 6 4 29-21 34Z" fill="#eee8cc"/>
        <path d="M29 51c5-16 36-20 46-6 9 13 0 29-18 33-22 5-35-8-28-27Z" fill="#e9b760"/>
        <path d="M39 45c-5 12-1 23 5 31m10-34c-4 12-1 24 6 33" stroke="#9c694f" stroke-width="5" fill="none"/>
        <path d="M64 50c4-6 16-7 21-1 7 10 0 19-11 19-10 1-15-9-10-18Z" fill="#f5ce77"/>
        <path d="m71 46-1-10m9 11 4-9M72 56h1m8 0h1" fill="none" stroke-width="3"/>
        <path d="M18 58h7m-10 7h10" stroke="#f6e6a5"/>`,
    shabpar: `
        <path class="critters-wing" d="M46 48C31 16 14 10 8 23 1 44 24 59 34 61 11 63 16 78 29 78 39 78 45 64 48 56c4 10 13 22 23 22 14 0 17-15-6-17 12-4 30-19 24-37-6-16-24-9-39 23Z" fill="#a5a3c1"/>
        <path d="M16 26c8-2 17 6 21 18-11 1-20-9-21-18Zm67 0c-8-2-17 6-21 18 11 1 20-9 21-18Z" fill="#d9d8cc" stroke="none"/>
        <path d="m24 67 9 2 5-8m38 6-9 2-5-8" fill="none" stroke="#ebe7d7"/>
        <ellipse cx="49" cy="52" rx="8" ry="17" fill="#e4dbb8"/><path d="M47 37c-2-8-7-10-10-9m14 9c3-8 7-10 10-9" fill="none"/>
        <circle cx="46" cy="45" r="1.7" stroke="none" fill="#293c45"/><circle cx="52" cy="45" r="1.7" stroke="none" fill="#293c45"/>`,
    danerou: `
        <path d="M19 65c-8-6-10-1-10 3 3 4 7 3 12 1" fill="#a6b785"/>
        <path d="M23 69c-7 6-4 10 4 10 7 0 9-4 9-8m14 2c0 6 13 8 16 2l-2-6" fill="#9aaf82"/>
        <path d="M19 64c1-22 13-35 34-34 19 1 27 14 27 31-11 11-48 16-61 3Z" fill="#709475"/>
        <path d="M25 54c10-10 22-11 37-7m-16-15 3 16 12 13m-25 3 12-16m16-12-5 13 13 6" fill="none" stroke="#c6d39c"/>
        <path class="critters-head" d="M66 66c-2-11 4-23 14-24 9-1 14 6 12 13-2 8-11 13-26 11Z" fill="#b5c890"/>
        <path d="M82 50h2m1 7 3-1" fill="none" stroke-width="2.5"/>`,
    abri: `
        <path d="M24 65c-12-3-17-16-11-27 5-10 14-11 20-9C36 14 54 9 65 19c6 4 7 9 8 13 12 0 19 7 18 18-2 15-15 23-31 23-18 0-20 8-31 7 4-3 7-11 3-13Z" fill="#e5e1d3"/>
        <path d="M16 52c8 8 18 4 22-2 13 9 31 12 49 2-1 12-14 20-29 20-17 0-20 7-29 8 3-4 6-11 3-13-7 0-14-6-16-15Z" fill="#b7baca" stroke="none"/>
        <path d="M38 45h2m23 0h2m-17 6q3 4 7 0" stroke-width="3" fill="none"/>
        <path d="M8 27v9m-4-5h9M86 17v13m-6-6h12" stroke="#f2d69a"/>`,
});

const STAMP_COLORS = Object.freeze(['#86a68b', '#c68362', '#84a5af', '#a1789a', '#d9ac69', '#a29cc0', '#7fa183', '#b7bdcd']);
const STAMP_MOTIFS = Object.freeze([
    'M4 16c-1-4 2-7 6-7 0 4-2 7-6 7Z', 'M4 15q6 1 6-5 4 5-2 7Z', 'M5 8h5v10l-2.5-2L5 18Z',
    'M5 12a2 2 0 1 1 3 1 2 2 0 1 1-2 4 2 2 0 1 1-1-5Z', 'M7 17q-5-5-4-8 4-1 4 4 1-6 5-4 0 4-5 8Z',
    'M4 17c0-6 3-8 8-8-1 4-4 7-8 8Z', 'M4 16v-4l4-3 4 3v4l-4 2Z', 'M4 15q-3-4 2-4 1-5 5 0 5 0 2 4Z',
]);

export function tableIcon(id) {
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${TABLE_ART[id] ?? ''}</svg>`;
}

export function guestIcon(id) {
    return `<svg viewBox="0 0 100 86" aria-hidden="true" focusable="false">${guestDrawing(id)}</svg>`;
}

export function guestDrawing(id) {
    return `<g stroke="#344b43" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round">${GUEST_ART[id] ?? ''}</g>`;
}

export function tableObject(id) { return TABLE_ART[id] ?? ''; }

export function shelfStamps(discovered, guests) {
    return guests.map((guest, index) => {
        if (!discovered.has(guest.id)) return '';
        return `<g transform="translate(${index * 18} 0)"><path d="M2 20 1 9Q7 0 14 9l-1 11Z" fill="${STAMP_COLORS[index]}" stroke="#5b4e40"/>
            <path d="${STAMP_MOTIFS[index]}" fill="#fff0ca"/></g>`;
    }).join('');
}

export const TABLE_SCENE = `
    <svg class="critters-scene__picture" viewBox="0 0 660 286" aria-hidden="true" focusable="false">
        <defs>
            <linearGradient id="critters-wall" x2="0" y2="1"><stop stop-color="#8ca48d"/><stop offset="1" stop-color="#4b6d61"/></linearGradient>
            <linearGradient id="critters-sky" x2="0" y2="1"><stop class="critters-sky-top"/><stop offset="1" class="critters-sky-bottom"/></linearGradient>
            <linearGradient id="critters-wood" x2="0" y2="1"><stop stop-color="#efc994"/><stop offset="1" stop-color="#c28559"/></linearGradient>
            <radialGradient id="critters-pool"><stop stop-color="#fff0ba" stop-opacity=".8"/><stop offset="1" stop-color="#ffe6ac" stop-opacity="0"/></radialGradient>
            <pattern id="critters-wainscot" width="28" height="29" patternUnits="userSpaceOnUse"><path d="M1 0v29m4-29v29" stroke="#374d46" stroke-opacity=".38"/></pattern>
            <clipPath id="critters-window"><rect x="126" y="20" width="416" height="154" rx="15"/></clipPath>
        </defs>
        <path d="M0 0h660v286H0z" fill="url(#critters-wall)"/>
        <path d="M0 188h660v98H0z" fill="#536d5b"/><path d="M0 188h660v98H0z" fill="url(#critters-wainscot)"/>
        <path d="M0 187h660" stroke="#b2b28d" stroke-width="5"/>
        <rect x="116" y="10" width="436" height="174" rx="21" fill="#425e52" stroke="#344b43" stroke-width="3"/>
        <g clip-path="url(#critters-window)">
            <path d="M126 20h416v154H126z" fill="url(#critters-sky)"/>
            <g class="critters-sun"><circle cx="411" cy="67" r="24" fill="#ffdf91"/><circle cx="411" cy="67" r="34" fill="#ffdf91" opacity=".24"/>
                <path d="M181 69q22-14 39 0h-39m57 16q24-16 46 0Z" fill="#f9e8b8" opacity=".8"/></g>
            <g class="critters-moon"><path d="M419 43c-32-9-44 38-11 47 9 2 20-1 25-7-22 3-32-22-14-40Z" fill="#f4e4b1"/>
                <path d="M172 51v10m-5-5h10m56 24v10m-5-5h10m257-42v9m-4-4h8m-186 9v8m-4-4h8" fill="none" stroke="#f1e7bc" stroke-width="2" stroke-linecap="round"/>
                <circle cx="194" cy="97" r="1.8" fill="#f9e8b8"/><circle cx="458" cy="76" r="1.5" fill="#f9e8b8"/></g>
            <path d="M122 155q87-56 161-25t102-6q72-30 167 6v47H122Z" class="critters-hills"/>
            <path d="M122 170q75-37 152-17t110-9q95-26 171 17v22H122Z" class="critters-near"/>
            <path d="M150 24 294 24 183 174 128 174 128 111ZM383 20h39l-98 154h-37Z" fill="#fff9d5" opacity=".1"/>
        </g>
        <path d="M334 22v151M126 101h416" stroke="#c8c2a0" stroke-width="6"/>
        <path d="M125 176h418" stroke="#e8cd9b" stroke-width="7" stroke-linecap="round"/>
        <path d="M40 0v30m574-30v36" stroke="#3f594d" stroke-width="2"/>
        <path d="M28 30h24l10 14H18Zm573 6h25l10 14h-45Z" fill="#d3b481" stroke="#516251" stroke-width="2"/>
        <path d="M31 45h17m557 6h17" stroke="#fff0ba" stroke-width="3" stroke-linecap="round"/>
        <path d="M35 89v55m0-21c-19 2-24-7-24-19 13 0 19 9 24 19m0 3c8-18 17-22 24-18 0 9-8 17-24 18m0-13c-11-8-13-18-8-25 10 4 10 14 8 25" fill="#719676" stroke="#4a6e56" stroke-width="2"/>
        <path d="M17 142h36l-5 24H22Z" fill="#d4a282" stroke="#705a49" stroke-width="2"/>
        <path d="M579 148h55m-55 8h55" stroke="#c4a47d" stroke-width="5" stroke-linecap="round"/>
        <g fill="#9d745e" stroke="#5b5044" stroke-width="2"><path d="M586 148v-24h10v24Zm11 0v-19h11v19Z"/><path d="M613 148l-2-25 10-1 4 26Z" fill="#c5a58a"/></g>
        <path d="M76 191h171" stroke="#8e6e55" stroke-width="5" stroke-linecap="round"/>
        <g data-critters-table-shelf transform="translate(84 168)"></g>
        <path d="M93 268v18h19l4-18m431 0v18h19l4-18" fill="#6b513e"/>
        <path d="M41 240c0-29 129-52 289-52s289 23 289 52v11c0 20-129 34-289 34S41 271 41 251Z" fill="#986c50" stroke="#5a493d" stroke-width="3"/>
        <ellipse cx="330" cy="239" rx="289" ry="48" fill="url(#critters-wood)" stroke="#8a6246" stroke-width="2"/>
        <path d="M79 231q117-39 263-32t232 29M108 251q117 31 253 24t183-23m-430-15q76-21 187-21m115 35q65-1 106-12" fill="none" stroke="#8d623f" opacity=".32" stroke-width="1.8"/>
        <ellipse class="critters-light-pool" cx="330" cy="232" rx="220" ry="54" fill="url(#critters-pool)"/>
        <ellipse cx="224" cy="240" rx="35" ry="12" fill="#f0ddaf" stroke="#aa7e5c" stroke-width="2"/>
        <ellipse cx="431" cy="236" rx="33" ry="12" fill="#b69770" opacity=".6"/>
        <ellipse cx="331" cy="240" rx="36" ry="9" fill="#6f513f" opacity=".23"/>
        <g data-critters-table-food transform="translate(200 197)"></g>
        <g data-critters-table-decor transform="translate(404 182) scale(1.1)"></g>
        <g data-critters-table-guest transform="translate(274 151) scale(1.15)"></g>
    </svg>
`;
