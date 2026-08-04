<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Character Studio
|--------------------------------------------------------------------------
|
| Keep the browser entry point explicit and unconditional. GitHub Pages is
| exported from this route, while Laravel feature tests request the same /.
| Do not prefix this route with the repository Pages base path.
|
*/
Route::get('/', CharacterStudioController::class)
    ->name('studio');

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
