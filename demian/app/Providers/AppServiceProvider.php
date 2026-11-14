<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    /**
     * Throttling can execute before custom authentication middleware.
     * Never key an authenticated request bucket by a nullable player attribute.
     * Use the SHA-256 digest of the bearer instead: fixed length, no plaintext.
     */
    private static function arcadeTokenBucket(Request $request): string
    {
        $bearer = $request->bearerToken();
        return is_string($bearer) && preg_match('/^[A-Za-z0-9]{64}$/D', $bearer)
            ? 'token:'.hash('sha256', $bearer)
            : 'guest:'.$request->ip();
    }

    public function boot(): void
    {
        // Shared public IPs (schools, mobile carriers and game cafés) must not
        // cause unrelated authenticated players to compete for the same
        // 10/20 per-minute run submission bucket.
        RateLimiter::for('arcade-public-ip', static fn (Request $request): Limit =>
            Limit::perMinute(1200)->by('arcade:ip:'.$request->ip()));

        RateLimiter::for('arcade-registration', static fn (Request $request): array => [
            Limit::perMinute(60)->by('arcade:registration:minute:'.$request->ip()),
            Limit::perHour(180)->by('arcade:registration:hour:'.$request->ip()),
        ]);
        RateLimiter::for('arcade-run-start', static fn (Request $request): array => [
            Limit::perMinute(10)->by('arcade:start:player:'.self::arcadeTokenBucket($request)),
            Limit::perMinute(500)->by('arcade:start:ip:'.$request->ip()),
        ]);
        RateLimiter::for('arcade-run-complete', static fn (Request $request): array => [
            Limit::perMinute(20)->by('arcade:complete:player:'.self::arcadeTokenBucket($request)),
            Limit::perMinute(500)->by('arcade:complete:ip:'.$request->ip()),
        ]);
        RateLimiter::for('arcade-recovery-issue', static fn (Request $request): array => [
            Limit::perMinute(3)->by('arcade:short-recovery:'.self::arcadeTokenBucket($request)),
            Limit::perMinute(300)->by('arcade:short-recovery:ip:'.$request->ip()),
        ]);
        RateLimiter::for('arcade-backup-issue', static fn (Request $request): array => [
            Limit::perMinute(2)->by('arcade:backup:'.self::arcadeTokenBucket($request)),
            Limit::perMinute(300)->by('arcade:backup:ip:'.$request->ip()),
        ]);
        RateLimiter::for('arcade-account-recover', static function (Request $request): array {
            $code = $request->input('recovery_code');
            $digest = hash('sha256', is_string($code) ? $code : '');
            return [
                Limit::perMinute(3)->by('arcade:recover:capability:'.$digest),
                Limit::perMinute(60)->by('arcade:recover:ip:'.$request->ip()),
                Limit::perHour(180)->by('arcade:recover:hour:'.$request->ip()),
            ];
        });
        RateLimiter::for('arcade-player-rename', static fn (Request $request): Limit =>
            Limit::perMinute(5)->by('arcade:rename:'.self::arcadeTokenBucket($request)));

        // A destructive operation must have its own rate-limit bucket.
        // Numeric throttle:2,1 could share a guest/IP bucket with unrelated
        // arcade routes, causing a valid account deletion to be rate-limited.
        RateLimiter::for('arcade-profile-delete', static function (Request $request): Limit {
            $subject = self::arcadeTokenBucket($request);

            return Limit::perMinute(2)->by('arcade-profile-delete:'.$subject);
        });
        RateLimiter::for('arcade-coupon-owner', static fn (Request $request): Limit =>
            Limit::perMinute(10)->by('arcade:coupons:owner:'.self::arcadeTokenBucket($request)));
        RateLimiter::for('arcade-coupon-store', static fn (Request $request): array => [
            Limit::perMinute(240)->by('arcade:coupons:store:'.$request->ip()),
            Limit::perHour(2500)->by('arcade:coupons:store:hour:'.$request->ip()),
        ]);
    }
}
