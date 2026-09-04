import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class CafeDriftGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'cafe-drift', title: 'CAFÉ DRIFT', subtitle: 'Near Miss = Big Score', kicker: 'DEMIAN ARCADE / 03', objective: 'میان موانع کافه دریفت کن؛ نزدیک‌ردشدن Combo می‌دهد.', controls: 'WASD / جوی‌استیک · DASH', duration: 65 }); }
}
