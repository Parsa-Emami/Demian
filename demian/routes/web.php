<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;

Route::get('/', [CharacterStudioController::class, 'index'])->name('studio.index');

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
