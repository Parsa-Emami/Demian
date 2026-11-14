<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signed store-to-store POST requests only. Browser/player tokens are not
 * accepted here. Timestamp window + durable nonce ledger block replay.
 */
final class AuthenticateCouponStore
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('demian-coupons.store_enabled'), 503, 'Store coupon API is disabled.');
        abort_unless($request->isSecure() || ! app()->environment('production'),
            403, 'HTTPS is required.');
        $key = config('demian-coupons.store_hmac_key');
        $store = config('demian-coupons.store_id');
        abort_unless(is_string($key) && preg_match('/^[A-Fa-f0-9]{64}$/D', $key)
            && is_string($store) && preg_match('/^[A-Za-z0-9._-]{1,40}$/D', $store),
            503, 'Store authentication is not configured.');

        $timestamp = $request->header('X-Demian-Timestamp');
        $nonce = $request->header('X-Demian-Nonce');
        $signature = $request->header('X-Demian-Signature');
        abort_unless(is_string($timestamp) && preg_match('/^[1-9][0-9]{9,10}$/D', $timestamp)
            && abs(now()->getTimestamp() - (int) $timestamp)
                <= (int) config('demian-coupons.signature_skew_seconds', 300)
            && is_string($nonce) && preg_match('/^[a-f0-9]{32}$/D', $nonce)
            && is_string($signature) && preg_match('/^[a-f0-9]{64}$/D', $signature),
            401, 'Store authentication failed.');

        // Canonical bytes: timestamp, nonce, HTTP method, literal path, body.
        // Do not parse/reserialize JSON before authenticating.
        $payload = $timestamp."\n".$nonce."\n".$request->method()
            ."\n/".$request->path()."\n".$request->getContent();
        $expected = hash_hmac('sha256', $payload, hex2bin($key));
        abort_unless(hash_equals($expected, $signature), 401,
            'Store authentication failed.');

        // Unique DB insert remains safe across PHP workers, hosts and restarts.
        // Keep nonce rows for more than the maximum accepted clock-skew window.
        $nonceHash = hash('sha256', $store.':'.$nonce);
        $accepted = DB::table('arcade_coupon_request_nonces')->insertOrIgnore([
            'nonce_hash' => $nonceHash,
            'expires_at' => now()->addMinutes(15),
            'created_at' => now(),
        ]);
        abort_unless($accepted === 1, 409, 'Store request replay rejected.');

        return $next($request);
    }
}
