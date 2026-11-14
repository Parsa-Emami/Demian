<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/** Separate, short-lived session, never the arcade player's bearer token. */
final class AuthenticateCafeCashier
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('demian-coupons.cafe_enabled') === true, 503);
        abort_unless(! app()->environment('production') || $request->isSecure(),
            403, 'Cashier portal requires HTTPS.');

        $id = $request->session()->get('cafe_staff_id');
        $version = $request->session()->get('cafe_staff_version');
        $time = $request->session()->get('cafe_authenticated_at');
        if (! is_int($id) || ! is_int($version) || ! is_int($time)
            || $time + 3600 * (int) config('demian-coupons.cafe_session_hours', 8)
                <= now()->timestamp) {
            $request->session()->forget(['cafe_staff_id', 'cafe_staff_version',
                'cafe_authenticated_at']);
            return redirect()->route('cashier.login');
        }
        $staff = DB::table('arcade_cashier_staff')->where('id', $id)->first();
        if (! $staff || ! $staff->is_active || (int) $staff->session_version !== $version) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return redirect()->route('cashier.login');
        }
        $request->attributes->set('cafe_staff', $staff);

        return $next($request);
    }
}
