<?php

use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\EventSessionController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('throttle:60,1')->group(function (): void {
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/active', [EventController::class, 'active']);
    Route::get('/events/{event}', [EventController::class, 'show']);
    Route::post('/events/{event}/sessions', [EventSessionController::class, 'store']);
    Route::post('/event-sessions/{eventSession}/complete', [EventSessionController::class, 'complete']);
});
