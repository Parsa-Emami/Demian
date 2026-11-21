import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CAFE_SOUNDTRACKS, cafeMusicFrame } from
    '../../resources/js/game/services/CafeSoundtrack.js';
import FeedbackAudioEngine, { FEEDBACK_TONES } from
    '../../resources/js/game/services/FeedbackAudioEngine.js';
import { gameLoadRecovery, rankingResultUX } from
    '../../resources/js/game/ui/GameFailureUX.js';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const catalogIds = GAME_CATALOG.map(item => item.id);

class FakeParam {
    constructor() { this.value = 0; this.calls = []; }
    setValueAtTime(value, at) { this.value = value; this.calls.push(['set',value,at]); }
    linearRampToValueAtTime(value, at) { this.value = value; this.calls.push(['linear',value,at]); }
    exponentialRampToValueAtTime(value, at) { this.value = value; this.calls.push(['exp',value,at]); }
}
class FakeNode {
    constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.stopped = false; }
    connect() {}
    disconnect() {}
    start() {}
    stop() { if (this.stopped) throw Error('double-stop'); this.stopped=true; this.onended?.(); }
}
class FakeContext {
    constructor() { this.state='running'; this.currentTime=4; this.destination={}; this.oscillators=[]; this.closed=false; }
    createOscillator() { const node=new FakeNode(); this.oscillators.push(node); return node; }
    createGain() { return new FakeNode(); }
    resume() { this.state='running'; return Promise.resolve(); }
    close() { this.closed=true; return Promise.resolve(); }
}

test('F7-07/08: all seven published titles have distinct authored, bounded original soundtracks', () => {
    assert.deepEqual(new Set(Object.keys(CAFE_SOUNDTRACKS)), new Set(catalogIds));
    const signatures=new Set();
    for (const id of catalogIds) {
        const scene=CAFE_SOUNDTRACKS[id];
        assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.lead));
        assert.ok(scene.bpm>=65 && scene.bpm<=145);
        assert.equal(scene.lead.length,8);
        assert.equal(scene.bass.length,8);
        signatures.add(scene.lead.join(',')+'|'+scene.bass.join(',')+'|'+scene.root);
        for(let tick=0;tick<64;tick++){
            const frame=cafeMusicFrame(id,tick);
            assert.ok(frame.leadHz>=65 && frame.leadHz<=1200);
            assert.ok(frame.bassHz>=35 && frame.bassHz<=600);
            assert.ok(frame.beatSeconds>0.35 && frame.beatSeconds<1);
        }
        assert.deepEqual(cafeMusicFrame(id,8),cafeMusicFrame(id,0));
    }
    assert.equal(signatures.size,7);
    assert.equal(cafeMusicFrame('archived'),null);
    assert.deepEqual(cafeMusicFrame('dino-run',Infinity),cafeMusicFrame('dino-run',0));
    for(const kind of ['start','score','win','lose','ui','error','jump','collision','interaction','combo']){
        assert.ok(Object.hasOwn(FEEDBACK_TONES,kind),kind);
    }
});

test('F7-08: no autoplay, 2 reuseable voices, independent music/SFX mute, pause, hidden and dispose', () => {
    let instances=0,now=1000;
    const context=new FakeContext();
    const audio=new FeedbackAudioEngine({createContext:()=>{instances++;return context;},now:()=>now});
    audio.setGame('cafe-drift');
    assert.equal(instances,0);
    assert.equal(audio.musicNodes.length,0);
    assert.equal(audio.play('jump'),false);
    assert.equal(audio.unlock(),true);
    assert.equal(instances,1);
    assert.equal(audio.musicNodes.length,2);
    assert.ok(audio.musicStep>=1);
    assert.ok(audio.musicTimer !== null);
    assert.equal(audio.play('jump'),true);
    assert.equal(audio.play('jump'),false,'debounce repeat SFX');
    audio.configure({soundEnabled:false,musicEnabled:true});
    assert.equal(audio.play('interaction'),false);
    assert.equal(audio.musicNodes.length,2);
    audio.configure({soundEnabled:true,musicEnabled:false});
    assert.equal(audio.musicNodes.length,0);
    assert.equal(audio.musicTimer,null);
    now+=1000;
    assert.equal(audio.play('collision'),true);
    audio.configure({soundEnabled:false,musicEnabled:true});
    assert.equal(audio.voices.size,0);
    assert.equal(audio.musicNodes.length,2);
    audio.setPaused(true);
    assert.equal(audio.musicNodes.length,0);
    audio.setPaused(false);
    assert.equal(audio.musicNodes.length,2);
    audio.setHidden(true);
    assert.equal(audio.musicNodes.length,0);
    audio.setHidden(false);
    assert.equal(audio.musicNodes.length,2);
    audio.setGame('open-world');
    assert.equal(audio.musicNodes.length,2);
    audio.dispose();
    audio.dispose();
    assert.equal(audio.musicTimer,null);
    assert.equal(audio.musicNodes.length,0);
    assert.equal(context.closed,true);
});

test('F7-10: loading failures are actionable, do not print unsafe raw server messages', () => {
    assert.match(gameLoadRecovery(new Error('x'),{online:false}),/آفلاین/);
    assert.match(gameLoadRecovery({status:419}),/نشست/);
    assert.match(gameLoadRecovery({status:429}),/درخواست/);
    assert.match(gameLoadRecovery({code:504}),/ارتباط/);
    assert.match(gameLoadRecovery({message:'Loading chunk failed'}),/فایل/);
    const secret='Bearer aaa-secret-login';
    assert.doesNotMatch(gameLoadRecovery({message:secret}),/aaa-secret-login/);
    assert.match(gameLoadRecovery({message:secret}),/بازی/);
});

test('F7-11: local practice, pending online, verified official and coupons are explicitly separated', () => {
    const statuses=['verified','practice','pending','rejected','unknown'];
    for(const status of statuses) {
        const info=rankingResultUX(status);
        assert.ok(info.heading.length>=20);
        assert.ok(info.detail.length>=20);
        assert.ok(!/کوپن قطعی/.test(info.heading));
    }
    assert.match(rankingResultUX('verified').detail,/کوپن نیست/);
    assert.match(rankingResultUX('practice').heading,/تمرینی/);
    assert.match(rankingResultUX('pending').detail,/تأیید/);
    assert.equal(rankingResultUX('nonsense'),rankingResultUX('unknown'));
});

test('F7-01/02/03/04/05/06/09: shared shell and character controls remain semantic and responsive', () => {
    const html=read('../../resources/views/demian.blade.php');
    const cards=read('../../resources/js/game/shell/screens/GameSelectionScreen.js');
    const results=read('../../resources/js/game/shell/screens/ResultsScreen.js');
    const ux=read('../../resources/css/phase7-ux-audio.css');
    const character=read('../../resources/js/ui/CharacterManagerUI.js');
    for(const key of ['data-shell-action="play"','data-screen="game-selection"',
       'data-screen="settings"','data-screen="results"','data-shell-network-status',
       'data-results-record-note','data-results-reward-note','data-character-selection-live']) {
        assert.ok(html.includes(key),key);
    }
    assert.match(cards,/game-card__scene-preview/);
    for(const suffix of ['interior.webp','preview.webp'])
        assert.ok(cards.includes(suffix));
    assert.match(cards,/data-game-design-guide/);
    assert.match(results,/renderRanking/);
    assert.match(results,/gameOutcomeHint/);
    assert.match(character,/aria-pressed/);
    assert.match(character,/selectedAnnouncement/);
    assert.match(ux,/max-width: 370px/);
    assert.match(ux,/min-height: 48px/);
    assert.match(ux,/prefers-reduced-motion: reduce/);
    assert.match(ux,/forced-colors: active/);
    assert.match(ux,/focus-visible/);
    assert.match(ux,/data-hud-contrast="high"/);
    assert.match(read('../../resources/js/app.js'),/phase7-ux-audio.css/);
    assert.ok(existsSync(new URL('../../public/assets/environments/cafe-runner-v1/interior.webp',import.meta.url)));
    assert.ok(existsSync(new URL('../../public/assets/environments/demian-fbx/polished-v1/preview.webp',import.meta.url)));
});

test('F7-12: browser regression covers 320 / 390, settings, navigation, retry and result truthfulness', () => {
    const script=read('../../tools/check_phase07_ux_flow.mjs');
    for(const fragment of ['width:320','width:390','launchGame(','pauseGame()',
       'data-shell-action="resume"','restartGame()','data-results-record-note',
       'data-shell-network-status','soundEnabled','musicEnabled','phase07-ux-qa.json']) {
        assert.ok(script.includes(fragment),fragment);
    }
});
