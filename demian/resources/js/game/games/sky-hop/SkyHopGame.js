import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class SkyHopGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'sky-hop', title: 'SKY HOP', subtitle: 'Reach 100 Meters', kicker: 'DEMIAN ARCADE / 05', objective: 'روی سکوها بپر و تا ارتفاع ۱۰۰ متر بالا برو.', controls: 'A/D یا جوی‌استیک · JUMP برای پرش بلند', duration: 80 }); }
}
