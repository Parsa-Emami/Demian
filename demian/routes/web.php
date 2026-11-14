<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Cafe\CashierController;
use App\Http\Middleware\AuthenticateCafeCashier;
use App\Http\Middleware\RequireCafePermission;
use App\Http\Controllers\Cafe\CafeAdminController;

// Authorized cafe staff use Laravel's CSRF-protected web session middleware,
// including when the API host is in API-only mode. Never open character studio.
Route::prefix('cashier')->name('cashier.')->group(function (): void {
    Route::get('/login', [CashierController::class, 'loginForm'])->name('login');
    Route::post('/login', [CashierController::class, 'login'])
        ->middleware('throttle:arcade-cashier-login')->name('authenticate');
    Route::middleware(AuthenticateCafeCashier::class)->group(function (): void {
        Route::get('/', [CashierController::class, 'index'])->name('index');
        Route::post('/lookup', [CashierController::class, 'lookup'])
            ->middleware(['throttle:arcade-cashier-lookup',
                RequireCafePermission::class.':coupon.lookup'])->name('lookup');
        Route::post('/redeem', [CashierController::class, 'redeem'])
            ->middleware(['throttle:arcade-cashier-redeem',
                RequireCafePermission::class.':coupon.redeem'])->name('redeem');
        Route::get('/report', [CashierController::class, 'report'])
            ->middleware(RequireCafePermission::class.':report.branch')->name('report');
        Route::get('/admin/staff', [CafeAdminController::class, 'directory'])
            ->middleware(RequireCafePermission::class.':staff.directory')->name('staff');
        Route::post('/admin/staff/{subjectId}/{operation}',
            [CafeAdminController::class, 'setStaffActive'])
            ->whereNumber('subjectId')->whereIn('operation', ['enable', 'disable'])
            ->middleware('throttle:arcade-cashier-admin')->name('staff.action');
        Route::get('/admin/reports/global', [CafeAdminController::class, 'globalReport'])
            ->middleware(RequireCafePermission::class.':report.global')->name('report.global');
        Route::post('/admin/coupons/revoke', [CafeAdminController::class, 'revoke'])
            ->middleware([RequireCafePermission::class.':coupon.revoke',
                'throttle:arcade-cashier-admin'])->name('coupons.revoke');
        Route::get('/admin/audit', [CafeAdminController::class, 'audit'])
            ->middleware(RequireCafePermission::class.':audit.ledger')->name('audit');
        Route::get('/admin/readiness', [CafeAdminController::class, 'readiness'])
            ->middleware(RequireCafePermission::class.':operations.readiness')->name('readiness');
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
