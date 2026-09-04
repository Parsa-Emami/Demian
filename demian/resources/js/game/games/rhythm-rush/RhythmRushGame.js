import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class RhythmRushGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'rhythm-rush', title: 'RHYTHM RUSH', subtitle: 'Jump · Use · Dash', kicker: 'DEMIAN ARCADE / 06', objective: 'نت‌ها را روی خط طلایی با اکشن درست بزن.', controls: 'JUMP = چپ · USE = وسط · DASH = راست', duration: 60 }); }
}
