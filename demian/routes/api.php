<?php

use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\EventSessionController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ArcadeController;
use App\Http\Controllers\Api\V1\ArcadeHealthController;
use App\Http\Middleware\AuthenticateArcadePlayer;
use App\Http\Middleware\LimitArcadePayload;
use App\Http\Middleware\AuthenticateCouponStore;
use App\Http\Controllers\Api\V1\ArcadeCouponController;

Route::prefix('v1/arcade')->middleware([LimitArcadePayload::class, 'throttle:arcade-public-ip'])->group(function (): void {
    Route::get('/health', ArcadeHealthController::class);
    Route::get('/rules', [ArcadeController::class, 'rules']);
    Route::get('/games', [ArcadeController::class, 'games']);
    Route::get('/leaderboards/dino-run', [ArcadeController::class, 'leaderboard']);
    Route::post('/players', [ArcadeController::class, 'register'])->middleware('throttle:arcade-registration');
    Route::post('/players/recover', [ArcadeController::class, 'recover'])->middleware('throttle:arcade-account-recover');
    Route::middleware(AuthenticateArcadePlayer::class)->group(function (): void {
        Route::get('/player', [ArcadeController::class, 'me']);
        Route::get('/player/coupons', [ArcadeCouponController::class, 'mine'])
            ->middleware('throttle:arcade-coupon-owner');
        Route::post('/player/recovery-link', [ArcadeController::class, 'issueRecoveryLink'])
            ->middleware('throttle:arcade-recovery-issue');
        Route::post('/player/backup-code', [ArcadeController::class, 'issueBackupCode'])
            ->middleware('throttle:arcade-backup-issue');
        Route::get('/player/best', [ArcadeController::class, 'personalBest']);
        Route::patch('/player', [ArcadeController::class, 'rename'])->middleware('throttle:arcade-player-rename');
        Route::delete('/player', [ArcadeController::class, 'erase'])->middleware('throttle:arcade-profile-delete');
        Route::post('/runs', [ArcadeController::class, 'start'])->middleware('throttle:arcade-run-start');
        Route::post('/runs/{run}/complete', [ArcadeController::class, 'complete'])->middleware('throttle:arcade-run-complete');
    });
});

Route::prefix('v1')->middleware('throttle:60,1')->group(function (): void {
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/active', [EventController::class, 'active']);
    Route::get('/events/{event}', [EventController::class, 'show']);
    Route::post('/events/{event}/sessions', [EventSessionController::class, 'store']);
    Route::post('/event-sessions/{eventSession}/complete', [EventSessionController::class, 'complete']);
});


// Server-to-server checkout. Never expose issuance or redemption to a player
// bearer token. Signed requests need a TLS-bound merchant secret and a nonce.
Route::prefix('v1/arcade/store/coupons')->middleware([
    LimitArcadePayload::class, 'throttle:arcade-coupon-store', AuthenticateCouponStore::class,
])->group(function (): void {
    Route::post('/quote', [ArcadeCouponController::class, 'quote']);
    Route::post('/reserve', [ArcadeCouponController::class, 'reserve']);
    Route::post('/capture', [ArcadeCouponController::class, 'capture']);
    Route::post('/release', [ArcadeCouponController::class, 'release']);
});
