import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class ShadowMazeGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'shadow-maze', title: 'SHADOW MAZE', subtitle: '5 Keys · One Exit', kicker: 'DEMIAN ARCADE / 04', objective: 'پنج کلید را جمع کن، از سایه‌ها رد شو و خروجی را باز کن.', controls: 'WASD / جوی‌استیک · RUN · DASH', duration: 75 }); }
}
