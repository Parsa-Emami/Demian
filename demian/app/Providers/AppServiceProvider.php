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
        RateLimiter::for('arcade-player-rename', static fn (Request $request): Limit =>
            Limit::perMinute(5)->by('arcade:rename:'.self::arcadeTokenBucket($request)));

        // A destructive operation must have its own rate-limit bucket.
        // Numeric throttle:2,1 could share a guest/IP bucket with unrelated
        // arcade routes, causing a valid account deletion to be rate-limited.
        RateLimiter::for('arcade-profile-delete', static function (Request $request): Limit {
            $playerId = $request->attributes->get('arcade_player')?->id;
            $subject = $playerId ?: 'guest:'.$request->ip();

            return Limit::perMinute(2)->by('arcade-profile-delete:'.$subject);
        });
    }
}
