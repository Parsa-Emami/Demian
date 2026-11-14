<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Cafe\CashierController;
use App\Http\Middleware\AuthenticateCafeCashier;

// Authorized cafe staff use Laravel's CSRF-protected web session middleware,
// including when the API host is in API-only mode. Never open character studio.
Route::prefix('cashier')->name('cashier.')->group(function (): void {
    Route::get('/login', [CashierController::class, 'loginForm'])->name('login');
    Route::post('/login', [CashierController::class, 'login'])
        ->middleware('throttle:arcade-cashier-login')->name('authenticate');
    Route::middleware(AuthenticateCafeCashier::class)->group(function (): void {
        Route::get('/', [CashierController::class, 'index'])->name('index');
        Route::post('/lookup', [CashierController::class, 'lookup'])
            ->middleware('throttle:arcade-cashier-lookup')->name('lookup');
        Route::post('/redeem', [CashierController::class, 'redeem'])
            ->middleware('throttle:arcade-cashier-redeem')->name('redeem');
        Route::get('/report', [CashierController::class, 'report'])->name('report');
        Route::post('/logout', [CashierController::class, 'logout'])->name('logout');
    });
});

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
