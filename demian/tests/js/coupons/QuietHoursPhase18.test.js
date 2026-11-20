import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

test('quiet-hour claims require an authenticated owner and a positive integer offer', async () => {
    const calls=[];
    const api=new ArcadeLeaderboardService({baseUrl:'https://arcade-api.example.test/api/v1/arcade',
        storage:null,identityStorage:null,fetcher:async(url,options)=>{
            calls.push({url,options});
            return {ok:true,json:async()=>({available:true,eligible:true,data:[],coupon_id:12})};
        }});
    assert.equal((await api.quietHours()).available,false);
    await assert.rejects(api.claimQuietHours(1));
    api.identity={token:'B'.repeat(64),player_id:'owner'};
    await assert.rejects(api.claimQuietHours(-1));
    await assert.rejects(api.claimQuietHours('1'));
    assert.equal(calls.length,0);
    await api.quietHours();
    assert.equal((await api.claimQuietHours(5)).coupon_id,12);
    assert.match(calls[0].url,/\/player\/quiet-hours$/);
    assert.match(calls[1].url,/\/player\/quiet-hours\/5\/claim$/);
    assert.equal(calls[1].options.method,'POST');
    for(const {options} of calls){
        assert.equal(options.headers.Authorization,'Bearer '+'B'.repeat(64));
        assert.equal(options.cache,'no-store');
        assert.equal(options.credentials,'omit');
    }
});
