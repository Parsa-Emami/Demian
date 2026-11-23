<?php

use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\EventSessionController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ArcadeController;
use App\Http\Controllers\Api\V1\ArcadeHealthController;
use App\Http\Controllers\Api\V1\ArcadeTelemetryController;
use App\Http\Controllers\Api\V1\ArcadePrivacyController;
use App\Http\Controllers\Api\V1\ArcadeIdentityController;
use App\Http\Controllers\Api\V1\ArcadeFraudAppealController;
use App\Http\Controllers\Api\V1\ArcadeTurnRunController;
use App\Http\Controllers\Api\V1\CouponController;
use App\Http\Controllers\Api\V1\CouponDeliveryController;
use App\Http\Middleware\AuthenticateArcadePlayer;
use App\Http\Middleware\LimitArcadePayload;
use App\Http\Middleware\ObserveArcadeReplayFailures;
use App\Http\Middleware\ObserveArcadeRequest;
use App\Http\Middleware\RequireArcadeLegalAcceptance;

Route::prefix('v1/arcade')->middleware([ObserveArcadeRequest::class,
    LimitArcadePayload::class, 'throttle:arcade-public-ip'])->group(function (): void {
    Route::get('/health', ArcadeHealthController::class);
    Route::post('/telemetry', ArcadeTelemetryController::class)
        ->middleware('throttle:arcade-telemetry');
    Route::get('/legal', [ArcadePrivacyController::class, 'policy']);
    Route::get('/rules', [ArcadeController::class, 'rules']);
    Route::get('/games', [ArcadeController::class, 'games']);
    Route::get('/competition/weekly', [ArcadeController::class, 'weeklyCompetition']);
    Route::get('/competition/fair/rules', [ArcadeController::class, 'fairRules']);
    Route::get('/competition/fair', [ArcadeController::class, 'fairLeaderboard']);
    Route::get('/competition/leaderboard', [ArcadeController::class, 'weeklyRankings']);
    Route::get('/competition/leaderboard/weeks', [ArcadeController::class, 'weeklyRankingWeeks']);
    Route::get('/leaderboards/dino-run', [ArcadeController::class, 'leaderboard']);
    Route::get('/leaderboards/cafe-critters', [ArcadeTurnRunController::class, 'leaderboard']);
    Route::get('/leaderboards/coffee-crash', [ArcadeTurnRunController::class, 'coffeeLeaderboard']);
    Route::get('/leaderboards/{gameId}', [ArcadeTurnRunController::class, 'gameLeaderboard'])
        ->whereIn('gameId', ['after-hours', 'cafe-rush', 'open-world', 'cafe-drift']);
    Route::post('/players', [ArcadeController::class, 'register'])->middleware('throttle:arcade-registration');
    Route::post('/players/login', [ArcadeController::class, 'login'])->middleware('throttle:arcade-password-login');
    Route::post('/players/recover', [ArcadeController::class, 'recover'])->middleware('throttle:arcade-account-recover');
    // Online checkout routes intentionally retired. Only authenticated
    // in-cafe staff may redeem coupons through CSRF-protected web routes.
    Route::middleware(AuthenticateArcadePlayer::class)->group(function (): void {
        Route::get('/player/coupons', [CouponController::class, 'wallet'])
            ->middleware('throttle:arcade-coupon-wallet');
        Route::post('/player/coupons/{couponId}/acknowledge',
            [CouponDeliveryController::class, 'acknowledge'])
            ->whereNumber('couponId')->middleware('throttle:arcade-coupon-support');
        Route::post('/player/coupons/{couponId}/disputes',
            [CouponDeliveryController::class, 'openCase'])
            ->whereNumber('couponId')->middleware('throttle:arcade-coupon-support');
        Route::get('/player', [ArcadeController::class, 'me']);
        Route::get('/player/identity', [ArcadeIdentityController::class, 'status']);
        Route::post('/player/password', [ArcadeController::class, 'setPassword'])
            ->middleware('throttle:arcade-password-change');
        Route::get('/player/fraud/appeals', [ArcadeFraudAppealController::class, 'index'])
            ->middleware('throttle:arcade-coupon-wallet');
        Route::post('/player/fraud/appeals', [ArcadeFraudAppealController::class, 'submit'])
            ->middleware('throttle:arcade-fraud-appeal');
        Route::post('/player/phone/otp', [ArcadeIdentityController::class, 'sendOtp'])
            ->middleware('throttle:arcade-otp-send');
        Route::post('/player/phone/verify', [ArcadeIdentityController::class, 'verifyOtp'])
            ->middleware('throttle:arcade-otp-verify');
        Route::post('/player/session/rotate', [ArcadeIdentityController::class, 'rotate'])
            ->middleware('throttle:arcade-session-change');
        Route::post('/player/session/revoke', [ArcadeIdentityController::class, 'revoke'])
            ->middleware('throttle:arcade-session-change');
        Route::patch('/player/contact', [ArcadeController::class, 'updateContact'])
            ->middleware('throttle:arcade-player-rename');
        Route::post('/player/legal', [ArcadeController::class, 'acknowledgeLegal'])
            ->middleware('throttle:arcade-legal-ack');
        Route::get('/player/data', [ArcadePrivacyController::class, 'snapshot'])
            ->middleware('throttle:arcade-coupon-wallet');
        Route::get('/player/data/records', [ArcadePrivacyController::class, 'records'])
            ->middleware('throttle:arcade-coupon-wallet');
        Route::post('/player/recovery-link', [ArcadeController::class, 'issueRecoveryLink'])
            ->middleware('throttle:arcade-recovery-issue');
        Route::post('/player/backup-code', [ArcadeController::class, 'issueBackupCode'])
            ->middleware('throttle:arcade-backup-issue');
        Route::get('/player/best', [ArcadeController::class, 'personalBest']);
        Route::get('/player/competition/leaderboard', [ArcadeController::class, 'myWeeklyRanking'])
            ->middleware('throttle:arcade-coupon-wallet');
        Route::patch('/player', [ArcadeController::class, 'rename'])->middleware('throttle:arcade-player-rename');
        Route::delete('/player', [ArcadeController::class, 'erase'])->middleware('throttle:arcade-profile-delete');
        // Independent server-replay endpoint for games whose action verifier
        // has passed differential tests. Unverified games are rejected (422).
        Route::post('/turn-runs', [ArcadeTurnRunController::class, 'start'])
            ->middleware(['throttle:arcade-run-start', RequireArcadeLegalAcceptance::class,
                ObserveArcadeReplayFailures::class]);
        Route::post('/turn-runs/{run}/complete',
            [ArcadeTurnRunController::class, 'complete'])
            ->middleware(['throttle:arcade-run-complete', ObserveArcadeReplayFailures::class]);
        Route::post('/runs', [ArcadeController::class, 'start'])
            ->middleware(['throttle:arcade-run-start', RequireArcadeLegalAcceptance::class,
                ObserveArcadeReplayFailures::class]);
        Route::post('/runs/{run}/complete', [ArcadeController::class, 'complete'])
            ->middleware(['throttle:arcade-run-complete', ObserveArcadeReplayFailures::class]);
    });
});

Route::prefix('v1')->middleware('throttle:60,1')->group(function (): void {
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/active', [EventController::class, 'active']);
    Route::get('/events/{event}', [EventController::class, 'show']);
    Route::post('/events/{event}/sessions', [EventSessionController::class, 'store']);
    Route::post('/event-sessions/{eventSession}/complete', [EventSessionController::class, 'complete']);
});
