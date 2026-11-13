<?php

use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\EventSessionController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ArcadeController;
use App\Http\Middleware\AuthenticateArcadePlayer;
use App\Http\Middleware\LimitArcadePayload;

Route::prefix('v1/arcade')->middleware([LimitArcadePayload::class, 'throttle:120,1'])->group(function (): void {
    Route::get('/rules', [ArcadeController::class, 'rules']);
    Route::get('/games', [ArcadeController::class, 'games']);
    Route::get('/leaderboards/dino-run', [ArcadeController::class, 'leaderboard']);
    Route::post('/players', [ArcadeController::class, 'register'])->middleware('throttle:5,1');
    Route::middleware(AuthenticateArcadePlayer::class)->group(function (): void {
        Route::get('/player', [ArcadeController::class, 'me']);
        Route::get('/player/best', [ArcadeController::class, 'personalBest']);
        Route::patch('/player', [ArcadeController::class, 'rename'])->middleware('throttle:5,1');
        Route::delete('/player', [ArcadeController::class, 'erase'])->middleware('throttle:2,1');
        Route::post('/runs', [ArcadeController::class, 'start'])->middleware('throttle:10,1');
        Route::post('/runs/{run}/complete', [ArcadeController::class, 'complete'])->middleware('throttle:20,1');
    });
});

Route::prefix('v1')->middleware('throttle:60,1')->group(function (): void {
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/active', [EventController::class, 'active']);
    Route::get('/events/{event}', [EventController::class, 'show']);
    Route::post('/events/{event}/sessions', [EventSessionController::class, 'store']);
    Route::post('/event-sessions/{eventSession}/complete', [EventSessionController::class, 'complete']);
});
