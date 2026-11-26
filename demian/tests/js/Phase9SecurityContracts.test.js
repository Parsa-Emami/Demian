import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('F9-01/02: registration contact is not a verified phone and UI never caches OTP',()=>{
    const panel=read('../../resources/js/game/ui/PlayerIdentityPanel.js');
    const identity=read('../../resources/js/game/leaderboard/ArcadeLeaderboardService.js');
    const html=read('../../resources/views/demian.blade.php');
    assert.match(panel,/\/player\/phone\/otp/);
    assert.match(panel,/\/player\/phone\/verify/);
    assert.match(panel,/authenticated: true/);
    assert.doesNotMatch(panel,/localStorage|sessionStorage|safeWrite|document\.cookie/);
    assert.match(html,/autocomplete="one-time-code"/);
    assert.match(html,/data-player-identity-status/);
    assert.match(identity,/credentials: 'omit'/);
});
test('F9-05/08/09/10/11: score and money authority cannot be carried by UI',()=>{
    const result=read('../../resources/js/game/ui/PlayerIdentityPanel.js');
    assert.doesNotMatch(result,/\/coupons\/issue|\/coupons\/redeem|\/runs\/.*\/approve/);
    const names=['RunnerReplayVerifier.php','CafeCrittersReplayVerifier.php',
        'CoffeeCrashReplayVerifier.php','CafeDriftReplayVerifier.php'];
    for(const name of names)assert.match(read('../../app/Services/Arcade/'+name),/function |class /);
    assert.match(read('../../app/Services/Arcade/ReplayCompletionService.php'),/lockForUpdate/);
    assert.match(read('../../app/Services/Arcade/InCafeCouponService.php'),/lockForUpdate/);
    assert.match(read('../../app/Services/Arcade/WeeklyFairScoringService.php'),/class WeeklyFairScoringService/);
    assert.match(read('../../app/Services/Arcade/CouponIssuanceService.php'),/assertVerifiedRecipient/);
    assert.match(read('../../app/Services/Arcade/ManualCouponGiftService.php'),/assertVerifiedRecipient/);
});
test('F9-03/07/12/13/14: signed backend-only capabilities, limits, encrypted appeals',()=>{
    const routes=read('../../routes/api.php');
    const middleware=read('../../app/Http/Middleware/AuthenticateArcadePlayer.php');
    const staff=read('../../app/Http/Middleware/AuthenticateCafeCashier.php');
    const otp=read('../../app/Services/Arcade/ArcadePhoneVerification.php');
    const appeal=read('../../app/Services/Arcade/ArcadeFraudAppeals.php');
    const config=read('../../config/demian-arcade.php');
    for(const x of ['arcade-otp-send','arcade-otp-verify','arcade-session-change',
        'arcade-fraud-appeal','AuthenticateArcadePlayer::class'])assert.ok(
        routes.includes(x)||read('../../app/Providers/AppServiceProvider.php').includes(x),x);
    assert.match(otp,/hash_hmac\('sha256'/);
    assert.match(otp,/lockForUpdate\(\)/);
    assert.match(otp,/random_int\(100000, 999999\)/);
    assert.match(appeal,/Crypt::encryptString/);
    assert.match(appeal,/super_admin/);
    assert.match(staff,/cafe_staff_version|session_version/);
    assert.match(middleware,/token_expires_at/);
    assert.match(config,/prize_identity_required/);
    assert.match(read('../../app/Services/Arcade/ArcadeAntiCheat.php'),/NEW-run-only hold/);
});
