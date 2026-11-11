import { INGREDIENTS } from './CoffeeCrashData.js';

export function ingredientArt(type) {
    const ingredient = INGREDIENTS[type];
    const art = type === 4
        ? `<ellipse cx="40" cy="69" rx="32" ry="5" fill="#654126" opacity=".12"/>
           <path d="M8 55Q10 36 25 33L29 24Q40 18 51 26L56 35Q72 39 73 57L63 62L54 56Q40 64 26 56L17 63Z" fill="#c7792b" stroke="#8e4c25" stroke-width="2"/>
           <path d="M12 52Q18 36 26 38L29 49L19 57ZM29 28Q38 22 43 25L41 53L29 50ZM45 26L51 31L55 50L44 54ZM57 39Q67 42 69 54L61 56Z" fill="#efb85f"/>
           <path d="M30 30L33 47M47 31L50 47M19 42L22 49M61 45L64 50" stroke="#ffe1a0" stroke-width="2" stroke-linecap="round"/>`
        : `<ellipse cx="40" cy="72" rx="23" ry="4" fill="#654126" opacity=".12"/>
           <path d="M19 20L25 64Q40 74 55 64L61 20Z" fill="${type === 2 ? '#ec79a4' : type === 3 ? '#b49ad8' : '#d9b182'}" stroke="${type > 1 ? ingredient.color : '#9b704d'}" stroke-width="2"/>
           <path d="M23 25L29 61Q34 64 36 63L30 27Z" fill="#fff7e8" opacity=".32"/>
           <ellipse cx="40" cy="21" rx="21" ry="8" fill="${type === 0 ? '#67412e' : type === 1 ? '#e2b574' : ingredient.color}" stroke="${type > 1 ? ingredient.color : '#b0875e'}" stroke-width="2"/>
           ${type === 1 ? '<path d="M28 22C22 12 49 11 51 20C52 26 35 28 33 21C31 17 44 17 45 21C43 25 36 20 38 20" fill="none" stroke="#fff1cf" stroke-width="3" stroke-linecap="round"/>' : ''}
           ${type > 1 ? '<path d="M23 19L29 12L34 17L40 9L46 15L53 11L58 21Z" fill="' + (type === 2 ? '#f8a8c7' : '#d1c1ec') + '"/><path d="M28 32L30 36M49 31L47 35M34 41L35 45M50 44L49 48M29 51L31 54" stroke="' + ingredient.color + '" stroke-width="3" stroke-linecap="round"/>' : ''}
           <path d="M45 43C36 34 31 49 38 53C45 56 48 45 43 41L43 54" fill="none" stroke="${type > 1 ? '#593b69' : '#5e432e'}" stroke-width="2.3" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">${art}</svg>`;
}
