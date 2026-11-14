<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;

// The public cPanel instance is an API-only origin. The character-management
// web routes belong to a different trust zone and must not be exposed there.
if (config('demian-arcade.api_only', false)) return;

Route::get('/', [CharacterStudioController::class, 'index'])->name('studio');

Route::prefix('characters')
    ->name('characters.')
    ->group(function (): void {
        Route::get('/', [CharacterController::class, 'index'])->name('index');
        Route::post('/', [CharacterController::class, 'store'])->name('store');
        Route::get('/{character}', [CharacterController::class, 'show'])->name('show');
        Route::match(['put', 'patch'], '/{character}', [CharacterController::class, 'update'])
            ->name('update');
        Route::post('/{character}/activate', [CharacterController::class, 'activate'])
            ->name('activate');
        Route::delete('/{character}', [CharacterController::class, 'destroy'])
            ->name('destroy');
    });
