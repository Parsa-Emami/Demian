<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\Arcade\CafeAccess;
use Symfony\Component\HttpFoundation\Response;

/** Separate, short-lived session, never the arcade player's bearer token. */
final class AuthenticateCafeCashier
{
    public function handle(Request $request, Closure $next): Response
    {
        $couponPortal = config('demian-coupons.cafe_enabled') === true;
        $managementOnly = ! $couponPortal && CafeAccess::portalAvailable() && $request->routeIs(
            'cashier.index', 'cashier.logout', 'cashier.browser-push', 'cashier.browser-push.publish',
            'cashier.business-analytics', 'cashier.referrals', 'cashier.referrals.cost', 'cashier.referrals.review',
        );
        abort_unless($couponPortal || $managementOnly, 503);
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
        if (! $staff || ! $staff->is_active || ! CafeAccess::knownRole($staff->role)
            || ($managementOnly && $staff->role !== 'super_admin')
            || (int) $staff->session_version !== $version) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return redirect()->route('cashier.login');
        }
        $request->attributes->set('cafe_staff', $staff);

        $response = $next($request);
        // The inspection page includes the customer's bearer coupon code.
        // Never allow a browser or intermediary to cache or frame it.
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        if (! $request->routeIs('studio') && ! $request->routeIs('characters.*')) {
            $response->headers->set('Content-Security-Policy',
                "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; "
                ."base-uri 'none'; frame-ancestors 'none'");
        } else {
            $response->headers->set('Referrer-Policy', 'no-referrer');
        }

        return $response;
    }
}
