<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\View\View;

final class CashierController extends Controller
{
    public function loginForm(): View
    {
        abort_unless(config('demian-coupons.cafe_enabled') === true, 503);
        abort_unless(! app()->environment('production') || request()->isSecure(), 403);
        return view('cashier.login');
    }

    public function login(Request $request): RedirectResponse
    {
        abort_unless(config('demian-coupons.cafe_enabled') === true, 503);
        abort_unless(! app()->environment('production') || $request->isSecure(), 403);
        $data = $request->validate([
            'username' => ['required', 'string', 'min:3', 'max:64',
                'regex:/^[a-zA-Z][a-zA-Z0-9._-]*$/D'],
            'password' => ['required', 'string', 'max:256'],
        ]);
        $username = Str::lower($data['username']);
        $staff = DB::table('arcade_cashier_staff')->where('username', $username)->first();

        if (! $staff || ! $staff->is_active || ! CafeAccess::knownRole($staff->role) || ! Hash::check($data['password'], $staff->password_hash)) {
            return back()->withErrors([
                'username' => 'نام کاربری یا رمز عبور معتبر نیست.',
            ])->onlyInput('username');
        }

        $request->session()->regenerate();
        $request->session()->put([
            'cafe_staff_id' => (int) $staff->id,
            'cafe_staff_version' => (int) $staff->session_version,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
        DB::table('arcade_cashier_staff')->where('id', $staff->id)
            ->update(['last_login_at' => now()]);

        return redirect()->route('cashier.index');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect()->route('cashier.login');
    }

    public function index(Request $request): View
    {
        $staff = $request->attributes->get('cafe_staff');
        return view('cashier.index', ['staff' => $staff,
            'permissions' => CafeAccess::abilities($staff->role)]);
    }

    public function lookup(Request $request, InCafeCouponService $service): View
    {
        CafeAccess::authorize($request->attributes->get('cafe_staff'), 'coupon.lookup');
        $data = $request->validate([
            'code' => ['required', 'string', 'regex:/^DMC-[A-F0-9]{32}$/D'],
        ]);
        return view('cashier.inspect', [
            'staff' => $request->attributes->get('cafe_staff'),
            'details' => $service->inspect($data['code']),
            'code' => $data['code'],
            'requestKey' => (string) Str::uuid(),
            'canRedeem' => CafeAccess::allows($request->attributes->get('cafe_staff'), 'coupon.redeem'),
        ]);
    }

    public function redeem(Request $request, InCafeCouponService $service): RedirectResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'regex:/^DMC-[A-F0-9]{32}$/D'],
            'ticket_ref' => ['required', 'string', 'max:64',
                'regex:/^[A-Za-z0-9][A-Za-z0-9._:\/-]{3,63}$/D'],
            'subtotal_minor' => ['required', 'integer', 'min:1', 'max:1000000000000'],
            'request_key' => ['required', 'uuid'],
            'confirmed' => ['accepted'],
        ]);
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, 'coupon.redeem');
        $result = $service->redeem((int) $staff->id, $data['code'],
            $data['ticket_ref'], (int) $data['subtotal_minor'], $data['request_key']);

        return redirect()->route('cashier.index')->with('receipt', $result);
    }

    public function report(Request $request, InCafeCouponService $service): View
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, 'report.branch');
        return view('cashier.report', [
            'staff' => $staff,
            'records' => $service->recent($staff->branch_id),
            'global' => false,
        ]);
    }
}
