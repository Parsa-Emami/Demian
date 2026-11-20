<?php

use App\Http\Controllers\CharacterController;
use App\Http\Controllers\CharacterStudioController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Cafe\CashierController;
use App\Http\Middleware\AuthenticateCafeCashier;
use App\Http\Middleware\RequireCafePermission;
use App\Http\Controllers\Cafe\CafeAdminController;
use App\Http\Controllers\Cafe\CafeGiftController;
use App\Http\Controllers\Cafe\CafeAntiCheatController;
use App\Http\Controllers\Cafe\CafeRewardCampaignController;
use App\Http\Controllers\Cafe\CafeCouponSupportController;
use App\Http\Controllers\Cafe\CafeObservabilityController;

// Authorized cafe staff use Laravel's CSRF-protected web session middleware,
// including when the API host is in API-only mode. Never open character studio.
Route::get('/admin', fn () => redirect()->route(
    session()->has('cafe_staff_id') ? 'cashier.index' : 'cashier.login'
))->name('cafe.admin');

Route::get('/t/{code}',[\App\Http\Controllers\Cafe\PublicTableController::class,'show'])
    ->where('code','[a-f0-9]{32}')->middleware('throttle:120,1,table-landing')->name('table.show');
Route::post('/t/{code}',[\App\Http\Controllers\Cafe\PublicTableController::class,'launch'])
    ->where('code','[a-f0-9]{32}')->middleware('throttle:120,1,table-launch')->name('table.launch');

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
        Route::get('/admin/players', [CafeAdminController::class, 'players'])
            ->middleware(RequireCafePermission::class.':staff.directory')->name('players');
        Route::get('/admin/players/{player}', [CafeAdminController::class, 'player'])
            ->whereUuid('player')->middleware(RequireCafePermission::class.':staff.directory')->name('players.show');
        Route::get('/admin/staff', [CafeAdminController::class, 'directory'])
            ->middleware(RequireCafePermission::class.':staff.directory')->name('staff');
        Route::post('/admin/staff/{subjectId}/{operation}',
            [CafeAdminController::class, 'setStaffActive'])
            ->whereNumber('subjectId')->whereIn('operation', ['enable', 'disable'])
            ->middleware('throttle:arcade-cashier-admin')->name('staff.action');
        Route::get('/admin/quiet-hours',[\App\Http\Controllers\Cafe\CafeQuietHoursController::class,'index'])
            ->middleware(RequireCafePermission::class.':coupon.revoke')->name('quiet-hours');
        Route::post('/admin/quiet-hours',[\App\Http\Controllers\Cafe\CafeQuietHoursController::class,'create'])
            ->middleware([RequireCafePermission::class.':coupon.revoke','throttle:arcade-cashier-admin'])->name('quiet-hours.create');
        Route::post('/admin/quiet-hours/{offerId}/pause',[\App\Http\Controllers\Cafe\CafeQuietHoursController::class,'pause'])
            ->whereNumber('offerId')->middleware([RequireCafePermission::class.':coupon.revoke','throttle:arcade-cashier-admin'])->name('quiet-hours.pause');
        Route::get('/admin/tables',[\App\Http\Controllers\Cafe\CafeTableController::class,'index'])
            ->middleware(RequireCafePermission::class.':report.global')->name('tables');
        Route::post('/admin/tables',[\App\Http\Controllers\Cafe\CafeTableController::class,'create'])
            ->middleware([RequireCafePermission::class.':report.global','throttle:arcade-cashier-admin'])->name('tables.create');
        Route::get('/admin/tables/{tableId}/print',[\App\Http\Controllers\Cafe\CafeTableController::class,'print'])
            ->whereNumber('tableId')->middleware([RequireCafePermission::class.':report.global','throttle:30,1'])->name('tables.print');
        Route::post('/admin/tables/{tableId}/{action}',[\App\Http\Controllers\Cafe\CafeTableController::class,'change'])
            ->whereNumber('tableId')->whereIn('action',['enable','disable','rotate'])
            ->middleware([RequireCafePermission::class.':report.global','throttle:arcade-cashier-admin'])->name('tables.change');
        Route::get('/admin/analytics', \App\Http\Controllers\Cafe\CafeBusinessAnalyticsController::class)
            ->middleware([RequireCafePermission::class.':report.global','throttle:6,1'])->name('business-analytics');
        Route::get('/admin/referrals', \App\Http\Controllers\Cafe\CafeReferralController::class)
            ->middleware(RequireCafePermission::class.':report.global')->name('referrals');
        Route::post('/admin/referrals/cost', [\App\Http\Controllers\Cafe\CafeReferralController::class,'cost'])
            ->middleware([RequireCafePermission::class.':report.global','throttle:arcade-cashier-admin'])->name('referrals.cost');
        Route::post('/admin/referrals/review', [\App\Http\Controllers\Cafe\CafeReferralController::class,'review'])
            ->middleware([RequireCafePermission::class.':report.global','throttle:arcade-cashier-admin'])->name('referrals.review');
        Route::get('/admin/reports/global', [CafeAdminController::class, 'globalReport'])
            ->middleware(RequireCafePermission::class.':report.global')->name('report.global');
        Route::post('/admin/coupons/revoke', [CafeAdminController::class, 'revoke'])
            ->middleware([RequireCafePermission::class.':coupon.revoke',
                'throttle:arcade-cashier-admin'])->name('coupons.revoke');
        // Phase 11: gift issuance is a sub-operation of the 8th top-level
        // permission, coupon management. No additional admin grant is added.
        Route::get('/admin/gifts', [CafeGiftController::class, 'index'])
            ->middleware(RequireCafePermission::class.':coupon.revoke')->name('gifts');
        Route::post('/admin/gifts/issue', [CafeGiftController::class, 'issue'])
            ->middleware([RequireCafePermission::class.':coupon.revoke',
                'throttle:arcade-cashier-admin'])->name('gifts.issue');
        Route::get('/admin/coupon-support', [CafeCouponSupportController::class, 'index'])
            ->middleware(RequireCafePermission::class.':coupon.revoke')
            ->name('coupon-support');
        Route::post('/admin/coupon-support/{caseId}/decision',
            [CafeCouponSupportController::class, 'decide'])
            ->whereNumber('caseId')
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])
            ->name('coupon-support.decide');
        Route::get('/admin/campaigns', [CafeRewardCampaignController::class, 'index'])
            ->middleware(RequireCafePermission::class.':coupon.revoke')->name('campaigns');
        Route::post('/admin/campaigns', [CafeRewardCampaignController::class, 'create'])
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])->name('campaigns.create');
        Route::post('/admin/campaigns/{campaignId}/revise',
            [CafeRewardCampaignController::class, 'revise'])
            ->whereNumber('campaignId')
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])->name('campaigns.revise');
        Route::post('/admin/campaigns/{campaignId}/import',
            [CafeRewardCampaignController::class, 'import'])
            ->whereNumber('campaignId')
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])->name('campaigns.import');
        Route::post('/admin/campaigns/{campaignId}/measure', [CafeRewardCampaignController::class, 'measure'])
            ->whereNumber('campaignId')
            ->middleware(['throttle:arcade-cashier-admin', RequireCafePermission::class.':coupon.revoke'])
            ->name('campaigns.measure');
        Route::post('/admin/campaigns/{campaignId}/{action}',
            [CafeRewardCampaignController::class, 'transition'])
            ->whereNumber('campaignId')->whereIn('action', ['activate', 'pause', 'close'])
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])->name('campaigns.transition');
        Route::post('/admin/campaigns/inventory/void',
            [CafeRewardCampaignController::class, 'voidCode'])
            ->middleware(['throttle:arcade-cashier-admin',
                RequireCafePermission::class.':coupon.revoke'])->name('campaigns.void');
        // Anti-cheat reads reuse existing ledger-audit capability; privileged
        // decisions require super-admin fresh password and CSRF.
        Route::get('/admin/anti-cheat', [CafeAntiCheatController::class, 'index'])
            ->middleware(RequireCafePermission::class.':audit.ledger')
            ->name('anticheat');
        Route::post('/admin/anti-cheat/review',
            [CafeAntiCheatController::class, 'review'])
            ->middleware([RequireCafePermission::class.':audit.ledger',
                'throttle:arcade-cashier-admin'])->name('anticheat.review');
        Route::post('/admin/anti-cheat/hold',
            [CafeAntiCheatController::class, 'hold'])
            ->middleware([RequireCafePermission::class.':audit.ledger',
                'throttle:arcade-cashier-admin'])->name('anticheat.hold');
        Route::get('/admin/audit', [CafeAdminController::class, 'audit'])
            ->middleware(RequireCafePermission::class.':audit.ledger')->name('audit');
        Route::get('/admin/observability', CafeObservabilityController::class)
            ->middleware(RequireCafePermission::class.':operations.readiness')
            ->name('observability');
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
